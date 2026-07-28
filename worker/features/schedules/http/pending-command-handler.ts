import type {
  PendingAction,
  PendingApprovalOptions,
  PendingScheduleActionResult,
} from "../../../../contracts/pending-schedules";
import { requireAdminUser } from "../../../platform/auth";
import type { Env } from "../../../platform/types";
import {
  badRequest,
  getActorInfo,
  parseNumericId,
} from "../../../platform/http-helpers";
import type { PendingScheduleService } from "../application/pending-schedule-service";
import type { PendingActionOutcome } from "../application/ports/pending-schedule-repository";
import {
  isPendingApplyMode,
  isPendingTargetMode,
  isPendingTimeMode,
} from "../domain/pending-schedule";

export type ResolvePendingScheduleService = (env: Env) => PendingScheduleService;

const EMPTY_BODY = Symbol("empty-body");
const INVALID_JSON = Symbol("invalid-json");

const parseBody = async (request: Request) => {
  const text = await request.text();
  if (!text.trim()) return EMPTY_BODY;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return INVALID_JSON;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const parseApprovalOptions = (
  value: unknown,
): PendingApprovalOptions | Response | null => {
  if (value === undefined || value === EMPTY_BODY) {
    return null;
  }
  if (!isRecord(value)) {
    return badRequest("Invalid approval options");
  }

  const hasOptions =
    "applyMode" in value ||
    "targetMode" in value ||
    "timeMode" in value ||
    "targetScheduleId" in value;
  if (!hasOptions) return null;

  if (value.applyMode !== undefined && !isPendingApplyMode(value.applyMode)) {
    return badRequest("Invalid applyMode");
  }
  if (
    value.targetMode !== undefined &&
    !isPendingTargetMode(value.targetMode)
  ) {
    return badRequest("Invalid targetMode");
  }
  if (value.timeMode !== undefined && !isPendingTimeMode(value.timeMode)) {
    return badRequest("Invalid timeMode");
  }

  const targetScheduleId =
    value.targetScheduleId === undefined || value.targetScheduleId === null
      ? null
      : parseNumericId(value.targetScheduleId as string | number);
  if (
    value.targetScheduleId !== undefined &&
    value.targetScheduleId !== null &&
    targetScheduleId === null
  ) {
    return badRequest("Invalid targetScheduleId");
  }

  return {
    applyMode: isPendingApplyMode(value.applyMode) ? value.applyMode : "all",
    targetMode: isPendingTargetMode(value.targetMode)
      ? value.targetMode
      : "update",
    timeMode: isPendingTimeMode(value.timeMode)
      ? value.timeMode
      : "nearest_hour",
    targetScheduleId,
  };
};

const parseIds = (value: unknown): number[] | null => {
  if (!Array.isArray(value)) return null;
  const parsed = value.map((id) => parseNumericId(id as string | number));
  if (parsed.some((id) => id === null)) return null;
  return [...new Set(parsed as number[])];
};

const toErrorResponse = (outcome: Extract<PendingActionOutcome, { success: false }>) => {
  const status =
    outcome.error === "conflict" || outcome.error === "no_empty_target"
      ? 409
      : 404;
  return Response.json(outcome, { status });
};

const singleResponse = (result: PendingScheduleActionResult) => {
  if (!result.success) {
    return toErrorResponse(result as Extract<PendingActionOutcome, { success: false }>);
  }
  const body = {
    success: true,
    ...(result.action ? { action: result.action } : {}),
    ...(result.scheduleId !== undefined
      ? { scheduleId: result.scheduleId }
      : {}),
    ...("resetAt" in result && typeof result.resetAt === "string"
      ? { resetAt: result.resetAt }
      : {}),
  };
  return Response.json(body);
};

export const createPendingScheduleCommandHandler =
  (resolveService: ResolvePendingScheduleService) =>
  async (request: Request, env: Env): Promise<Response> => {
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const admin = await requireAdminUser(request, env);
  if (!admin.ok) return admin.response;

  const actor = getActorInfo(request, admin.user);
  const service = resolveService(env);
  const url = new URL(request.url);
  const body = await parseBody(request);
  if (body === INVALID_JSON) {
    return badRequest("Malformed JSON");
  }

  if (url.pathname === "/api/settings/pending/actions") {
    if (!isRecord(body)) return badRequest("Invalid pending action body");
    const action = body.action;
    const mode = body.mode ?? "selected";
    if (
      action !== "approve" &&
      action !== "reject" &&
      action !== "reset_processed"
    ) {
      return badRequest("Invalid pending action");
    }
    if (mode !== "selected" && mode !== "all") {
      return badRequest("Invalid pending action mode");
    }
    if (mode === "all" && action === "reset_processed") {
      return badRequest("reset_processed does not support all mode");
    }

    const ids = mode === "all" ? await service.listIds() : parseIds(body.ids);
    if (!ids || (mode === "selected" && ids.length === 0)) {
      return badRequest("ids are required");
    }
    const options =
      action === "approve" ? parseApprovalOptions(body.options) : null;
    if (options instanceof Response) return options;

    const result = await service.runBatch({
      ids,
      action,
      options,
      actor,
    });
    if (action !== "reset_processed") {
      await service.auditBatch({
        actor,
        action,
        mode,
        ids,
        result,
        endpoint: url.pathname,
      });
    }
    return Response.json(result);
  }

  const singleMatch = url.pathname.match(
    /^\/api\/settings\/pending\/([^/]+)\/(approve|reject|reset-processed|apply-empty-target)$/,
  );
  if (singleMatch) {
    const id = parseNumericId(singleMatch[1]);
    if (id === null) return badRequest("Invalid pending ID");
    const command = singleMatch[2];
    const action: PendingAction =
      command === "reset-processed"
        ? "reset_processed"
        : command === "reject"
          ? "reject"
          : "approve";
    const options =
      action === "approve" && command !== "apply-empty-target"
        ? parseApprovalOptions(body)
        : null;
    if (options instanceof Response) return options;
    return singleResponse(
      await service.runOne({
        id,
        action,
        options,
        actor,
        applyEmptyTarget: command === "apply-empty-target",
      }),
    );
  }

  const selectedAction =
    url.pathname === "/api/settings/pending/approve-selected"
      ? "approve"
      : url.pathname === "/api/settings/pending/reject-selected"
        ? "reject"
        : null;
  if (selectedAction) {
    if (!isRecord(body)) return badRequest("ids array is required");
    const ids = parseIds(body.ids);
    if (!ids) return badRequest("ids array is required");
    if (ids.length === 0) return badRequest("No valid pending IDs");
    const result = await service.runBatch({
      ids,
      action: selectedAction,
      options: null,
      actor,
    });
    await service.auditBatch({
      actor,
      action: selectedAction,
      mode: "selected",
      ids,
      result,
      endpoint: url.pathname,
    });
    return Response.json({ ...result, success: true });
  }

  const allAction =
    url.pathname === "/api/settings/pending/approve-all"
      ? "approve"
      : url.pathname === "/api/settings/pending/reject-all"
        ? "reject"
        : null;
  if (allAction) {
    const ids = await service.listIds();
    const result = await service.runBatch({
      ids,
      action: allAction,
      options: null,
      actor,
    });
    await service.auditBatch({
      actor,
      action: allAction,
      mode: "all",
      ids,
      result,
      endpoint: url.pathname,
    });
    return allAction === "approve"
      ? Response.json({
          success: true,
          approvedCount: result.successCount,
          skippedCount: result.failedCount,
          ...(result.failedCount > 0
            ? {
                skippedItems: result.results
                  .filter((item) => !item.success)
                  .map((item) => ({
                    id: item.id,
                    reason: item.error ?? "unknown",
                  })),
              }
            : {}),
        })
      : Response.json({
          success: true,
          rejectedCount: result.successCount,
        });
  }

  return new Response(null, { status: 404 });
  };
