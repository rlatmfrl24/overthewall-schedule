import type {
  OtwPlayAdminErrorCode,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import { ChannelMonitorService } from "../application/channel-monitor-service";
import { IngestionRepositoryError } from "../application/ports/ingestion-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import { ChannelMonitorCursorError } from "../domain/channel-monitor-cursor";

const headers = { "Cache-Control": "no-store" };
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;
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
      const externalChannelId = typeof body?.externalChannelId === "string"
        ? body.externalChannelId.trim()
        : "";
      const approval = typeof body?.approval === "object" &&
          body.approval !== null && !Array.isArray(body.approval)
        ? body.approval as Record<string, unknown>
        : null;
      const operatorReference = typeof approval?.operatorReference === "string"
        ? approval.operatorReference.trim()
        : "";
      const approvalReference = typeof approval?.approvalReference === "string"
        ? approval.approvalReference.trim()
        : "";
      const revocationProcedure = typeof approval?.revocationProcedure === "string"
        ? approval.revocationProcedure.trim()
        : "";
      if (
        !YOUTUBE_CHANNEL_ID_PATTERN.test(externalChannelId) ||
        Object.keys(body ?? {}).length !== 2 ||
        !Object.hasOwn(body ?? {}, "externalChannelId") ||
        !Object.hasOwn(body ?? {}, "approval") ||
        !approval ||
        Object.keys(approval).length !== 5 ||
        approval.scope !== "candidate_collection" ||
        approval.confirmed !== true ||
        !operatorReference || operatorReference.length > 500 ||
        !approvalReference || approvalReference.length > 500 ||
        !revocationProcedure || revocationProcedure.length > 1_000
      ) {
        return errorJson(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "A valid externalChannelId and explicit candidate-collection approval are required",
        );
      }
      return json({
        data: await service.create(
          externalChannelId,
          {
            scope: "candidate_collection",
            operatorReference,
            approvalReference,
            revocationProcedure,
            confirmed: true,
          },
          auth.user.id,
        ),
      }, 201);
    }
    const candidatesId = pathId(url.pathname, "/candidates");
    if (request.method === "GET" && candidatesId) {
      if ([...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "Unexpected query parameter");
      }
      if (
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1
      ) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "Duplicate query parameter");
      }
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "limit must be between 1 and 100");
      }
      return json({
        data: await service.listCandidates(
          candidatesId,
          limit,
          url.searchParams.get("cursor"),
        ),
      });
    }
    const reconcileId = pathId(url.pathname, "/reconcile");
    if (request.method === "POST" && reconcileId) {
      const body = await readObject(request);
      if (!body || Object.keys(body).length > 0) {
        return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "An empty object is required");
      }
      return json({ data: await service.reconcile(reconcileId) });
    }
    const backfillId = pathId(url.pathname, "/backfill");
    if (request.method === "POST" && backfillId) {
      const body = await readObject(request);
      const count = body?.count;
      if (
        !body ||
        Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, "count") ||
        !Number.isSafeInteger(count) ||
        Number(count) < 1 ||
        Number(count) > 20
      ) {
        return errorJson(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "count must be an integer between 1 and 20",
        );
      }
      return json({ data: await service.backfill(backfillId, Number(count)) });
    }
    const monitorId = pathId(url.pathname, "");
    if (request.method === "PATCH" && monitorId) {
      const body = await readObject(request);
      const expectedVersion = body?.expectedVersion;
      const status = body?.status;
      const externalChannelId = typeof body?.externalChannelId === "string"
        ? body.externalChannelId.trim()
        : "";
      const keys = Object.keys(body ?? {});
      const statusUpdate = keys.length === 2 && keys.includes("expectedVersion") &&
        keys.includes("status") && ["active", "paused"].includes(String(status));
      const targetUpdate = keys.length === 2 && keys.includes("expectedVersion") &&
        keys.includes("externalChannelId") &&
        YOUTUBE_CHANNEL_ID_PATTERN.test(externalChannelId);
      const watermarkReset = keys.length === 2 && keys.includes("expectedVersion") &&
        keys.includes("resetWatermark") && body?.resetWatermark === true;
      if (
        !body ||
        !Number.isSafeInteger(expectedVersion) ||
        Number(expectedVersion) < 0 ||
        (!statusUpdate && !targetUpdate && !watermarkReset)
      ) {
        return errorJson(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Update exactly one of status, externalChannelId, or resetWatermark with expectedVersion",
        );
      }
      if (targetUpdate) {
        return json({
          data: await service.updateTarget(
            monitorId,
            Number(expectedVersion),
            externalChannelId,
            auth.user.id,
          ),
        });
      }
      if (watermarkReset) {
        return json({
          data: await service.resetWatermark(
            monitorId,
            Number(expectedVersion),
            auth.user.id,
          ),
        });
      }
      return json({
        data: await service.updateStatus(
          monitorId,
          Number(expectedVersion),
          status as OtwPlayChannelMonitorStatus,
          auth.user.id,
        ),
      });
    }
    if (request.method === "DELETE" && monitorId) {
      const body = await readObject(request);
      const expectedVersion = body?.expectedVersion;
      if (
        !body ||
        Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, "expectedVersion") ||
        !Number.isSafeInteger(expectedVersion) ||
        Number(expectedVersion) < 0
      ) {
        return errorJson(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "expectedVersion is required",
        );
      }
      return json({
        data: await service.remove(
          monitorId,
          Number(expectedVersion),
          auth.user.id,
        ),
      });
    }
    return errorJson(requestId, 404, "PLAY_ADMIN_NOT_FOUND", "Channel monitor route not found");
  } catch (error) {
    if (error instanceof ChannelMonitorCursorError) {
      return errorJson(requestId, 400, "PLAY_ADMIN_INVALID_REQUEST", "Invalid cursor");
    }
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
