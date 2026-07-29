import type { ScheduleActor } from "../../domain/schedule";

export type ScheduleWriteOperation = "save" | "create" | "update" | "delete";

export type ScheduleWriteAuthorizationRequest = {
  operation: ScheduleWriteOperation;
  actor: ScheduleActor;
};

export interface ScheduleWriteAuthorizationPolicy {
  canWrite(
    request: ScheduleWriteAuthorizationRequest,
  ): boolean | Promise<boolean>;
}
