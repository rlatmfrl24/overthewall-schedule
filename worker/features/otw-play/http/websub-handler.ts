import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { WebsubError, WebsubService } from "../application/websub-service";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const MAX_PAYLOAD_BYTES = 64 * 1024;
const XML_CONTENT_TYPES = new Set([
  "application/atom+xml",
  "application/xml",
  "text/xml",
]);
const noStoreHeaders = { "Cache-Control": "no-store" };

const jsonError = (
  requestId: string,
  status: number,
  code: "PLAY_ADMIN_INVALID_REQUEST" | "PLAY_ADMIN_NOT_FOUND" |
    "PLAY_ADMIN_VALIDATION_FAILED" | "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE" |
    "PLAY_ADMIN_INTERNAL_ERROR",
  message: string,
) => Response.json(
  { error: { code, message, requestId } },
  { status, headers: noStoreHeaders },
);

const readEmptyObject = async (request: Request) => {
  try {
    const value = await request.json();
    return typeof value === "object" && value !== null &&
      !Array.isArray(value) && Object.keys(value).length === 0;
  } catch {
    return false;
  }
};

const readBoundedPayload = async (request: Request) => {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAYLOAD_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return payload;
};

const callbackToken = (pathname: string) => {
  const encoded = pathname.match(/^\/api\/play\/webhooks\/youtube\/([^/]+)$/u)?.[1];
  if (!encoded) return null;
  try {
    const value = decodeURIComponent(encoded);
    return TOKEN_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
};

export const createWebsubCallbackHandler = (
  resolveService: (env: Env) => WebsubService,
) => async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  const token = callbackToken(url.pathname);
  if (!token) return new Response("Not Found", { status: 404 });
  const service = resolveService(env);
  if (request.method === "GET") {
    const allowed = new Set([
      "hub.mode",
      "hub.topic",
      "hub.challenge",
      "hub.lease_seconds",
      "hub.reason",
    ]);
    if (
      [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
      [...allowed].some((key) => url.searchParams.getAll(key).length > 1)
    ) {
      return new Response("Invalid WebSub intent", { status: 400 });
    }
    try {
      const result = await service.verifyIntent(token, {
        mode: url.searchParams.get("hub.mode"),
        topic: url.searchParams.get("hub.topic"),
        challenge: url.searchParams.get("hub.challenge"),
        leaseSeconds: url.searchParams.get("hub.lease_seconds"),
        reason: url.searchParams.get("hub.reason"),
      });
      if (result.denied) return new Response(null, { status: 204, headers: noStoreHeaders });
      return new Response(result.challenge, {
        status: 200,
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/octet-stream; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error) {
      if (error instanceof WebsubError) {
        return new Response(error.code === "not_found" ? "Not Found" : "Invalid WebSub intent", {
          status: error.code === "not_found" ? 404 : error.retryable ? 503 : 400,
          headers: noStoreHeaders,
        });
      }
      return new Response("WebSub callback failed", { status: 500, headers: noStoreHeaders });
    }
  }
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0]?.trim().toLowerCase();
  const contentLength = Number(request.headers.get("Content-Length"));
  if (!contentType || !XML_CONTENT_TYPES.has(contentType)) {
    return new Response(null, { status: 415, headers: noStoreHeaders });
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
    return new Response(null, { status: 413, headers: noStoreHeaders });
  }
  let payload: Uint8Array | null;
  try {
    payload = await readBoundedPayload(request);
  } catch {
    return new Response(null, { status: 400, headers: noStoreHeaders });
  }
  if (payload === null) {
    return new Response(null, { status: 413, headers: noStoreHeaders });
  }
  const signature = request.headers.get("X-Hub-Signature") ??
    (request.headers.get("X-Hub-Signature-256")
      ? `sha256=${request.headers.get("X-Hub-Signature-256")}`
      : null);
  try {
    await service.receiveNotification({ token, signature, payload });
    return new Response(null, { status: 204, headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof WebsubError) {
      if (error.code === "not_found" || error.code === "authority_denied") {
        return new Response("Not Found", { status: 404, headers: noStoreHeaders });
      }
      if (error.retryable) {
        return new Response(null, { status: 503, headers: noStoreHeaders });
      }
      return new Response(null, { status: 204, headers: noStoreHeaders });
    }
    return new Response(null, { status: 500, headers: noStoreHeaders });
  }
};

const adminAction = (pathname: string) => {
  const match = pathname.match(
    /^\/api\/play\/admin\/channel-monitors\/([^/]+)\/(subscribe|renew|unsubscribe)$/u,
  );
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]!);
    return id.trim() && !id.includes("/")
      ? { id, action: match[2] as "subscribe" | "renew" | "unsubscribe" }
      : null;
  } catch {
    return null;
  }
};

export const createWebsubAdminHandler = (
  resolveService: (env: Env) => WebsubService,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId = request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();
  const auth = await requireAdminUser(request, env);
  if (!auth.ok) return auth.response;
  const action = adminAction(new URL(request.url).pathname);
  if (request.method !== "POST" || !action) {
    return jsonError(requestId, 404, "PLAY_ADMIN_NOT_FOUND", "WebSub action not found");
  }
  if (!await readEmptyObject(request)) {
    return jsonError(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "An empty object is required");
  }
  try {
    const service = resolveService(env);
    const data = action.action === "subscribe"
      ? await service.subscribe(action.id, auth.user.id)
      : action.action === "renew"
        ? await service.renew(action.id, auth.user.id)
        : await service.unsubscribe(action.id, auth.user.id);
    return Response.json({ data }, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof WebsubError) {
      if (error.code === "not_found") {
        return jsonError(requestId, 404, "PLAY_ADMIN_NOT_FOUND", error.message);
      }
      if (error.code === "invalid_request") {
        return jsonError(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", error.message);
      }
      if (error.code === "authority_denied") {
        return jsonError(requestId, 409, "PLAY_ADMIN_VALIDATION_FAILED", error.message);
      }
      return jsonError(
        requestId,
        503,
        "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        error.message,
      );
    }
    return jsonError(requestId, 500, "PLAY_ADMIN_INTERNAL_ERROR", "WebSub action failed");
  }
};
