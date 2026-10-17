import { apiRoutes } from "@contracts/api-routes";
import { getSitePublication } from "@contracts/site-publication";
import { authenticateOptionalRequest, isAdminUser } from "../platform/auth";
import { getWorkerSiteResources } from "../platform/site";
import type { Env } from "../platform/types";
import { createAuthStatusHandler } from "../features/auth";
import { renderSiteCountdown } from "./site-countdown";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
  Vary: "Authorization, Cookie",
};
const handleAdminStatus = createAuthStatusHandler();
const countdownAssets = new Set(["/launch/countdown.css", "/launch/luvdia-members-silhouette.webp", "/launch/outfit-latin.woff2"]);

export async function readSitePublicationStatus(request: Request, env: Env): Promise<Response> {
  const { site } = getWorkerSiteResources(env);
  const status = getSitePublication(site.id, Date.now(), env.SITE_PUBLICATION_HOLD === "true");
  const user = request.headers.has("Authorization") ? await authenticateOptionalRequest(request, env) : null;
  return Response.json({ ...status, canPreview: user !== null && isAdminUser(env, user.id) }, { headers: privateHeaders });
}

export async function readSitePublicationAccess(request: Request, env: Env): Promise<Response | null> {
  const { site } = getWorkerSiteResources(env);
  let path: string;
  try { path = new URL(decodeURIComponent(new URL(request.url).pathname), request.url).pathname; }
  catch { return new Response(null, { status: 404, headers: privateHeaders }); }
  if (path === apiRoutes.publication.status.pattern) {
    if (!["GET", "HEAD"].includes(request.method)) return new Response(null, { status: 405, headers: { ...privateHeaders, Allow: "GET, HEAD" } });
    const response = await readSitePublicationStatus(request, env);
    return request.method === "HEAD" ? new Response(null, response) : response;
  }
  // These contain application code/brand only. Content-bearing files never bypass the gate.
  const bootstrap = path === "/logo_luvdia.webp" || path === "/favicon.ico" || /^\/assets\/[a-zA-Z0-9_.-]+\.(?:js|css|woff2?)$/.test(path) || (site.id === "luvdia" && countdownAssets.has(path));
  if (bootstrap) return env.ASSETS ? env.ASSETS.fetch(request) : new Response(null, { status: 404 });
  if (path === apiRoutes.auth.adminStatus.pattern) return handleAdminStatus(request, env);
  if (getSitePublication(site.id, Date.now(), env.SITE_PUBLICATION_HOLD === "true").phase === "open") return null;
  const user = await authenticateOptionalRequest(request, env);
  if (user && isAdminUser(env, user.id)) return null;
  if (["GET", "HEAD"].includes(request.method) && !path.startsWith("/api") && (!/\.[a-zA-Z0-9]+$/.test(path) || path.endsWith(".html")) && !path.startsWith("/r2-assets/") && !path.startsWith("/cache/")) {
    if (!path.startsWith("/admin")) return new Response(request.method === "HEAD" ? null : renderSiteCountdown(getSitePublication(site.id, Date.now(), env.SITE_PUBLICATION_HOLD === "true")), { headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8" } });
    const shell = env.ASSETS ? await env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" })) : new Response("Service unavailable", { status: 503 });
    const headers = new Headers(shell.headers);
    for (const [name, value] of Object.entries(privateHeaders)) headers.set(name, value);
    return new Response(request.method === "HEAD" ? null : shell.body, { status: shell.status, headers });
  }
  return new Response(request.method === "HEAD" ? null : JSON.stringify({ error: { code: "SITE_NOT_OPEN", message: "사이트 공개를 준비 중입니다." } }), { status: 403, headers: { ...privateHeaders, "Content-Type": "application/json" } });
}
