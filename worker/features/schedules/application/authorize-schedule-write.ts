import type {
  ScheduleWriteAuthorizationPolicy,
  ScheduleWriteAuthorizationRequest,
} from "./ports/schedule-write-authorization-policy";

export const authorizeScheduleWrite = (
  policy: ScheduleWriteAuthorizationPolicy,
  request: ScheduleWriteAuthorizationRequest,
): Promise<boolean> => Promise.resolve(policy.canWrite(request));
