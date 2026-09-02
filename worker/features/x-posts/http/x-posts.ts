import { authenticateRequest, requireAdminUser } from "../../../platform/auth";
import { badRequest, getActorInfo, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseXHandleTargets,
  parseXMaxResults,
} from "../domain/handle-targets";
import {
  XAllowlistUnavailableError,
  XPostFeedError,
  XReplyContextNotFoundError,
  XTargetsNotAllowedError,
  type XPostsApplication,
} from "../application/x-posts-service";

const X_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";
const X_AUTHENTICATED_POSTS_CACHE_CONTROL = "no-store";
const X_POST_ID_PATTERN = /^[1-9]\d{4,24}$/;
type XPostsVisibility = "public" | "members" | "private";

export type BuildXPostsApplication = (env: Env) => XPostsApplication;

const getXErrorPayload = (error: XPostFeedError) => ({
  error: error.code ?? "x_api_error",
  message: error.message,
  status: error.status,
  sourceStatus: error.sourceStatus,
  detail: error.detail,
  diagnostics: error.diagnostics,
});

const getXPostsCacheHeaders = ({
  adminView,
  debug,
  visibility,
}: {
  adminView: boolean;
  debug: boolean;
  visibility: XPostsVisibility;
}): Record<string, string> => {
  if (!adminView && !debug && visibility === "public") {
    return { "Cache-Control": X_POSTS_CACHE_CONTROL };
  }

  return {
    "Cache-Control": X_AUTHENTICATED_POSTS_CACHE_CONTROL,
    Vary: "Authorization",
  };
};

const authorizeXRead = async ({
  request,
  env,
  visibility,
  adminView,
}: {
  request: Request;
  env: Env;
  visibility: XPostsVisibility;
  adminView: boolean;
}) => {
  if (adminView) {
    const admin = await requireAdminUser(request, env);
    return admin.ok ? null : admin.response;
  }
  if (visibility === "private") {
    return new Response("Member posts are private", { status: 403 });
  }
  if (visibility === "members") {
    const auth = await authenticateRequest(request, env);
    return auth.ok ? null : auth.response;
  }
  return null;
};

const parseBoundedInteger = (value: string | null, fallback: number, minimum: number, maximum: number) => {
  if (value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
};

const parseHistoryCursor = (value: string | null) => {
  if (!value) return null;
  const match = value.match(/^(\d{1,16}):([1-9]\d{4,24})$/);
  if (!match) return undefined;
  const createdAt = Number(match[1]);
  return Number.isSafeInteger(createdAt) && createdAt > 0
    ? { createdAt, postId: match[2]! }
    : undefined;
};

export const createXPostsHandler =
  (buildApplication: BuildXPostsApplication) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  const adminView = url.searchParams.get("admin") === "1";
  const contextMatch = url.pathname.match(/^\/api\/x\/posts\/([^/]+)\/context$/);
  const postMatch = url.pathname.match(/^\/api\/x\/posts\/([^/]+)$/);
  const application = buildApplication(env);

  if (url.pathname === "/api/x/config") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }
    return json(
      {
        visibility: await application.readVisibility(),
      },
      200,
      {
        headers: { "Cache-Control": "public, max-age=60" },
      },
    );
  }

  if (["/api/x/history/posts", "/api/x/history/health"].includes(url.pathname)) {
    if (request.method !== "GET") return methodNotAllowed();
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    if (url.pathname === "/api/x/history/posts") {
      const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 100);
      const memberUid = parseBoundedInteger(url.searchParams.get("memberUid"), 0, 1, Number.MAX_SAFE_INTEGER);
      const from = url.searchParams.get("from") ? Date.parse(url.searchParams.get("from")!) : null;
      const to = url.searchParams.get("to") ? Date.parse(url.searchParams.get("to")!) : null;
      const cursor = parseHistoryCursor(url.searchParams.get("cursor"));
      if (limit === null || memberUid === null || (from !== null && !Number.isFinite(from)) ||
        (to !== null && !Number.isFinite(to)) || cursor === undefined) {
        return badRequest("Invalid X history query");
      }
      return json(await application.readHistoryPosts({
        memberUid: memberUid || undefined,
        from: from ?? undefined,
        to: to ?? undefined,
        cursor: cursor ?? undefined,
        limit,
      }), 200, { headers: { "Cache-Control": "no-store" } });
    }
    return json(await application.readHistoryHealth(), 200, { headers: { "Cache-Control": "no-store" } });
  }

  if (url.pathname !== "/api/x/posts" && !contextMatch && !postMatch) {
    return new Response(null, { status: 404 });
  }

  if (postMatch && request.method === "DELETE") {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    const postId = postMatch[1] ?? "";
    if (!X_POST_ID_PATTERN.test(postId)) {
      return badRequest("id must be a numeric X post id");
    }
    const redacted = await application.redactPost(
      postId,
      getActorInfo(request, admin.user),
    );
    return redacted
      ? new Response("Redacted", { status: 200 })
      : new Response("Post not found", { status: 404 });
  }

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const visibility = await application.readVisibility();
  const authResponse = await authorizeXRead({
    request,
    env,
    visibility,
    adminView: debug || adminView,
  });
  if (authResponse) return authResponse;

  if (contextMatch) {
    const sourcePostId = contextMatch[1] ?? "";
    if (!X_POST_ID_PATTERN.test(sourcePostId)) {
      return badRequest("id must be a numeric X post id");
    }

    try {
      const content = await application.readReplyContext(sourcePostId);
      return json(content, 200, {
        headers: getXPostsCacheHeaders({ adminView, debug, visibility }),
      });
    } catch (error) {
      if (error instanceof XReplyContextNotFoundError) {
        return new Response("Related X post was not found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (error instanceof XAllowlistUnavailableError) {
        return new Response(error.message, {
          status: 503,
          headers: { "Cache-Control": "no-store" },
        });
      }
      if (error instanceof XPostFeedError) {
        console.error("Failed to handle X reply context", getXErrorPayload(error));
        if (debug) {
          return json(getXErrorPayload(error), error.status, {
            headers: { "Cache-Control": "no-store" },
          });
        }
        return new Response("Failed to fetch related X post", {
          status: error.status,
          headers: { "Cache-Control": "no-store" },
        });
      }
      console.error("Failed to handle X reply context", error);
      return new Response("Failed to fetch related X post", {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  const parsedTargets = parseXHandleTargets(url.searchParams.get("handles"));
  if (!parsedTargets.ok) return badRequest(parsedTargets.message);

  const maxResults = parseXMaxResults(url.searchParams.get("maxResults"));
  if (maxResults === null) {
    return badRequest("maxResults must be an integer between 5 and 20");
  }

  try {
    const content = await application.readPosts(
      parsedTargets.handles,
      maxResults,
    );
    return json(
      {
        updatedAt: new Date().toISOString(),
        ...content,
      },
      200,
      {
        headers: getXPostsCacheHeaders({ adminView, debug, visibility }),
      },
    );
  } catch (error) {
    if (error instanceof XAllowlistUnavailableError) {
      return new Response(error.message, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (error instanceof XTargetsNotAllowedError) {
      return badRequest("Unapproved handles");
    }
    if (error instanceof XPostFeedError) {
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
