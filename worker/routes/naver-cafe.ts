import { asc, eq } from "drizzle-orm";
import { naverCafeSources, type NaverCafeSource } from "../../src/db/schema";
import { authenticateRequest, requireAdminUser } from "../auth";
import {
  buildNaverCafeBoardUrl,
  extractNaverCafeBoardIds,
  isValidNaverCafeId,
} from "../../src/lib/naver-cafe";
import { getDb } from "../db";
import {
  badRequest,
  getSetting,
  json,
  methodNotAllowed,
  parseNumericId,
} from "../utils/helpers";
import {
  fetchNaverCafePostsForSources,
  NaverCafeApiError,
} from "../services/naver-cafe";
import type { Env } from "../types";

const NAVER_CAFE_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=1800";
const NAVER_CAFE_AUTHENTICATED_POSTS_CACHE_CONTROL = "no-store";
const NAVER_CAFE_POSTS_ENABLED_SETTING_KEY = "naver_cafe_posts_enabled";
const NAVER_CAFE_POSTS_VISIBILITY_SETTING_KEY = "naver_cafe_posts_visibility";
const NAVER_CAFE_POSTS_RESPONSE_CACHE_VERSION = "v1";

type NaverCafePostsVisibility = "public" | "members" | "private";

const normalizeVisibility = (
  value: string | null | undefined,
): NaverCafePostsVisibility =>
  value === "public" || value === "private" ? value : "members";

const getConfig = async (db: ReturnType<typeof getDb>) => {
  try {
    const enabled =
      (await getSetting(db, NAVER_CAFE_POSTS_ENABLED_SETTING_KEY)) !== "false";
    const visibility = normalizeVisibility(
      await getSetting(db, NAVER_CAFE_POSTS_VISIBILITY_SETTING_KEY),
    );
    return { enabled, visibility };
  } catch (error) {
    console.warn("Failed to read Naver Cafe posts config", error);
    return { enabled: true, visibility: "members" as const };
  }
};

const parseSize = (value: string | null) => {
  if (value === null || value.trim() === "") return 10;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 5 && parsed <= 20 ? parsed : null;
};

const parseBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === 1) return true;
  if (value === "false" || value === "0" || value === 0) return false;
  return fallback;
};

const parseSortOrder = (value: unknown) => {
  if (value === undefined || value === null || value === "") return 0;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).trim(), 10);
  return Number.isInteger(parsed) ? Math.max(0, Math.min(parsed, 9999)) : null;
};

const parseMemberUid = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value).trim(), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const shouldBypassPostsResponseCache = (request: Request, url: URL) =>
  url.searchParams.has("_") || request.cache === "no-store";

const canUsePostsResponseCache = ({
  adminView,
  request,
  url,
  visibility,
}: {
  adminView: boolean;
  request: Request;
  url: URL;
  visibility: NaverCafePostsVisibility;
}) =>
  !adminView &&
  visibility === "public" &&
  !shouldBypassPostsResponseCache(request, url);

const getPostsResponseHeaders = ({
  adminView,
  visibility,
}: {
  adminView: boolean;
  visibility: NaverCafePostsVisibility;
}): Record<string, string> => {
  if (!adminView && visibility === "public") {
    return { "Cache-Control": NAVER_CAFE_POSTS_CACHE_CONTROL };
  }

  return {
    "Cache-Control": NAVER_CAFE_AUTHENTICATED_POSTS_CACHE_CONTROL,
    Vary: "Authorization",
  };
};

const getPostsResponseCacheKey = (
  sources: NaverCafeSource[],
  size: number,
) => {
  const sourceSignature = sources
    .map((source) =>
      [
        source.id,
        source.cafe_id,
        source.menu_id,
        source.enabled === false ? "0" : "1",
        source.sort_order ?? 0,
        source.updated_at ?? "",
      ].join(":"),
    )
    .join("|");
  const cacheUrl = new URL(
    `https://otw.internal/cache/naver-cafe/posts/${NAVER_CAFE_POSTS_RESPONSE_CACHE_VERSION}`,
  );
  cacheUrl.searchParams.set("size", String(size));
  cacheUrl.searchParams.set("sources", sourceSignature);
  return new Request(cacheUrl.toString(), { method: "GET" });
};

const getPostsResponseCache = () => {
  if (typeof caches === "undefined") return null;
  return caches.default;
};

const readPostsResponseCache = async (cacheKey: Request) => {
  const cache = getPostsResponseCache();
  if (!cache) return null;

  try {
    return await cache.match(cacheKey);
  } catch (error) {
    console.warn("Failed to read Naver Cafe posts response cache", error);
    return null;
  }
};

const writePostsResponseCache = async (
  cacheKey: Request,
  response: Response,
) => {
  const cache = getPostsResponseCache();
  if (!cache) return;

  try {
    await cache.put(cacheKey, response.clone());
  } catch (error) {
    console.warn("Failed to write Naver Cafe posts response cache", error);
  }
};

const parseSourcePayload = (body: Record<string, unknown>) => {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const cafeUrl = typeof body.cafe_url === "string" ? body.cafe_url.trim() : "";
  const extracted = extractNaverCafeBoardIds(cafeUrl);
  const cafeId =
    typeof body.cafe_id === "string" && body.cafe_id.trim()
      ? body.cafe_id.trim()
      : extracted?.cafeId ?? "";
  const menuId =
    typeof body.menu_id === "string" && body.menu_id.trim()
      ? body.menu_id.trim()
      : extracted?.menuId ?? "";
  const sortOrder = parseSortOrder(body.sort_order);

  if (!name || name.length > 80) {
    return badRequest("name is required and must be 80 characters or fewer");
  }
  if (!isValidNaverCafeId(cafeId)) {
    return badRequest("Invalid cafe_id");
  }
  if (!isValidNaverCafeId(menuId)) {
    return badRequest("Invalid menu_id");
  }
  if (sortOrder === null) {
    return badRequest("Invalid sort_order");
  }

  return {
    name,
    cafe_id: cafeId,
    menu_id: menuId,
    cafe_url: cafeUrl || buildNaverCafeBoardUrl(cafeId, menuId),
    member_uid: parseMemberUid(body.member_uid),
    enabled: parseBoolean(body.enabled, true),
    sort_order: sortOrder,
    updated_at: Date.now().toString(),
  };
};

export const handleNaverCafe = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const db = getDb(env);

  if (url.pathname === "/api/naver-cafe/config") {
    if (request.method !== "GET") return methodNotAllowed();
    return json(await getConfig(db), 200, {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  }

  if (url.pathname === "/api/naver-cafe/sources") {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;

    if (request.method === "GET") {
      const sources = await db
        .select()
        .from(naverCafeSources)
        .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));
      return Response.json(sources);
    }

    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const payload = parseSourcePayload(body);
      if (payload instanceof Response) return payload;

      const result = await db.insert(naverCafeSources).values(payload);
      return result.success
        ? new Response("Created", { status: 201 })
        : new Response("Failed to create", { status: 500 });
    }

    if (request.method === "PUT") {
      const body = (await request.json()) as Record<string, unknown>;
      const id = parseNumericId(body.id as string | number | undefined);
      if (id === null) return badRequest("Invalid id");

      const payload = parseSourcePayload(body);
      if (payload instanceof Response) return payload;

      const result = await db
        .update(naverCafeSources)
        .set(payload)
        .where(eq(naverCafeSources.id, id));
      return result.success
        ? new Response("Updated", { status: 200 })
        : new Response("Failed to update", { status: 500 });
    }

    if (request.method === "DELETE") {
      const id = parseNumericId(url.searchParams.get("id"));
      if (id === null) return badRequest("Invalid id");

      const result = await db
        .delete(naverCafeSources)
        .where(eq(naverCafeSources.id, id));
      return result.success
        ? new Response("Deleted", { status: 200 })
        : new Response("Failed to delete", { status: 500 });
    }

    return methodNotAllowed();
  }

  if (url.pathname === "/api/naver-cafe/posts") {
    if (request.method !== "GET") return methodNotAllowed();

    const adminView = url.searchParams.get("admin") === "1";
    const { enabled, visibility } = await getConfig(db);
    const responseHeaders = getPostsResponseHeaders({ adminView, visibility });
    if (adminView) {
      const admin = await requireAdminUser(request, env);
      if (!admin.ok) return admin.response;
    } else if (!enabled || visibility === "private") {
      return new Response("Naver Cafe posts are private", { status: 403 });
    } else if (visibility === "members") {
      const auth = await authenticateRequest(request, env);
      if (!auth.ok) return auth.response;
    }

    const size = parseSize(url.searchParams.get("size"));
    if (size === null) {
      return badRequest("size must be an integer between 5 and 20");
    }

    const sources = await db
      .select()
      .from(naverCafeSources)
      .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));

    if (sources.length === 0) {
      const response = json(
        {
          updatedAt: new Date().toISOString(),
          posts: [],
          sources: [],
        },
        200,
        { headers: responseHeaders },
      );
      return response;
    }

    const responseCacheKey = canUsePostsResponseCache({
      adminView,
      request,
      url,
      visibility,
    })
      ? getPostsResponseCacheKey(sources, size)
      : null;
    const cachedResponse = responseCacheKey
      ? await readPostsResponseCache(responseCacheKey)
      : null;
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const content = await fetchNaverCafePostsForSources(sources, { size });
      const response = json(
        {
          updatedAt: new Date().toISOString(),
          ...content,
        },
        200,
        { headers: responseHeaders },
      );
      if (responseCacheKey) {
        await writePostsResponseCache(responseCacheKey, response);
      }
      return response;
    } catch (error) {
      if (error instanceof NaverCafeApiError) {
        console.error("Failed to handle /api/naver-cafe/posts", {
          status: error.status,
          diagnostics: error.diagnostics,
        });
        return new Response(error.message, { status: error.status });
      }
      console.error("Failed to handle /api/naver-cafe/posts", error);
      return new Response("Failed to fetch Naver Cafe posts", { status: 502 });
    }
  }

  return new Response(null, { status: 404 });
};
