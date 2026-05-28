import { authenticateRequest } from "../auth";
import { fetchXPostsForHandles, XApiError } from "../services/x";
import { badRequest, json, methodNotAllowed } from "../utils/helpers";
import type { Env } from "../types";

const X_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";
const X_RICH_LINK_PREVIEW_SETTING_KEY = "x_rich_link_preview_enabled";
const X_POSTS_VISIBILITY_SETTING_KEY = "x_posts_visibility";
const HANDLE_PATTERN = /^[A-Za-z0-9_]{1,15}$/;

type XPostsVisibility = "public" | "members" | "private";

const parseHandles = (value: string | null) => {
  if (!value) return null;
  const handles = Array.from(
    new Set(
      value
        .split(",")
        .map((handle) => handle.trim())
        .filter(Boolean),
    ),
  );
  return handles.length > 0 ? handles : null;
};

const parseMaxResults = (value: string | null) => {
  if (value === null || value.trim() === "") return 10;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed < 5 || parsed > 20) {
    return null;
  }
  return parsed;
};

const getXErrorPayload = (error: XApiError) => ({
  error: error.code ?? "x_api_error",
  message: error.message,
  status: error.status,
  sourceStatus: error.sourceStatus,
  detail: error.detail,
  diagnostics: error.diagnostics,
});

const readSetting = async (db: D1Database, key: string) => {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string | null }>();
  return row?.value ?? null;
};

const normalizeXPostsVisibility = (
  value: string | null | undefined,
): XPostsVisibility =>
  value === "public" || value === "private" ? value : "members";

const getXPostsVisibility = async (db: D1Database) => {
  try {
    return normalizeXPostsVisibility(
      await readSetting(db, X_POSTS_VISIBILITY_SETTING_KEY),
    );
  } catch (error) {
    console.warn("Failed to read X posts visibility setting", error);
    return "members";
  }
};

const getRichXLinkPreviewEnabled = async (db: D1Database) => {
  try {
    return (await readSetting(db, X_RICH_LINK_PREVIEW_SETTING_KEY)) !== "false";
  } catch (error) {
    console.warn("Failed to read X rich link preview setting", error);
    return true;
  }
};

export const handleXPosts = async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";

  if (url.pathname === "/api/x/config") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    return json(
      {
        visibility: await getXPostsVisibility(env.otw_db),
      },
      200,
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  }

  if (!url.pathname.startsWith("/api/x/posts")) {
    return new Response(null, { status: 404 });
  }

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const visibility = await getXPostsVisibility(env.otw_db);
  if (visibility === "private") {
    return new Response("Member posts are private", { status: 403 });
  }

  if (visibility === "members") {
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) return auth.response;
  }

  const handles = parseHandles(url.searchParams.get("handles"));
  if (!handles) {
    return badRequest("handles query required");
  }

  const invalidHandle = handles.find((handle) => !HANDLE_PATTERN.test(handle));
  if (invalidHandle) {
    return badRequest(`Invalid X handle: ${invalidHandle}`);
  }

  const maxResults = parseMaxResults(url.searchParams.get("maxResults"));
  if (maxResults === null) {
    return badRequest("maxResults must be an integer between 5 and 20");
  }

  try {
    const richXLinkPreviewEnabled = await getRichXLinkPreviewEnabled(env.otw_db);
    const content = await fetchXPostsForHandles(handles, {
      bearerToken: env.X_BEARER_TOKEN,
      cacheDb: env.otw_db,
      maxResults,
      richXLinkPreviewEnabled,
    });
    return json(
      {
        updatedAt: new Date().toISOString(),
        ...content,
      },
      200,
      {
        headers: { "Cache-Control": X_POSTS_CACHE_CONTROL },
      },
    );
  } catch (error) {
    if (error instanceof XApiError) {
      console.error("Failed to handle /api/x/posts", getXErrorPayload(error));
      if (debug) {
        return json(getXErrorPayload(error), error.status, {
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (error.status === 500) {
        return new Response(error.message, { status: 500 });
      }
      return new Response("Failed to fetch X posts", { status: error.status });
    }
    console.error("Failed to handle /api/x/posts", error);
    return new Response("Failed to fetch X posts", { status: 502 });
  }
};
