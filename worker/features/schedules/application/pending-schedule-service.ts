import type {
  PendingAction,
  PendingApprovalOptions,
  PendingRejectionOptions,
  PendingScheduleActionResult,
  PendingScheduleBatchResult,
} from "../../../../contracts/pending-schedules";
import type { ScheduleActor } from "../domain/schedule";
import {
  approvePendingSchedule,
  rejectPendingSchedule,
  resetPendingProcessed,
} from "./process-pending-schedule";
import type { PendingBulkAudit } from "./ports/pending-bulk-audit";
import type {
  PendingActionOutcome,
  PendingScheduleRepository,
} from "./ports/pending-schedule-repository";

type RunOneInput = {
  id: number;
  action: PendingAction;
  options: PendingApprovalOptions | null;
  rejectionOptions?: PendingRejectionOptions | null;
  actor: ScheduleActor;
  applyEmptyTarget?: boolean;
};

type RunBatchInput = {
  ids: number[];
  action: PendingAction;
  options: PendingApprovalOptions | null;
  rejectionOptions?: PendingRejectionOptions | null;
  actor: ScheduleActor;
};

type AuditBatchInput = {
  action: "approve" | "reject";
  mode: "selected" | "all";
  ids: number[];
  result: PendingScheduleBatchResult;
  endpoint: string;
  actor: ScheduleActor;
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  const iterator = items.entries();
  const worker = async () => {
    for (const [index, item] of iterator) {
      results[index] = await mapper(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
};

const toActionResult = (
  id: number,
  outcome: PendingActionOutcome,
): PendingScheduleActionResult => ({
  id,
  ...outcome,
});

const toUnexpectedBatchFailure = (
  id: number,
): PendingScheduleActionResult => ({
  id,
  success: false,
  error: "error",
  message: "대기 스케줄 처리 중 오류가 발생했습니다.",
});

export class PendingScheduleService {
  private readonly repository: PendingScheduleRepository;
  private readonly audit: PendingBulkAudit;

  constructor(
    repository: PendingScheduleRepository,
    audit: PendingBulkAudit,
  ) {
    this.repository = repository;
    this.audit = audit;
  }

  listIds() {
    return this.repository.listIds();
  }

  async runOne({
    id,
    action,
    options,
    rejectionOptions = null,
    actor,
    applyEmptyTarget = false,
  }: RunOneInput): Promise<PendingScheduleActionResult> {
    const item = await this.repository.findById(id);
    if (!item) {
      return {
        id,
        success: false,
        error: "not_found",
        message: "대기 스케줄을 찾을 수 없습니다.",
      };
    }

    let outcome: PendingActionOutcome;
    if (applyEmptyTarget) {
      const target = await this.repository.findEmptyTarget(item);
      outcome = target
        ? await this.repository.applyToEmptyTarget(item, target, actor)
        : {
            success: false,
            error: "no_empty_target",
            message:
              "제목과 방송 시작 시간이 모두 비어 있는 기존 스케줄을 찾을 수 없습니다.",
          };
    } else if (action === "approve") {
      outcome = await approvePendingSchedule(
        this.repository,
        item,
        options,
        actor,
      );
    } else if (action === "reject") {
      outcome = await rejectPendingSchedule(
        this.repository,
        item,
        actor,
        rejectionOptions,
      );
    } else {
      outcome = await resetPendingProcessed(this.repository, item, actor);
    }

    return toActionResult(id, outcome);
  }

  async runBatch({
    ids,
    action,
    options,
    rejectionOptions = null,
    actor,
  }: RunBatchInput): Promise<PendingScheduleBatchResult> {
    const results = await mapWithConcurrency(
      ids,
      async (id) => {
        try {
          return await this.runOne({
            id,
            action,
            options,
            rejectionOptions,
            actor,
          });
        } catch (error) {
          console.error(
            `Failed to ${action} pending schedule ${id}:`,
            error,
          );
          return toUnexpectedBatchFailure(id);
        }
      },
      4,
    );
    const successCount = results.filter((result) => result.success).length;
    return {
      success: successCount === ids.length,
      totalRequested: ids.length,
      successCount,
      failedCount: ids.length - successCount,
      results,
    };
  }

  async reopenRejection(id: number, actor: ScheduleActor) {
    return toActionResult(
      id,
      await this.repository.reopenRejection(id, actor),
    );
  }

  async auditBatch({
    actor,
    action,
    mode,
    ids,
    result,
    endpoint,
  }: AuditBatchInput) {
    if (mode === "selected" && ids.length <= 1) return;
    const status =
      result.failedCount === 0
        ? "success"
        : result.successCount === 0
          ? "failed"
          : "partial";
    await this.audit.insert({
      eventType:
        action === "approve"
          ? "pending.bulk_approve"
          : "pending.bulk_reject",
      action,
      status,
      actor,
      targetCount: result.totalRequested,
      successCount: result.successCount,
      failureCount: result.failedCount,
      detail: {
        mode,
        endpoint,
        ...(mode === "selected"
          ? {
              ids: ids.slice(0, 50),
              omittedCount: Math.max(0, ids.length - 50),
            }
          : {}),
      },
    });
  }
}
