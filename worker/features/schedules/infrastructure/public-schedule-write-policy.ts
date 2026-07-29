import type {
  ScheduleWriteAuthorizationPolicy,
  ScheduleWriteAuthorizationRequest,
} from "../application/ports/schedule-write-authorization-policy";

export class PublicScheduleWritePolicy
  implements ScheduleWriteAuthorizationPolicy
{
  canWrite(_request: ScheduleWriteAuthorizationRequest): boolean {
    void _request;
    return true;
  }
}
