import {
  parseSettingsUpdatePayload,
} from "@contracts/configuration";
import { requireAdminUser } from "../../../platform/auth";
import { isJsonObject, parseJsonRequest } from "../../../platform/http/json";
import type { Env } from "../../../platform/types";
import {
  badRequest,
  getActorInfo,
} from "../../../platform/http-helpers";
import type { SettingsService } from "../application/settings-service";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export type ResolveSettingsService = (env: Env) => SettingsService;

export const createAdminSettingsHandler =
  (resolveService: ResolveSettingsService) =>
  async (request: Request, env: Env): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname !== "/api/settings") {
    return new Response(null, { status: 404 });
  }

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const service = resolveService(env);

  if (request.method === "GET") {
    return Response.json(await service.read(), {
      headers: NO_STORE_HEADERS,
    });
  }

  if (request.method !== "PUT") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "GET, PUT" },
    });
  }

  const parsedJson = await parseJsonRequest(request);
  if (!parsedJson.ok) return parsedJson.response;
  if (!isJsonObject(parsedJson.value)) {
    return badRequest("Malformed JSON");
  }

  const parsed = parseSettingsUpdatePayload(parsedJson.value);
  if (!parsed.ok) return badRequest(parsed.error);

  const actor = getActorInfo(request, admin.user);
  await service.update(parsed.updates, actor);

  return new Response("Settings updated", {
    status: 200,
    headers: NO_STORE_HEADERS,
  });
  };
