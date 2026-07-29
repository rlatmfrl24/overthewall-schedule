import type {
  PendingApprovalOptions,
  PendingRejectionOptions,
} from "../../../../../contracts/pending-schedules";
import type { ScheduleActor } from "../../domain/schedule";
import type { PendingScheduleRow } from "../../domain/pending-schedule";

export type PendingActionOutcome =
  | {
      success: true;
      action:
        | "create"
        | "update"
        | "reject"
        | "reset_processed"
        | "reopen_rejection"
        | "candidate_obsolete";
      scheduleId?: number | null;
      resetAt?: string;
    }
  | {
      success: false;
      error:
        | "conflict"
        | "not_found"
        | "no_empty_target"
        | "stale"
        | "validation";
      message: string;
      conflictingScheduleId?: number;
    };

export interface PendingScheduleRepository {
  findById(id: number): Promise<PendingScheduleRow | null>;
  listIds(): Promise<number[]>;
  findEmptyTarget(item: PendingScheduleRow): Promise<{
    id: number;
    status: string;
  } | null>;
  approve(
    item: PendingScheduleRow,
    options: PendingApprovalOptions | null,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome>;
  applyToEmptyTarget(
    item: PendingScheduleRow,
    target: { id: number; status: string },
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome>;
  reject(
    item: PendingScheduleRow,
    actor: ScheduleActor,
    options: PendingRejectionOptions | null,
  ): Promise<PendingActionOutcome>;
  reopenRejection(
    id: number,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome>;
  resetProcessed(
    item: PendingScheduleRow,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome>;
}
