import type { ScheduleActor, ScheduleWriteInput } from "../../domain/schedule";

export type ScheduleWriteOperation = "save" | "create" | "update" | "delete";

export type ScheduleWriteAuthorizationRequest = {
  operation: ScheduleWriteOperation;
  actor: ScheduleActor;
  input?: ScheduleWriteInput | { id: number };
};

export interface ScheduleWriteAuthorizationPolicy {
  canWrite(
    request: ScheduleWriteAuthorizationRequest,
  ): boolean | Promise<boolean>;
}
