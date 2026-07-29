import { apiRoutes } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  PendingApprovalOptions,
  PendingSchedule,
  SelectedPendingBatchResponse,
} from "../model/pending-schedule";

export async function fetchPendingSchedules(): Promise<PendingSchedule[]> {
  return apiFetch<PendingSchedule[]>(
    apiRoutes.schedules.pending.list.build(),
    {
    cache: "no-store",
    },
  );
}

type PendingActionsPayload = {
  action: "approve" | "reject" | "reset_processed";
  mode?: "selected" | "all";
  ids?: number[];
  options?: PendingApprovalOptions;
};

async function runPendingActions<T>(payload: PendingActionsPayload): Promise<T> {
  return apiFetch<T>(apiRoutes.schedules.pending.actions.build(), {
    method: "POST",
    json: payload,
  });
}

function assertSinglePendingActionResult(
  response: SelectedPendingBatchResponse,
  pendingId: number,
  fallbackMessage: string,
) {
  const result =
    response.results.find((item) => item.id === pendingId) ??
    response.results[0];
  if (!result?.success) {
    throw new Error(result?.message || result?.error || fallbackMessage);
  }
  return result;
}

export async function approvePendingSchedule(
  pendingId: number,
  options?: PendingApprovalOptions,
): Promise<{ success: boolean; action: string; scheduleId?: number | null }> {
  const response = await runPendingActions<SelectedPendingBatchResponse>({
    action: "approve",
    ids: [pendingId],
    ...(options ? { options } : {}),
  });
  const result = assertSinglePendingActionResult(
    response,
    pendingId,
    "Failed to approve pending schedule",
  );
  return {
    success: true,
    action: result.action ?? "approve",
    scheduleId: result.scheduleId,
  };
}

export async function rejectPendingSchedule(
  pendingId: number,
): Promise<{ success: boolean }> {
  const response = await runPendingActions<SelectedPendingBatchResponse>({
    action: "reject",
    ids: [pendingId],
  });
  assertSinglePendingActionResult(
    response,
    pendingId,
    "Failed to reject pending schedule",
  );
  return { success: true };
}

export async function resetPendingScheduleProcessed(
  pendingId: number,
): Promise<{ success: boolean; resetAt: string }> {
  const response = await runPendingActions<SelectedPendingBatchResponse>({
    action: "reset_processed",
    ids: [pendingId],
  });
  const result = assertSinglePendingActionResult(
    response,
    pendingId,
    "Failed to reset pending schedule",
  );
  return {
    success: true,
    resetAt: result.resetAt ?? "",
  };
}

export async function applyPendingScheduleToEmptyTarget(
  pendingId: number,
): Promise<{ success: boolean; scheduleId: number }> {
  return apiFetch(
    apiRoutes.schedules.pending.applyEmptyTarget.build(pendingId),
    { method: "POST" },
  );
}

export async function approveAllPendingSchedules(): Promise<{
  success: boolean;
  approvedCount: number;
  skippedCount: number;
  skippedItems?: Array<{ id: number; reason: string }>;
}> {
  return runPendingActions({
    action: "approve",
    mode: "all",
  });
}

export async function rejectAllPendingSchedules(): Promise<{
  success: boolean;
  rejectedCount: number;
}> {
  return runPendingActions({
    action: "reject",
    mode: "all",
  });
}

export async function approveSelectedPendingSchedules(
  ids: number[],
): Promise<SelectedPendingBatchResponse> {
  return runPendingActions({
    action: "approve",
    ids,
  });
}

export async function rejectSelectedPendingSchedules(
  ids: number[],
): Promise<SelectedPendingBatchResponse> {
  return runPendingActions({
    action: "reject",
    ids,
  });
}
