import type { Env } from "../../../platform/types";
import type {ProtectedAssetReferenceResponse} from "@contracts/assets";
import { readAsset } from "../application/read-asset";
import type { AssetAccessReader, AssetReader,ProtectedAssetReferenceResolver } from "../application/ports/asset-reader";
import { requireAdminUser } from "../../../platform/auth";
import {
  getAssetContentType,
  isStaticProfileAsset,
} from "../domain/asset-key-policy";

export type AssetReaderResolver = (env: Env) => AssetReader | null;
export const createHandleProtectedAssetReference=(resolve:(env:Env)=>ProtectedAssetReferenceResolver)=>async(request:Request,env:Env):Promise<Response>=>{
  const headers={"Cache-Control":"private, no-store"};
  if(request.method!=="GET") return new Response(null,{status:405,headers});
  const auth=await requireAdminUser(request,env);
  if(!auth.ok) return new Response(auth.response.body,{status:auth.response.status,headers});
  const raw=new URL(request.url).searchParams.get("url");
  if(!raw || raw.length>4096) return new Response("Invalid asset reference",{status:400,headers});
  try {return Response.json({path:await resolve(env).resolve(raw)} satisfies ProtectedAssetReferenceResponse,{headers});}
  catch {return new Response("Unresolved asset reference",{status:400,headers});}
};

export const createHandleR2Asset =
  (resolveReader: AssetReaderResolver, resolveAccess: (env: Env) => AssetAccessReader) =>
  async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const url = new URL(request.url);
    let path:string;
    try { path=new URL(decodeURIComponent(url.pathname),url.origin).pathname; }
    catch { return new Response("Not found",{status:404}); }
    const staticAsset = isStaticProfileAsset(path);
    const key = staticAsset ? path : path.startsWith("/r2-assets/") ? path.slice("/r2-assets/".length) : null;
    const contentType = staticAsset ? (key!.endsWith(".png") ? "image/png" : "image/webp") : key ? getAssetContentType(key) : null;
    if (!key || !contentType) {
      return new Response("Not found", { status: 404 });
    }

    const access = await resolveAccess(env).readAccess(staticAsset ? key : `/r2-assets/${key}`);
    const restricted = access.restricted || url.searchParams.get("archive") === "1";
    if (restricted) {
      const auth = await requireAdminUser(request, env);
      if (!auth.ok) return new Response(request.method === "HEAD" ? null : auth.response.body, { status: auth.response.status, headers: { "Cache-Control": "private, no-store" } });
    }
    if (staticAsset) {
      if (!env.ASSETS) return new Response(null, { status: 404 });
      const response = await env.ASSETS.fetch(new Request(new URL(key, request.url), { method: "GET" }));
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", restricted ? "private, no-store" : "no-store");
      const etag = headers.get("ETag");
      if (etag) headers.set("ETag", `"${env.SITE_ID}:${access.revision}:${etag.replaceAll('"', '')}"`);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers });
    }
    const reader = resolveReader(env);
    if (!reader) return new Response("R2 asset bucket is not configured", { status: 503 });
    const object = await readAsset(reader, key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers(object.httpMetadata);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", restricted ? "private, no-store" : "no-store");
    headers.set("ETag", `"${env.SITE_ID}:${access.revision}:${object.etag.replaceAll('"', '')}"`);
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(request.method === "HEAD" ? null : object.body, {
      headers,
    });
  };
