import type {
  ScheduleWriteAuthorizationPolicy,
  ScheduleWriteAuthorizationRequest,
} from "../application/ports/schedule-write-authorization-policy";
import type { SiteId } from "@contracts/site-definition";
import { SCHEDULE_MEMBER_END } from "@contracts/schedule-member-policy";

export function scheduleWriteRestriction(db: D1Database, input: ScheduleWriteAuthorizationRequest["input"], guard = false) {
  const query = `SELECT EXISTS(SELECT 1 FROM members m WHERE m.code = ? AND (
    (m.uid = ? AND ? > ?) OR EXISTS(
      SELECT 1 FROM schedules s WHERE s.id = ? AND s.member_uid = m.uid AND s.date > ?))) AS restricted`;
  return db.prepare(guard ? `SELECT CASE WHEN (${query}) THEN json_extract('[]','schedule_member_policy') ELSE 1 END` : query)
    .bind(SCHEDULE_MEMBER_END.memberCode, input && "memberUid" in input ? input.memberUid : -1,
      input && "date" in input ? input.date : "", SCHEDULE_MEMBER_END.lastDate, input?.id ?? -1, SCHEDULE_MEMBER_END.lastDate);
}

export class PublicScheduleWritePolicy
  implements ScheduleWriteAuthorizationPolicy
{
  private readonly db?: D1Database;
  private readonly siteId: SiteId;
  constructor(db?: D1Database, siteId: SiteId = "otw") {
    this.db = db;
    this.siteId = siteId;
  }

  canWrite(request: ScheduleWriteAuthorizationRequest): boolean | Promise<boolean> {
    if (this.siteId === "luvdia" && !request.actor.isAdmin) {
      if (!this.db || !request.input) return false;
      return scheduleWriteRestriction(this.db, request.input).first<number>("restricted").then(restricted => !restricted);
    }
    return true;
  }
}
