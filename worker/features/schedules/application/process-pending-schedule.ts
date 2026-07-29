import type {
  PendingApprovalOptions,
  PendingRejectionOptions,
} from "../../../../contracts/pending-schedules";
import type { PendingScheduleRow } from "../domain/pending-schedule";
import type { ScheduleActor } from "../domain/schedule";
import type {
  PendingActionOutcome,
  PendingScheduleRepository,
} from "./ports/pending-schedule-repository";

export const approvePendingSchedule = (
  repository: PendingScheduleRepository,
  item: PendingScheduleRow,
  options: PendingApprovalOptions | null,
  actor: ScheduleActor,
): Promise<PendingActionOutcome> => repository.approve(item, options, actor);

export const rejectPendingSchedule = (
  repository: PendingScheduleRepository,
  item: PendingScheduleRow,
  actor: ScheduleActor,
  options: PendingRejectionOptions | null,
): Promise<PendingActionOutcome> => repository.reject(item, actor, options);

export const resetPendingProcessed = (
  repository: PendingScheduleRepository,
  item: PendingScheduleRow,
  actor: ScheduleActor,
): Promise<PendingActionOutcome> => repository.resetProcessed(item, actor);
