import type { Env } from "../../../platform/types";
import { readAsset } from "../application/read-asset";
import type { AssetReader } from "../application/ports/asset-reader";
import {
  getAssetContentType,
  getR2AssetKey,
} from "../domain/asset-key-policy";

const CACHE_CONTROL = "public, max-age=31536000, immutable";

export type AssetReaderResolver = (env: Env) => AssetReader | null;

export const createHandleR2Asset =
  (resolveReader: AssetReaderResolver) =>
  async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const reader = resolveReader(env);
    if (!reader) {
      return new Response("R2 asset bucket is not configured", { status: 503 });
    }

    const key = getR2AssetKey(new URL(request.url).pathname);
    const contentType = key ? getAssetContentType(key) : null;
    if (!key || !contentType) {
      return new Response("Not found", { status: 404 });
    }

    const object = await readAsset(reader, key);
    if (!object) return new Response("Not found", { status: 404 });

    const headers = new Headers(object.httpMetadata);
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", CACHE_CONTROL);
    headers.set("ETag", object.etag);
    headers.set("X-Content-Type-Options", "nosniff");

    return new Response(request.method === "HEAD" ? null : object.body, {
      headers,
    });
  };
