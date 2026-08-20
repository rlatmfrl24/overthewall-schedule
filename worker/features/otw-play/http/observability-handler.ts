import type { OtwPlayAdminErrorCode } from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import type { PlayObservabilityReader } from "../application/ports/play-observability-reader";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type ResolvePlayObservabilityReader = (env: Env) => PlayObservabilityReader;

const errorResponse = (
  requestId: string,
  status: number,
  code: OtwPlayAdminErrorCode,
  message: string,
) =>
  Response.json(
    { error: { code, message, requestId } },
    { status, headers: NO_STORE_HEADERS },
  );

export const createPlayObservabilityHandler = (
  resolveReader: ResolvePlayObservabilityReader,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId =
    request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: "GET" },
    });
  }
  const url = new URL(request.url);
  if (url.searchParams.size > 0) {
    return errorResponse(
      requestId,
      400,
      "PLAY_ADMIN_INVALID_REQUEST",
      "Observability query parameters are not supported",
    );
  }
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  return Response.json(await resolveReader(env).read24Hours(), {
    headers: NO_STORE_HEADERS,
  });
};
