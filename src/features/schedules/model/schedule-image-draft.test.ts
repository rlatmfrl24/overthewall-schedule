import { expect, it } from "vitest";
import { buildImageGroups, confirmImageWeek, inspectImageRows, mapImageMember, type EditableImageRow } from "./schedule-image-draft";
import type { ScheduleImageContext } from "@contracts/schedule-image-import";
const row = (change: Partial<EditableImageRow> = {}): EditableImageRow => ({ clientId:"1",sourceMemberName:"하루",memberUid:1,date:"2026-11-12",sourceDate:"목요일",weekday:4,
  startTime:"21:00",sourceTime:"21:00",dateShiftDays:0,needsWeekConfirmation:false,timeState:"specified",status:"방송",title:null,needsReview:[],selected:true,choice:null,...change });
const context: ScheduleImageContext = { expected:"[]",schedules:[] };
const contexts = new Map([["1:2026-11-12",context]]);
it("requires_confirmation_before_using_displayed_week", () => {
  const rows=[row({ date:null,needsWeekConfirmation:true,dateShiftDays:1 })];
  expect(inspectImageRows(rows,contexts).unresolved.has("1")).toBe(true);
  expect(confirmImageWeek(rows,"2026-11-09")[0]).toMatchObject({date:"2026-11-13",needsWeekConfirmation:false});
});
it("maps_same_unresolved_name_once_for_all_matching_rows", () => {
  expect(mapImageMember([row({memberUid:null}),row({clientId:"2",memberUid:null}),row({clientId:"3",sourceMemberName:"다른 이름",memberUid:null})],"1",2).map(r=>r.memberUid)).toEqual([2,2,null]);
});
it("excludes_exact_duplicates_against_saved_and_draft_rows", () => {
  const rows=[row(),row({clientId:"2"})];
  expect(inspectImageRows(rows,contexts).duplicates.has("2")).toBe(true);
  expect(buildImageGroups(rows,contexts)[0].changes).toHaveLength(1);
  const existing={...context,schedules:[{id:10,member_uid:1,date:"2026-11-12",start_time:"21:00",status:"방송" as const,title:null,created_at:null}]};
  expect(inspectImageRows([row()],new Map([["1:2026-11-12",existing]])).duplicates.has("1")).toBe(true);
});
it("requires_explicit_existing_target_or_new_schedule_choice", () => {
  const existing={...context,schedules:[{id:10,member_uid:1,date:"2026-11-12",start_time:"20:00",status:"방송" as const,title:"기존",created_at:null}]};
  const map=new Map([["1:2026-11-12",existing]]);
  expect(buildImageGroups([row()],map)).toEqual([]);
  expect(buildImageGroups([row({choice:"edit:10"})],map)[0].changes[0].id).toBe(10);
  expect(buildImageGroups([row({choice:"add"})],map)[0].changes[0].id).toBeNull();
});
it("allows_excluding_unresolved_rows_without_resolving_them and explicit_undecided_time_keeps_broadcast_status", () => {
  const groups=buildImageGroups([row({startTime:null,timeState:"undecided"}),row({clientId:"2",memberUid:null,selected:false})],contexts);
  expect(groups[0].changes).toMatchObject([{status:"방송",startTime:null}]);
});
it("blocks_mutually_exclusive_draft_rows_until_resolved", () => {
  expect(()=>buildImageGroups([row(),row({clientId:"2",status:"휴방"})],contexts)).toThrow("충돌");
});
