import type { ApplyScheduleImageGroup, ScheduleImageContext, ScheduleImageReceipt } from "../../../../contracts/schedule-image-import";
import type { ScheduleActor } from "../domain/schedule";
import type { ScheduleWriteAuthorizationPolicy } from "./ports/schedule-write-authorization-policy";
import { authorizeScheduleWrite } from "./authorize-schedule-write";
import { ScheduleImageError } from "./read-schedule-image";

export interface ScheduleImageWriter {
  imageContext(memberUid: number, date: string, actor: ScheduleActor): Promise<ScheduleImageContext>;
  applyImageGroup(group: ApplyScheduleImageGroup, actor: ScheduleActor): Promise<ScheduleImageReceipt>;
  imageResult(operationId: string, actor: ScheduleActor): Promise<ScheduleImageReceipt | null>;
}
export class ScheduleImageApplyService {
  private readonly writer: ScheduleImageWriter;
  private readonly policy: ScheduleWriteAuthorizationPolicy;
  constructor(writer: ScheduleImageWriter, policy: ScheduleWriteAuthorizationPolicy) { this.writer=writer; this.policy=policy; }
  context(memberUid: number, date: string, actor: ScheduleActor) { return this.writer.imageContext(memberUid, date, actor); }
  result(operationId: string, actor: ScheduleActor) { return this.writer.imageResult(operationId, actor); }
  async apply(group: ApplyScheduleImageGroup, actor: ScheduleActor) {
    // Return an already committed result even if write permission has since changed.
    const result = await this.writer.imageResult(group.operationId, actor);
    if (!result) for (const c of group.changes) {
      if (!await authorizeScheduleWrite(this.policy, { operation: "save", actor, input: { id:c.id, memberUid:group.memberUid, date:group.date, startTime:c.startTime, title:c.title, status:c.status } })) throw new ScheduleImageError("일정 저장 권한이 필요합니다.", 403);
    }
    return this.writer.applyImageGroup(group, actor);
  }
}
