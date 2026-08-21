import type { OtwPlaySubmissionErrorCode } from "@contracts/otw-play";
import { authenticateRequest } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import {
  MemberSubmissionService,
  MemberSubmissionServiceError,
} from "../application/member-submission-service";
import { MemberSubmissionRepositoryError } from "../application/ports/member-submission-repository";
import { MemberSubmissionCursorError } from "../domain/member-submission-cursor";
import {
  parseCreateSubmission,
  parseSubmissionPreflight,
  parseUpdateSubmission,
  parseWithdrawSubmission,
  type MemberSubmissionInputResult,
} from "./member-submission-input";

const JSON_HEADERS = { "Cache-Control": "no-store" };
const MAX_BODY_BYTES = 32 * 1024;

export type ResolveMemberSubmissionService = (
  env: Env,
) => MemberSubmissionService;

const responseJson = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: JSON_HEADERS });

const requestIdFor = (request: Request) =>
  request.headers.get("CF-Ray")?.trim() || crypto.randomUUID();

const errorResponse = (
  requestId: string,
  status: number,
  code: OtwPlaySubmissionErrorCode,
  message: string,
  fields?: Record<string, string>,
) =>
  responseJson(
    { error: { code, message, ...(fields ? { fields } : {}), requestId } },
    status,
  );

const readBody = async <T>(
  request: Request,
  parser: (value: unknown) => MemberSubmissionInputResult<T>,
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

const decodePathId = (pathname: string) => {
  const matched = pathname.match(/^\/api\/play\/submissions\/([^/]+)$/u)?.[1];
  if (!matched || matched === "mine" || matched === "preflight") return null;
  try {
    const decoded = decodeURIComponent(matched);
    return decoded.trim() && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
};

const decodeWithdrawPathId = (pathname: string) => {
  const matched = pathname.match(
    /^\/api\/play\/submissions\/([^/]+)\/withdraw$/u,
  )?.[1];
  if (!matched) return null;
  try {
    const decoded = decodeURIComponent(matched);
    return decoded.trim() && !decoded.includes("/") ? decoded : null;
  } catch {
    return null;
  }
};

const consumeEdgeLimit = async (env: Env, key: string) => {
  const limiter = env.OTW_PLAY_SUBMISSION_RATE_LIMITER;
  if (!limiter) return "unavailable" as const;
  try {
    const result = await limiter.limit({ key });
    return result.success ? ("allowed" as const) : ("limited" as const);
  } catch {
    return "unavailable" as const;
  }
};

export const createMemberSubmissionHandler = (
  resolveService: ResolveMemberSubmissionService,
) => async (request: Request, env: Env): Promise<Response> => {
  const requestId = requestIdFor(request);
  const url = new URL(request.url);
  const auth = await authenticateRequest(request, env);
  if (!auth.ok) {
    return errorResponse(
      requestId,
      auth.response.status === 500 ? 503 : 401,
      auth.response.status === 500
        ? "PLAY_SUBMISSION_UNAVAILABLE"
        : "PLAY_SUBMISSION_AUTH_REQUIRED",
      auth.response.status === 500
        ? "Member submissions are temporarily unavailable"
        : "Login is required",
    );
  }
  const service = resolveService(env);

  try {
    if (
      request.method === "POST" &&
      url.pathname === "/api/play/submissions/preflight"
    ) {
      const parsed = await readBody(request, parseSubmissionPreflight);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Invalid submission preflight",
          parsed.fields,
        );
      }
      return responseJson({ data: await service.preflight(auth.user.id, parsed.value) });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/api/play/submissions"
    ) {
      const parsed = await readBody(request, parseCreateSubmission);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Invalid submission",
          parsed.fields,
        );
      }
      const replay = await service.findReplay(auth.user.id, parsed.value);
      if (replay) return responseJson(replay, 200);
      const edgeLimit = await consumeEdgeLimit(env, auth.user.id);
      if (edgeLimit === "unavailable") {
        return errorResponse(
          requestId,
          503,
          "PLAY_SUBMISSION_UNAVAILABLE",
          "Submission rate limiting is unavailable",
        );
      }
      if (edgeLimit === "limited") {
        return errorResponse(
          requestId,
          429,
          "PLAY_SUBMISSION_RATE_LIMITED",
          "Too many submission requests",
          { scope: "burst" },
        );
      }
      const result = await service.create(auth.user.id, parsed.value);
      return responseJson(result, result.idempotentReplay ? 200 : 201);
    }

    if (
      request.method === "GET" &&
      url.pathname === "/api/play/submissions/mine"
    ) {
      if ([...url.searchParams.keys()].some((key) => !["limit", "cursor"].includes(key))) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Unknown query parameter",
        );
      }
      if (url.searchParams.getAll("limit").length > 1 || url.searchParams.getAll("cursor").length > 1) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Duplicate query parameter",
        );
      }
      const limitValue = url.searchParams.get("limit");
      const limit = limitValue === null ? 20 : Number(limitValue);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "limit must be between 1 and 50",
        );
      }
      return responseJson({
        data: await service.listMine(
          auth.user.id,
          limit,
          url.searchParams.get("cursor"),
        ),
      });
    }

    const proposalId = decodePathId(url.pathname);
    if (request.method === "PATCH" && proposalId) {
      const parsed = await readBody(request, parseUpdateSubmission);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Invalid submission update",
          parsed.fields,
        );
      }
      const edgeLimit = await consumeEdgeLimit(
        env,
        `edit:${auth.user.id}`,
      );
      if (edgeLimit !== "allowed") {
        return errorResponse(
          requestId,
          edgeLimit === "limited" ? 429 : 503,
          edgeLimit === "limited"
            ? "PLAY_SUBMISSION_RATE_LIMITED"
            : "PLAY_SUBMISSION_UNAVAILABLE",
          edgeLimit === "limited"
            ? "Too many submission changes"
            : "Submission rate limiting is unavailable",
          edgeLimit === "limited" ? { scope: "edit" } : undefined,
        );
      }
      return responseJson({
        data: await service.update(auth.user.id, proposalId, parsed.value),
      });
    }
    if (request.method === "GET" && proposalId) {
      return responseJson({ data: await service.readMine(auth.user.id, proposalId) });
    }
    const withdrawProposalId = decodeWithdrawPathId(url.pathname);
    if (request.method === "POST" && withdrawProposalId) {
      const parsed = await readBody(request, parseWithdrawSubmission);
      if (!parsed.ok) {
        return errorResponse(
          requestId,
          400,
          "PLAY_SUBMISSION_INVALID_REQUEST",
          "Invalid submission withdrawal",
          parsed.fields,
        );
      }
      const edgeLimit = await consumeEdgeLimit(
        env,
        `edit:${auth.user.id}`,
      );
      if (edgeLimit !== "allowed") {
        return errorResponse(
          requestId,
          edgeLimit === "limited" ? 429 : 503,
          edgeLimit === "limited"
            ? "PLAY_SUBMISSION_RATE_LIMITED"
            : "PLAY_SUBMISSION_UNAVAILABLE",
          edgeLimit === "limited"
            ? "Too many submission changes"
            : "Submission rate limiting is unavailable",
          edgeLimit === "limited" ? { scope: "edit" } : undefined,
        );
      }
      return responseJson({
        data: await service.withdraw(
          auth.user.id,
          withdrawProposalId,
          parsed.value,
        ),
      });
    }
    return new Response(null, { status: 404, headers: JSON_HEADERS });
  } catch (error) {
    if (error instanceof MemberSubmissionCursorError) {
      return errorResponse(
        requestId,
        400,
        "PLAY_SUBMISSION_INVALID_REQUEST",
        "Invalid cursor",
        { cursor: "invalid" },
      );
    }
    if (error instanceof MemberSubmissionServiceError) {
      return errorResponse(
        requestId,
        error.code === "not_found" ? 404 : error.code === "unavailable" ? 503 : 400,
        error.code === "not_found"
          ? "PLAY_SUBMISSION_NOT_FOUND"
          : error.code === "unavailable"
            ? "PLAY_SUBMISSION_UNAVAILABLE"
            : "PLAY_SUBMISSION_INVALID_REQUEST",
        error.message,
      );
    }
    if (error instanceof MemberSubmissionRepositoryError) {
      const mapping = {
        not_found: [404, "PLAY_SUBMISSION_NOT_FOUND"],
        duplicate: [409, "PLAY_SUBMISSION_DUPLICATE"],
        stale_write: [409, "PLAY_SUBMISSION_STALE_WRITE"],
        idempotency_conflict: [409, "PLAY_SUBMISSION_IDEMPOTENCY_CONFLICT"],
        rate_limited: [429, "PLAY_SUBMISSION_RATE_LIMITED"],
        unavailable: [503, "PLAY_SUBMISSION_UNAVAILABLE"],
        invalid_request: [400, "PLAY_SUBMISSION_INVALID_REQUEST"],
      } as const;
      const [status, code] = mapping[error.code];
      return errorResponse(
        requestId,
        status,
        code,
        error.message,
        error.code === "rate_limited" ? { scope: "daily" } : undefined,
      );
    }
    console.error("OTW Play member submission request failed", {
      path: url.pathname,
      method: request.method,
      requestId,
      error: error instanceof Error ? error.name : "unknown",
    });
    return errorResponse(
      requestId,
      503,
      "PLAY_SUBMISSION_UNAVAILABLE",
      "Member submissions are temporarily unavailable",
    );
  }
};
