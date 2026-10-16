import type { Env } from "../platform/types";
import { workerRouteRegistry } from "./routes";
import { createSiteSeoHandler, rewriteSiteContent, siteContentUnavailable } from "../features/seo";
import { isSiteContentPath } from "@contracts/site-public-content";
import { createSiteSeoDependencies } from "./site-seo";
import { getWorkerSiteResources } from "../platform/site";
import { handleAsset } from "./assets";
import { TransitionWriteError,TransitionMaintenanceError,isTransitionMaintenanceError } from "../features/content-transition";
import { readTransitionAccess,privateTransitionResponse } from "./content-transition-access";
import { readSitePublicationAccess } from "./site-publication";
import { SITE_OPENS_AT } from "@contracts/site-publication";
import { apiRoutes } from "@contracts/api-routes";
import { requireAdminUser } from "../platform/auth";

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
  if(isTransitionMaintenanceError(error)) {
    const maintenance=new TransitionMaintenanceError();
    return Response.json({error:{code:maintenance.code,message:maintenance.message}},{status:503,headers:{'Cache-Control':'no-store','Retry-After':'60'}});
  }
  if(error instanceof TransitionWriteError) return Response.json({error:{code:error.code,message:error.message,fields:{targetSite:error.targetSite,...(error.operationId?{operationId:error.operationId}:{})}}},{status:409,headers:{"Cache-Control":"no-store"}});
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

const handleFetch = async (
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response> => {
  const url = new URL(request.url);

  try {
    const publicationResponse = await readSitePublicationAccess(request, env);
    if (publicationResponse) return publicationResponse;
    if (url.pathname === apiRoutes.assets.protectedReference.pattern) {
      const auth = await requireAdminUser(request, env);
      if (!auth.ok) return auth.response;
    }
    let assetPath: string;
    try { assetPath=new URL(decodeURIComponent(url.pathname),url.origin).pathname; }
    catch { return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}}); }
    if(assetPath==="/profile/__artifact.json") return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}});
    const access=await readTransitionAccess(request,env,assetPath);
    if(access.response) return access.response;
    const visible=(response:Response)=>access.inactive?privateTransitionResponse(response,request.method==="HEAD"):response;
    const { site } = getWorkerSiteResources(env);
    if (assetPath.startsWith("/profile/") && /\.[a-z0-9]+$/i.test(assetPath) || assetPath.startsWith("/r2-assets/")) return visible(await handleAsset(request, env));
    const seoResponse = await handleSiteSeo(request, env);
    const contentPath = url.pathname.replace(/\/+$/, "") || "/";
    if (isSiteContentPath(contentPath) && (!seoResponse || seoResponse.status === 200)) {
      if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
      if (url.pathname !== contentPath) return Response.redirect(new URL(contentPath + url.search, url).toString(), 301);
      try {
        const content = await createSiteSeoDependencies(env,request.headers.has("Authorization") || request.headers.has("Cookie")).content.read(contentPath);
        if (content) {
          const assetRequest = new Request(request.url, { method: "GET" });
          const source = request.method === "HEAD" && seoResponse ? await handleSiteSeo(assetRequest, env) : seoResponse;
          const asset = source ?? await env.ASSETS!.fetch(new Request(new URL("/", request.url), { method: "GET" }));
          if (asset.status !== 200) return asset;
          const response = rewriteSiteContent(asset, content, site);
          return visible(request.method === "HEAD" ? new Response(null, response) : response);
        }
      } catch (error) { console.error("[site-content] HTML failed", error); const response = siteContentUnavailable(); return request.method === "HEAD" ? new Response(null, response) : response; }
    }
    if (seoResponse) return visible(seoResponse);
    const routedResponse = await workerRouteRegistry.dispatch(request, env, ctx);
    if (routedResponse) return visible(routedResponse);
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

export const handleWorkerFetch = async (request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> => {
  const startedAt = Date.now();
  let response = await handleFetch(request, env, ctx);
  if (env.SITE_ID !== "otw") return response;
  const cutoff = Date.parse(SITE_OPENS_AT);
  const now = Date.now();
  if (startedAt < cutoff && now >= cutoff && ["GET", "HEAD"].includes(request.method)) response = await handleFetch(request, env, ctx);
  if (now >= cutoff) return response;
  const ttl = Math.max(0, Math.floor((cutoff - now) / 1000));
  const headers = new Headers(response.headers);
  const control = headers.get("Cache-Control");
  if (control && !/no-store|no-cache/i.test(control)) {
    headers.set("Cache-Control", control.replace(/\b(max-age|s-maxage)=(\d+)/gi, (_, key: string, age: string) => `${key}=${Math.min(Number(age), ttl)}`).replace(/\b(stale-while-revalidate|stale-if-error)=\d+/gi, "$1=0"));
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
