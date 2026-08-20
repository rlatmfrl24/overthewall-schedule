import type { OtwPlayAdminErrorCode } from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import { getActorInfo } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  ReleaseService,
  ReleaseServiceError,
} from "../application/release-service";
import { ReleaseRepositoryError } from "../application/ports/release-repository";
import {
  createPlayTelemetryEvent,
  type PlayTelemetryEventName,
  type PlayTelemetryTrigger,
  type PlayTelemetryWriter,
} from "../application/ports/play-telemetry";
import { parseReleaseRequest } from "./release-input";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

type ResolveReleaseService = (env: Env) => ReleaseService;
type ResolvePlayTelemetry = (env: Env) => PlayTelemetryWriter;

const responseJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: NO_STORE_HEADERS });

const errorResponse = (
  requestId: string,
  status: number,
  code: OtwPlayAdminErrorCode,
  message: string,
  fields?: Record<string, string>,
) =>
  responseJson(
    { error: { code, message, ...(fields ? { fields } : {}), requestId } },
    status,
  );

export const createReleaseHandler = (
  resolveService: ResolveReleaseService,
  resolveTelemetry: ResolvePlayTelemetry,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId =
    request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();
  const startedAt = Date.now();
  const record = (
    event: PlayTelemetryEventName,
    status: number,
    options: {
      transition?: string;
      errorCode?: string;
      rowsRead?: number | null;
      rowsWritten?: number | null;
    } = {},
  ) => {
    try {
      resolveTelemetry(env).write(
        createPlayTelemetryEvent({
          event,
          requestId,
          cfRay: request.headers.get("CF-Ray")?.trim() || null,
          routeId: "otw-play.admin.release",
          trigger: request.method as PlayTelemetryTrigger,
          status,
          durationMs: Math.max(0, Date.now() - startedAt),
          cacheStatus: null,
          d1RowsRead: options.rowsRead ?? null,
          d1RowsWritten: options.rowsWritten ?? null,
          resourceType: "release",
          resourceId: "singleton",
          ...(options.transition ? { transition: options.transition } : {}),
          ...(options.errorCode ? { errorCode: options.errorCode } : {}),
        }),
      );
    } catch {
      // Release authority does not depend on telemetry availability.
    }
  };

  if (request.method !== "GET" && request.method !== "PATCH") {
    record("play.request.failed", 405, {
      errorCode: "PLAY_METHOD_NOT_ALLOWED",
    });
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...NO_STORE_HEADERS, Allow: "GET, PATCH" },
    });
  }
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) {
    record("play.request.failed", admin.response.status, {
      errorCode: "PLAY_ADMIN_AUTH_REQUIRED",
    });
    const headers = new Headers(admin.response.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(admin.response.body, {
      status: admin.response.status,
      statusText: admin.response.statusText,
      headers,
    });
  }
  const url = new URL(request.url);
  if (url.searchParams.size > 0) {
    record("play.request.failed", 400, {
      errorCode: "PLAY_ADMIN_INVALID_REQUEST",
    });
    return errorResponse(
      requestId,
      400,
      "PLAY_ADMIN_INVALID_REQUEST",
      "Release query parameters are not supported",
    );
  }
  const service = resolveService(env);
  try {
    if (request.method === "GET") {
      return responseJson(await service.read());
    }
    let parsed: ReturnType<typeof parseReleaseRequest>;
    try {
      parsed = parseReleaseRequest(await request.json());
    } catch {
      parsed = { ok: false, fields: { body: "malformed_json" } };
    }
    if (!parsed.ok) {
      record("play.request.failed", 400, {
        errorCode: "PLAY_ADMIN_INVALID_REQUEST",
      });
      return errorResponse(
        requestId,
        400,
        "PLAY_ADMIN_INVALID_REQUEST",
        "Invalid release command",
        parsed.fields,
      );
    }
    const actorInfo = getActorInfo(request, admin.user);
    const result = await service.update(parsed.value, {
      userId: admin.user.id,
      displayName: admin.user.displayName,
      ipAddress: actorInfo.actorIp,
    });
    record("play.release.updated", 200, {
      transition: result.response.transition,
      rowsRead: result.diagnostics.rowsRead,
      rowsWritten: result.diagnostics.rowsWritten,
    });
    return responseJson(result.response);
  } catch (error) {
    if (error instanceof ReleaseServiceError) {
      const status =
        error.code === "stale_write"
          ? 409
          : error.code === "policy_unresolved"
            ? 422
            : 400;
      const code: OtwPlayAdminErrorCode =
        error.code === "stale_write"
          ? "PLAY_ADMIN_STALE_WRITE"
          : error.code === "policy_unresolved"
            ? "PLAY_ADMIN_POLICY_UNRESOLVED"
            : "PLAY_ADMIN_INVALID_REQUEST";
      record(
        error.code === "stale_write"
          ? "play.concurrent_write_conflict"
          : "play.request.failed",
        status,
        { errorCode: code },
      );
      return errorResponse(requestId, status, code, error.message, error.fields);
    }
    const code = "PLAY_ADMIN_INTERNAL_ERROR" as const;
    record("play.request.failed", 500, { errorCode: code });
    return errorResponse(
      requestId,
      500,
      code,
      error instanceof ReleaseRepositoryError
        ? error.message
        : "Release command failed",
    );
  }
};
