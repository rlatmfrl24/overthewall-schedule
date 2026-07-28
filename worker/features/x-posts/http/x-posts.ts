import { authenticateRequest, requireAdminUser } from "../../../platform/auth";
import { badRequest, json, methodNotAllowed } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  parseXHandleTargets,
  parseXMaxResults,
} from "../domain/handle-targets";
import {
  XAllowlistUnavailableError,
  XPostFeedError,
  XTargetsNotAllowedError,
  type XPostsApplication,
} from "../application/x-posts-service";

const X_POSTS_CACHE_CONTROL =
  "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600";
const X_AUTHENTICATED_POSTS_CACHE_CONTROL = "no-store";
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

export const createXPostsHandler =
  (buildApplication: BuildXPostsApplication) =>
  async (request: Request, env: Env) => {
  const url = new URL(request.url);
  const debug = url.searchParams.get("debug") === "1";
  const adminView = url.searchParams.get("admin") === "1";
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

  if (url.pathname !== "/api/x/posts") {
    return new Response(null, { status: 404 });
  }

  if (request.method !== "GET") {
    return methodNotAllowed();
  }

  const visibility = await application.readVisibility();
  if (debug || adminView) {
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
  } else if (visibility === "private") {
    return new Response("Member posts are private", { status: 403 });
  } else if (visibility === "members") {
    const auth = await authenticateRequest(request, env);
    if (!auth.ok) return auth.response;
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
