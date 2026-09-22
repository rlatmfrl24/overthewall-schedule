import type { Env } from "../platform/types";
import { workerRouteRegistry } from "./routes";
import { createSiteSeoHandler, rewriteSiteContent, siteContentUnavailable } from "../features/seo";
import { isSiteContentPath } from "@contracts/site-public-content";
import { createSiteSeoDependencies } from "./site-seo";

const handleSiteSeo = createSiteSeoHandler(env => createSiteSeoDependencies(env).seo);

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
};

const serializeError = (
  error: unknown,
  includeStack: boolean,
  depth = 0,
): SerializedError => {
  if (error instanceof Error) {
    const cause =
      depth < 3 && "cause" in error && error.cause !== undefined
        ? serializeError(error.cause, includeStack, depth + 1)
        : undefined;

    return {
      name: error.name,
      message: error.message,
      ...(includeStack && error.stack ? { stack: error.stack } : {}),
      ...(cause ? { cause } : {}),
    };
  }

  return {
    name: typeof error,
    message: String(error),
  };
};

const isLocalApiRequest = (request: Request) => {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1";
};

const handleApiRouteError = (request: Request, error: unknown) => {
  const url = new URL(request.url);
  const includeDetails = isLocalApiRequest(request);
  const details = serializeError(error, includeDetails);

  console.error("[api] request failed", {
    method: request.method,
    path: url.pathname,
    ...(url.pathname.startsWith("/api/play/") ? {} : { search: url.search }),
    error: details,
  });

  return Response.json(
    includeDetails
      ? {
          error: "Internal Server Error",
          details,
        }
      : {
          error: "Internal Server Error",
        },
    { status: 500 },
  );
};

export const handleWorkerFetch = async (
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> => {
  const url = new URL(request.url);

  try {
    const seoResponse = await handleSiteSeo(request, env);
    const contentPath = url.pathname.replace(/\/+$/, "") || "/";
    if (isSiteContentPath(contentPath) && (!seoResponse || seoResponse.status === 200)) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      if (url.pathname !== contentPath) return Response.redirect(new URL(contentPath + url.search, url).toString(), 301);
      try {
        const content = await createSiteSeoDependencies(env).content.read(contentPath);
        if (content) {
          const assetRequest = new Request(request.url, { method: "GET" });
          const source = request.method === "HEAD" && seoResponse ? await handleSiteSeo(assetRequest, env) : seoResponse;
          const asset = source ?? await env.ASSETS!.fetch(new Request(new URL("/", request.url), { method: "GET" }));
          if (asset.status !== 200) return asset;
          const response = rewriteSiteContent(asset, content);
          return request.method === "HEAD" ? new Response(null, response) : response;
        }
      } catch (error) { console.error("[site-content] HTML failed", error); const response = siteContentUnavailable(); return request.method === "HEAD" ? new Response(null, response) : response; }
    }
    if (seoResponse) return seoResponse;
    const routedResponse = await workerRouteRegistry.dispatch(request, env, ctx);
    if (routedResponse) return routedResponse;
  } catch (error) {
    if (url.pathname.startsWith("/api/")) {
      return handleApiRouteError(request, error);
    }
    throw error;
  }

  return env.ASSETS
    ? env.ASSETS.fetch(request)
    : new Response(null, { status: 404 });
};
