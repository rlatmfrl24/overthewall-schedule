import {
  OTW_PLAY_INGESTION_CANDIDATE_STATUSES,
  OTW_PLAY_INGESTION_CLASSIFICATIONS,
  type OtwPlayAdminErrorCode,
  type OtwPlayIngestionCandidateStatus,
  type OtwPlayIngestionClassification,
} from "@contracts/otw-play";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import {
  IngestionProcessingError,
  IngestionService,
  IngestionServiceError,
} from "../application/ingestion-service";
import {
  IngestionRepositoryError,
  type OtwPlayIngestionQueueMessage,
} from "../application/ports/ingestion-repository";
import { OtwPlayYouTubeMetadataError } from "../application/ports/youtube-metadata";
import { IngestionCursorError } from "../domain/ingestion-cursor";
import {
  parseCreatePlaylistImport,
  parseConvertIngestionCandidate,
  parseConvertIngestionCandidates,
  parseIgnoreIngestionCandidates,
  parsePlaylistPreflight,
  parseRetryIngestionJob,
  parseUpdateIngestionCandidate,
  type IngestionInputResult,
} from "./ingestion-input";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 32 * 1024;

export type ResolveIngestionService = (env: Env) => IngestionService;

const responseJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: NO_STORE_HEADERS });

const requestIdFor = (request: Request) =>
  request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();

const errorResponse = (
  requestId: string,
  status: number,
  code: OtwPlayAdminErrorCode,
  message: string,
  fields?: Record<string, string>,
) => responseJson(
  { error: { code, message, ...(fields ? { fields } : {}), requestId } },
  status,
);

const readBody = async <T>(
  request: Request,
  parser: (value: unknown) => IngestionInputResult<T>,
) => {
  const declaredLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { ok: false as const, fields: { body: "too_large" } };
  }
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return { ok: false as const, fields: { body: "too_large" } };
    }
    return parser(JSON.parse(raw));
  } catch {
    return { ok: false as const, fields: { body: "malformed_json" } };
  }
};
const pathId = (pathname: string, pattern: RegExp) => {
  const matched = pathname.match(pattern)?.[1];
  if (!matched) return null;
  try {
    const decoded = decodeURIComponent(matched);
    return decoded.trim() && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
};

export const createIngestionHandler = (
  resolveService: ResolveIngestionService,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId = requestIdFor(request);
  const url = new URL(request.url);
  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;
  const service = resolveService(env);
  const actor = {
    userId: admin.user.id,
    displayName: admin.user.displayName,
    ipAddress:
      request.headers.get("CF-Connecting-IP") ??
      request.headers.get("X-Forwarded-For"),
  };
  try {
    if (
      request.method === "GET" &&
      url.pathname === "/api/play/admin/imports"
    ) {
      if ([...url.searchParams.keys()].some((key) => key !== "limit")) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Unexpected query parameter",
        );
      }
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 100 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "limit must be between 1 and 100",
        );
      }
      return responseJson({ data: await service.listJobs(limit) });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/play/admin/imports/playlist/preflight"
    ) {
      const parsed = await readBody(request, parsePlaylistPreflight);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid playlist preflight",
          parsed.fields,
        );
      }
      return responseJson({ data: await service.preflight(parsed.value) });
    }
    if (
      request.method === "POST" &&
      url.pathname === "/api/play/admin/imports/playlist"
    ) {
      const parsed = await readBody(request, parseCreatePlaylistImport);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid playlist import",
          parsed.fields,
        );
      }
      return responseJson(
        { data: await service.createJob(admin.user.id, parsed.value) },
        202,
      );
    }
    const convertCandidateId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/import-candidates\/([^/]+)\/convert$/u,
    );
    if (request.method === "POST" && convertCandidateId) {
      const parsed = await readBody(request, parseConvertIngestionCandidate);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion candidate conversion request",
          parsed.fields,
        );
      }
      return responseJson({
        data: await service.convertCandidate(convertCandidateId, parsed.value, actor),
      });
    }
    const candidateId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/import-candidates\/([^/]+)$/u,
    );
    if (request.method === "PATCH" && candidateId) {
      const parsed = await readBody(request, parseUpdateIngestionCandidate);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion candidate update",
          parsed.fields,
        );
      }
      return responseJson({
        data: await service.updateCandidate(candidateId, parsed.value, actor),
      });
    }
    const convertJobId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/imports\/([^/]+)\/convert$/u,
    );
    if (request.method === "POST" && convertJobId) {
      const parsed = await readBody(request, parseConvertIngestionCandidates);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion conversion request",
          parsed.fields,
        );
      }
      return responseJson({
        data: await service.convertCandidates(convertJobId, parsed.value, actor),
      });
    }
    const ignoreJobId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/imports\/([^/]+)\/ignore$/u,
    );
    if (request.method === "POST" && ignoreJobId) {
      const parsed = await readBody(request, parseIgnoreIngestionCandidates);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion bulk ignore request",
          parsed.fields,
        );
      }
      return responseJson({
        data: await service.ignoreCandidates(ignoreJobId, parsed.value, actor),
      });
    }
    const retryJobId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/imports\/([^/]+)\/retry$/u,
    );
    if (request.method === "POST" && retryJobId) {
      const parsed = await readBody(request, parseRetryIngestionJob);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion retry request",
          parsed.fields,
        );
      }
      return responseJson({ data: await service.retryJob(retryJobId, actor) });
    }
    const itemsJobId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/imports\/([^/]+)\/items$/u,
    );
    if (request.method === "GET" && itemsJobId) {
      if ([...url.searchParams.keys()].some(
        (key) => !["limit", "cursor", "classification", "status"].includes(key),
      )) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Unknown query parameter",
        );
      }
      if (
        url.searchParams.getAll("limit").length > 1 ||
        url.searchParams.getAll("cursor").length > 1 ||
        url.searchParams.getAll("classification").length > 1 ||
        url.searchParams.getAll("status").length > 1
      ) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Duplicate query parameter",
        );
      }
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "limit must be between 1 and 100",
        );
      }
      const classification = url.searchParams.get("classification");
      const status = url.searchParams.get("status");
      if (
        classification !== null &&
        !OTW_PLAY_INGESTION_CLASSIFICATIONS.includes(
          classification as OtwPlayIngestionClassification,
        ) ||
        status !== null &&
        !OTW_PLAY_INGESTION_CANDIDATE_STATUSES.includes(
          status as OtwPlayIngestionCandidateStatus,
        )
      ) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Invalid ingestion item filter",
        );
      }
      return responseJson({
        data: await service.listItems(
          itemsJobId,
          limit,
          url.searchParams.get("cursor"),
          {
            ...(classification
              ? { classification: classification as OtwPlayIngestionClassification }
              : {}),
            ...(status ? { status: status as OtwPlayIngestionCandidateStatus } : {}),
          },
        ),
      });
    }
    const jobId = pathId(
      url.pathname,
      /^\/api\/play\/admin\/imports\/([^/]+)$/u,
    );
    if (request.method === "GET" && jobId) {
      if ([...url.searchParams.keys()].length > 0) {
        return errorResponse(
          requestId,
          400,
          "PLAY_ADMIN_INVALID_REQUEST",
          "Unknown query parameter",
        );
      }
      return responseJson({ data: await service.getJob(jobId) });
    }
    return new Response(null, { status: 404, headers: NO_STORE_HEADERS });
  } catch (error) {
    if (error instanceof IngestionCursorError) {
      return errorResponse(
        requestId,
        400,
        "PLAY_ADMIN_INVALID_REQUEST",
        "Invalid cursor",
        { cursor: "invalid" },
      );
    }
    if (error instanceof IngestionServiceError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "limit_exceeded"
          ? 422
          : error.code === "unavailable"
            ? 503
            : 400;
      return errorResponse(
        requestId,
        status,
        error.code === "not_found"
          ? "PLAY_ADMIN_NOT_FOUND"
          : error.code === "limit_exceeded"
            ? "PLAY_ADMIN_VALIDATION_FAILED"
            : error.code === "unavailable"
              ? "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE"
              : "PLAY_ADMIN_INVALID_REQUEST",
        error.message,
      );
    }
    if (error instanceof IngestionRepositoryError) {
      const status = error.code === "not_found"
        ? 404
        : error.code === "validation_failed"
          ? 422
        : error.code === "idempotency_conflict"
          ? 409
          : error.code === "stale_message"
            ? 409
          : 503;
      return errorResponse(
        requestId,
        status,
        error.code === "not_found"
          ? "PLAY_ADMIN_NOT_FOUND"
          : error.code === "validation_failed"
            ? "PLAY_ADMIN_VALIDATION_FAILED"
          : error.code === "idempotency_conflict"
            ? "PLAY_ADMIN_STALE_WRITE"
            : error.code === "stale_message"
              ? "PLAY_ADMIN_STALE_WRITE"
            : "PLAY_ADMIN_INTERNAL_ERROR",
        error.message,
      );
    }
    if (error instanceof OtwPlayYouTubeMetadataError) {
      return errorResponse(
        requestId,
        error.retryable ? 503 : 422,
        error.retryable
          ? "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE"
          : "PLAY_ADMIN_VALIDATION_FAILED",
        "YouTube playlist metadata is unavailable",
        { youtube: error.code },
      );
    }
    console.error("OTW Play ingestion request failed", {
      path: url.pathname,
      method: request.method,
      requestId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      requestId,
      503,
      "PLAY_ADMIN_INTERNAL_ERROR",
      "Playlist ingestion is temporarily unavailable",
    );
  }
};

export const createIngestionQueueHandler = (
  resolveService: ResolveIngestionService,
) => async (batch: MessageBatch<OtwPlayIngestionQueueMessage>, env: Env) => {
  const service = resolveService(env);
  const isDeadLetter = batch.queue === "otw-play-ingestion-dlq";
  for (const message of batch.messages) {
    if (isDeadLetter) {
      await service.markDeadLetter(message.body, "queue_retries_exhausted");
      message.ack();
      continue;
    }
    try {
      await service.process(message.body);
      message.ack();
    } catch (error) {
      if (error instanceof IngestionProcessingError && !error.retryable) {
        await service.markDeadLetter(message.body, error.errorCode);
        message.ack();
      } else {
        message.retry();
      }
    }
  }
};
