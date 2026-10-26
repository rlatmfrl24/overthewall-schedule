import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { XActivityError, type XActivityService } from "../application/x-activity-service";
import { signXActivity, validXActivityChallenge, verifyXActivity } from "../domain/x-activity";

const MAX_BODY = 262_144;
async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    length += chunk.value.length;
    if (length > MAX_BODY) { await reader.cancel(); throw new XActivityError("body_too_large", 413); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const failure = (code: string, status: number) => json({ error: { code, message: code } }, status);

export const createXActivityHandler = (build: (env: Env) => XActivityService) => async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/api/x/activity/webhook") {
      if (env.SITE_ID !== "otw") return new Response(null,{status:404});
      if (!env.X_CLIENT_SECRET) return failure("x_activity_credentials_missing", 503);
      if (request.method === "GET") {
        const challenge = url.searchParams.get("crc_token") ?? "";
        if (!validXActivityChallenge(challenge)) return failure("invalid_crc_token", 400);
        return json({ response_token: await signXActivity(env.X_CLIENT_SECRET, challenge) });
      }
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const raw = await readBody(request);
      if (!await verifyXActivity(env.X_CLIENT_SECRET, raw, request.headers.get("X-Twitter-Webhooks-Signature-OAuth2"))) return failure("invalid_signature", 401);
      let body: unknown;
      try { body = JSON.parse(raw); } catch { return failure("invalid_json", 400); }
      await build(env).accept(body);
      return json({ received: true });
    }
    const admin = await requireAdminUser(request, env);
    if (!admin.ok) return admin.response;
    const application = build(env);
    if (request.method === "GET") return json(await application.status());
    if (request.method === "DELETE") return json(await application.stop());
    if (request.method !== "POST") return new Response(null, { status: 405 });
    let body: unknown;
    try { body = JSON.parse(await readBody(request)); } catch (error) { if (error instanceof XActivityError) throw error; return failure("invalid_json", 400); }
    const input = body as { action?: unknown; acknowledgeUncappedDelivery?: unknown } | null;
    if (!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).some(key=>!["action","acknowledgeUncappedDelivery"].includes(key)) ||
      !["start","resume"].includes(String(input.action)) || input.acknowledgeUncappedDelivery !== true) return failure("invalid_x_activity_request", 400);
    return json(await application.start());
  } catch (error) {
    if (error instanceof XActivityError) return failure(error.code, error.status);
    console.error("x_activity_request_failed", error instanceof Error ? error.message : "unknown");
    return failure("x_activity_unavailable", 503);
  }
};
