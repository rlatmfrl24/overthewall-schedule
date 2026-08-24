import type {
  OtwPlayAdminErrorCode,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { ChannelMonitorService } from "../application/channel-monitor-service";
import { IngestionRepositoryError } from "../application/ports/ingestion-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";

const headers = { "Cache-Control": "no-store" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const errorJson = (
  requestId: string,
  status: number,
  code: OtwPlayAdminErrorCode,
  message: string,
) => json({ error: { code, message, requestId } }, status);

const pathId = (pathname: string, suffix: string) => {
  const match = pathname.match(
    new RegExp(`^/api/play/admin/channel-monitors/([^/]+)${suffix}$`, "u"),
  )?.[1];
  if (!match) return null;
  try {
    const value = decodeURIComponent(match);
    return value.trim() && !value.includes("/") ? value : null;
  } catch {
    return null;
  }
};

const readObject = async (request: Request) => {
  try {
    const value = await request.json();
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

export const createChannelMonitorHandler = (
  resolveService: (env: Env) => ChannelMonitorService,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId = request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();
  const auth = await requireAdminUser(request, env);
  if (!auth.ok) return auth.response;
  const service = resolveService(env);
  const url = new URL(request.url);
  try {
    if (request.method === "GET" && url.pathname === "/api/play/admin/channel-monitors") {
      if ([...url.searchParams.keys()].length > 0) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "Unexpected query parameter");
      }
      return json({ data: await service.list() });
    }
    if (request.method === "POST" && url.pathname === "/api/play/admin/channel-monitors") {
      const body = await readObject(request);
      const channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
      if (!channelId || Object.keys(body ?? {}).some((key) => key !== "channelId")) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "channelId is required");
      }
      return json({ data: await service.create(channelId, auth.user.id) }, 201);
    }
    const candidatesId = pathId(url.pathname, "/candidates");
    if (request.method === "GET" && candidatesId) {
      if ([...url.searchParams.keys()].some((key) => key !== "limit")) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "Unexpected query parameter");
      }
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "limit must be between 1 and 100");
      }
      return json({ data: await service.listCandidates(candidatesId, limit) });
    }
    const reconcileId = pathId(url.pathname, "/reconcile");
    if (request.method === "POST" && reconcileId) {
      const body = await readObject(request);
      if (!body || Object.keys(body).length > 0) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "An empty object is required");
      }
      return json({ data: await service.reconcile(reconcileId) });
    }
    const monitorId = pathId(url.pathname, "");
    if (request.method === "PATCH" && monitorId) {
      const body = await readObject(request);
      const expectedVersion = body?.expectedVersion;
      const status = body?.status;
      if (
        !body ||
        Object.keys(body).some((key) => !["expectedVersion", "status"].includes(key)) ||
        !Number.isSafeInteger(expectedVersion) ||
        Number(expectedVersion) < 0 ||
        !["active", "paused"].includes(String(status))
      ) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "expectedVersion and status are required");
      }
      return json({
        data: await service.updateStatus(
          monitorId,
          Number(expectedVersion),
          status as OtwPlayChannelMonitorStatus,
        ),
      });
    }
    return errorJson(requestId, 404, "PLAY_ADMIN_NOT_FOUND", "Channel monitor route not found");
  } catch (error) {
    if (error instanceof IngestionRepositoryError) {
      if (error.code === "not_found") {
        return errorJson(requestId, 404, "PLAY_ADMIN_NOT_FOUND", error.message);
      }
      if (error.code === "validation_failed") {
        return errorJson(requestId, 409, "PLAY_ADMIN_VALIDATION_FAILED", error.message);
      }
      return errorJson(requestId, 503, "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE", error.message);
    }
    if (error instanceof OtwPlayYouTubeMetadataError) {
      return errorJson(
        requestId,
        error.retryable ? 503 : 502,
        "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        error.message,
      );
    }
    console.error("OTW Play channel monitor request failed", {
      requestId,
      path: url.pathname,
      error: error instanceof Error ? error.name : "unknown",
    });
    return errorJson(requestId, 500, "PLAY_ADMIN_INTERNAL_ERROR", "Channel monitor request failed");
  }
};
