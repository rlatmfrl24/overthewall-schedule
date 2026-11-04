import { requireAdminUser } from "../../../platform/auth";
import { getActorInfo } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import type { XCollectionApplication } from "../application/x-collection-service";
import { XActivityError } from "../application/x-activity-service";

export const createXCollectionHandler = (build: (env: Env, actor: ReturnType<typeof getActorInfo>) => XCollectionApplication) => async (request: Request, env: Env) => {
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  try {
    const application = build(env, getActorInfo(request, admin.user));
    if (request.method === "GET") return json(await application.status());
    if (request.method !== "PATCH") return new Response(null, { status: 405, headers: { Allow: "GET, PATCH" } });
    if (Number(request.headers.get("Content-Length") ?? 0) > 1024) return json({ error: { code: "body_too_large" } }, 413);
    const text = await request.text();
    if (text.length > 1024) return json({ error: { code: "body_too_large" } }, 413);
    let body: unknown;
    try { body = JSON.parse(text); } catch { return json({ error: { code: "invalid_json" } }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !("primarySource" in body) || (body.primarySource !== "fxembed" && body.primarySource !== "x_api")) return json({ error: { code: "invalid_x_collection_request" } }, 400);
    return json(await application.change(body.primarySource));
  } catch (error) {
    console.error("x_collection_control_failed", error instanceof Error ? error.message : "unknown");
    return json({ error: { code: error instanceof XActivityError ? error.code : "x_collection_unavailable" } }, error instanceof XActivityError ? error.status : 503);
  }
};
