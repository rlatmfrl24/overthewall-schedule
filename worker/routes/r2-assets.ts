import type { Env } from "../types";

const R2_ASSET_PREFIX = "/r2-assets/";
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const WEBP_CONTENT_TYPE = "image/webp";
const ALLOWED_PROFILE_BACKGROUND_KEY =
  /^members\/[a-z0-9_]+\/backgrounds\/[a-z0-9][a-z0-9_-]*\/(?:original|w(?:960|1280|1672))\.webp$/i;

const getR2AssetKey = (pathname: string) => {
  if (!pathname.startsWith(R2_ASSET_PREFIX)) {
    return null;
  }

  const rawKey = pathname.slice(R2_ASSET_PREFIX.length);

  try {
    return decodeURIComponent(rawKey);
  } catch {
    return null;
  }
};

const isAllowedAssetKey = (key: string) =>
  ALLOWED_PROFILE_BACKGROUND_KEY.test(key);

export const handleR2Asset = async (request: Request, env: Env) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: {
        Allow: "GET, HEAD",
      },
    });
  }

  if (!env.ASSET_BUCKET) {
    return new Response("R2 asset bucket is not configured", { status: 503 });
  }

  const { pathname } = new URL(request.url);
  const key = getR2AssetKey(pathname);

  if (!key || !isAllowedAssetKey(key)) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.ASSET_BUCKET.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Content-Type", WEBP_CONTENT_TYPE);
  headers.set("Cache-Control", CACHE_CONTROL);
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(request.method === "HEAD" ? null : object.body, {
    headers,
  });
};
