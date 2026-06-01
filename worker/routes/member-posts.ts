import { asc, sql } from "drizzle-orm";
import { members, naverCafeSources } from "../../src/db/schema";
import { authenticateRequest, requireAdminUser } from "../auth";
import { getDb } from "../db";
import {
  fetchNaverCafePostsForSources,
  NaverCafeApiError,
} from "../services/naver-cafe";
import {
  extractXHandleFromUrl,
  fetchXPostsForHandles,
  XApiError,
} from "../services/x";
import { badRequest, getSetting, json, methodNotAllowed } from "../utils/helpers";
import type { Env, XPostItem } from "../types";

const MEMBER_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=900, stale-while-revalidate=1800";
const PRIVATE_MEMBER_POSTS_CACHE_CONTROL = "no-store";

type Visibility = "public" | "members" | "private";

const normalizeVisibility = (value: string | null | undefined): Visibility =>
  value === "public" || value === "private" ? value : "members";

const parseBoundedInt = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) => {
  if (value === null || value.trim() === "") return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

const parseSources = (value: string | null) => {
  const requested = new Set(
    (value || "x,naver-cafe")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const includeX = requested.has("x");
  const includeNaverCafe =
    requested.has("naver-cafe") || requested.has("cafe");
  return { includeX, includeNaverCafe };
};

const readPostConfigs = async (db: ReturnType<typeof getDb>) => {
  const [
    xVisibility,
    richXLinkPreview,
    naverCafeEnabled,
    naverCafeVisibility,
  ] = await Promise.all([
    getSetting(db, "x_posts_visibility"),
    getSetting(db, "x_rich_link_preview_enabled"),
    getSetting(db, "naver_cafe_posts_enabled"),
    getSetting(db, "naver_cafe_posts_visibility"),
  ]);

  return {
    x: {
      visibility: normalizeVisibility(xVisibility),
      richLinkPreviewEnabled: richXLinkPreview === "true",
    },
    naverCafe: {
      enabled: naverCafeEnabled !== "false",
      visibility: normalizeVisibility(naverCafeVisibility),
    },
  };
};

const getMemberPostsCacheControl = ({
  force,
  adminView,
  includeX,
  includeNaverCafe,
  configs,
}: {
  force: boolean;
  adminView: boolean;
  includeX: boolean;
  includeNaverCafe: boolean;
  configs: Awaited<ReturnType<typeof readPostConfigs>>;
}) => {
  if (force || adminView) return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  if (includeX && configs.x.visibility !== "public") {
    return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  }
  if (
    includeNaverCafe &&
    (!configs.naverCafe.enabled || configs.naverCafe.visibility !== "public")
  ) {
    return PRIVATE_MEMBER_POSTS_CACHE_CONTROL;
  }
  return MEMBER_POSTS_CACHE_CONTROL;
};

const getActiveMemberRows = (db: ReturnType<typeof getDb>) =>
  db
    .select()
    .from(members)
    .where(sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`)
    .orderBy(asc(members.uid));

const mapXPostMemberUid = (
  post: XPostItem,
  handleToMemberUid: Map<string, number>,
) => ({
  ...post,
  memberUid: handleToMemberUid.get(post.username.toLowerCase()),
});

const emptyX = (error: string | null = null) => ({
  updatedAt: new Date().toISOString(),
  posts: [],
  byHandle: [],
  error,
});

const emptyNaverCafe = (error: string | null = null) => ({
  updatedAt: new Date().toISOString(),
  posts: [],
  sources: [],
  error,
});

export const handleMemberPosts = async (request: Request, env: Env) => {
  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const url = new URL(request.url);
  const { includeX, includeNaverCafe } = parseSources(
    url.searchParams.get("sources"),
  );
  if (!includeX && !includeNaverCafe) {
    return badRequest("sources must include x or naver-cafe");
  }

  const maxResults = parseBoundedInt(url.searchParams.get("maxResults"), 10, 5, 20);
  const size = parseBoundedInt(url.searchParams.get("size"), 10, 5, 20);
  if (maxResults === null) {
    return badRequest("maxResults must be an integer between 5 and 20");
  }
  if (size === null) {
    return badRequest("size must be an integer between 5 and 20");
  }

  const db = getDb(env);
  const force = url.searchParams.has("_") || request.cache === "no-store";
  const adminView = url.searchParams.get("admin") === "1";
  const configs = await readPostConfigs(db);

  if (adminView) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  } else {
    const needsMemberAuth =
      (includeX && configs.x.visibility === "members") ||
      (includeNaverCafe &&
        configs.naverCafe.enabled &&
        configs.naverCafe.visibility === "members");

    if (needsMemberAuth) {
      const auth = await authenticateRequest(request, env);
      if (!auth.ok) return auth.response;
    }
  }

  const [memberRows, cafeSources] = await Promise.all([
    includeX ? getActiveMemberRows(db) : Promise.resolve([]),
    includeNaverCafe
      ? db
          .select()
          .from(naverCafeSources)
          .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name))
      : Promise.resolve([]),
  ]);

  const handlePairs = memberRows
    .map((member) => {
      const handle = extractXHandleFromUrl(member.url_twitter);
      return handle ? { handle, memberUid: member.uid } : null;
    })
    .filter((item): item is { handle: string; memberUid: number } =>
      Boolean(item),
    );
  const handleToMemberUid = new Map(
    handlePairs.map((item) => [item.handle.toLowerCase(), item.memberUid]),
  );
  const handles = Array.from(new Set(handlePairs.map((item) => item.handle)));

  const [x, naverCafe] = await Promise.all([
    (async () => {
      if (!includeX) return emptyX();
      if (configs.x.visibility === "private" && !adminView) {
        return emptyX("X posts are private");
      }
      if (handles.length === 0) return emptyX();

      try {
        const content = await fetchXPostsForHandles(handles, {
          bearerToken: env.X_BEARER_TOKEN,
          cacheDb: env.otw_db,
          maxResults,
          richXLinkPreviewEnabled: configs.x.richLinkPreviewEnabled,
          forceRefresh: force,
        });
        return {
          updatedAt: new Date().toISOString(),
          posts: content.posts.map((post) =>
            mapXPostMemberUid(post, handleToMemberUid),
          ),
          byHandle: content.byHandle.map((item) => ({
            ...item,
            posts: item.posts.map((post) =>
              mapXPostMemberUid(post, handleToMemberUid),
            ),
          })),
          error: null,
        };
      } catch (error) {
        if (error instanceof XApiError) {
          return emptyX(error.message);
        }
        console.error("Failed to aggregate X posts", error);
        return emptyX("Failed to fetch X posts");
      }
    })(),
    (async () => {
      if (!includeNaverCafe) return emptyNaverCafe();
      if (!configs.naverCafe.enabled && !adminView) {
        return emptyNaverCafe("Naver Cafe posts are disabled");
      }
      if (configs.naverCafe.visibility === "private" && !adminView) {
        return emptyNaverCafe("Naver Cafe posts are private");
      }
      if (cafeSources.length === 0) return emptyNaverCafe();

      try {
        const content = await fetchNaverCafePostsForSources(cafeSources, {
          size,
        });
        return {
          updatedAt: new Date().toISOString(),
          ...content,
          error: null,
        };
      } catch (error) {
        if (error instanceof NaverCafeApiError) {
          return emptyNaverCafe(error.message);
        }
        console.error("Failed to aggregate Naver Cafe posts", error);
        return emptyNaverCafe("Failed to fetch Naver Cafe posts");
      }
    })(),
  ]);

  const posts = [
    ...x.posts.map((post) => ({
      kind: "x" as const,
      id: `x:${post.id}`,
      createdAt: post.createdAt,
      memberUid: post.memberUid ?? null,
      post,
    })),
    ...naverCafe.posts.map((post) => ({
      kind: "cafe" as const,
      id: `cafe:${post.id}`,
      createdAt: post.createdAt,
      memberUid: post.memberUid,
      post,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return json(
    {
      updatedAt: new Date().toISOString(),
      posts,
      x,
      naverCafe,
    },
    200,
    {
      headers: {
        "Cache-Control": getMemberPostsCacheControl({
          force,
          adminView,
          includeX,
          includeNaverCafe,
          configs,
        }),
      },
    },
  );
};
