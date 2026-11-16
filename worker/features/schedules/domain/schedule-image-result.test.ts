import { describe, expect, it } from "vitest";
import { parseScheduleImageResult } from "./schedule-image-result";

const row = { sourceMemberName: "하루", date: "2026-11-12", sourceDate: "11/12", weekday: 4, time: "21:00", timeState: "specified", status: "방송", title: null };
const parse = (change = {}, extra = {}) => parseScheduleImageResult({ rows: [{ ...row, ...change }], yearText: "2026", warnings: [], overflow: false, ...extra }, [{ uid: 1, name: "하루" }]);
describe("schedule image result", () => {
  it("identifies the default Flash-Lite model in editable drafts", () => {
    expect(parse()?.model).toBe("gemini-3.5-flash-lite");
  });
  it("matches a printed account handle to a unique current member and rejects ambiguous names",()=>{
    const members=[{uid:4,name:"쿠레나이 나츠키",code:"kurenai_natsuki",url_twitter:"https://x.com/kurenai_natsuki"}];
    const result=(sourceMemberName:string,matchedMemberName:string|null=null,list=members)=>parseScheduleImageResult({rows:[{...row,sourceMemberName,matchedMemberName}],yearText:"2026",warnings:[],overflow:false},list);
    expect(result("@KURENAI_NATSUKI")?.rows[0].memberUid).toBe(4);
    expect(result("쿠레나이나츠키","쿠레나이 나츠키")?.rows[0].memberUid).toBe(4);
    expect(result("알 수 없는 이름",null)?.rows[0].memberUid).toBeNull();
    expect(result("@kurenai_natsuki",null,[...members,{uid:9,name:"다른 나츠키",code:"other_natsuki",url_twitter:"https://x.com/kurenai_natsuki"}])?.rows[0].memberUid).toBeNull();
    expect(result("@kurenai_natsuki","쿠레나이 나츠키",[...members,{uid:9,name:"다른 나츠키",code:"other_natsuki",url_twitter:"https://x.com/kurenai_natsuki"}])?.rows[0].memberUid).toBeNull();
  });
  it("preserves_unreadable_time_without_delete_status", () => {
    expect(parse({ time: null, timeState: "unreadable" })?.rows[0]).toMatchObject({ startTime: null, timeState: "unreadable", status: "방송", needsReview: ["time"] });
    expect(parse({ status: "미정" })).toBeNull();
  });
  it("rejects_unknown_member_and_invalid_calendar_date", () => {
    expect(parse({ sourceMemberName: "모르는 이름", memberUid: 999 })?.rows[0]).toMatchObject({ memberUid: null, needsReview: ["member"] });
    expect(parse({ date: "2026-02-30" })).toBeNull();
  });
  it("normalizes_explicit_25_hour_to_next_kst_date", () => {
    expect(parse({ time: "25:00" })?.rows[0]).toMatchObject({ date: "2026-11-13", startTime: "01:00", sourceTime: "25:00", dateShiftDays: 1 });
  });
  it("preserves_missing_title_without_inventing_holiday", () => {
    expect(parse()?.rows[0]).toMatchObject({ title: null, status: "방송" });
    expect(parse({ status: null })?.rows[0].needsReview).toContain("status");
  });
  it("keeps_ambiguous_midnight_expression_for_review", () => {
    expect(parse({ date: null, time: "밤 늦게", timeState: "unreadable" })?.rows[0]).toMatchObject({ date: null, startTime: null, needsWeekConfirmation: true });
    expect(parse({ date: null, time: "25:00" })?.rows[0]).toMatchObject({ date: null, weekday: 4, dateShiftDays: 1 });
  });
  it("requires confirmation for a guessed year while preserving an explicitly printed year", () => {
    expect(parse({ date: "2020-11-16", sourceDate: "16", weekday: 1 }, { yearText: null })?.rows[0]).toMatchObject({ date: null, needsWeekConfirmation: true, needsReview: ["date"] });
    expect(parse({ date: "2026-11-12" }, { yearText: "2026 주간 스케줄" })?.rows[0]).toMatchObject({ date: "2026-11-12", needsWeekConfirmation: false });
    expect(parse({ date: "2025-11-16" }, { yearText: "2026" })?.rows[0]).toMatchObject({ date: null, needsWeekConfirmation: true });
  });
  it("normalizes clear AM/PM times and flags ambiguous times for review", () => {
    expect(parse({ time: "PM 6:00", timeState: "specified" }, { yearText: "2026" })?.rows[0]).toMatchObject({ timeState: "specified", startTime: "18:00", sourceTime: "PM 6:00", needsReview: [] });
    expect(parse({ time: "AM 12:30" })?.rows[0]?.startTime).toBe("00:30");
    expect(parse({ time: "PM 12:30" })?.rows[0]?.startTime).toBe("12:30");
    expect(parse({ time: "PM 0:00" })?.rows[0]).toMatchObject({ timeState: "unreadable", startTime: null, needsReview: ["time"] });
  });
  it("does_not_accept_truncated_or_more_than_100_rows_as_complete", () => {
    expect(parse({}, { overflow: true })).toBeNull();
    expect(parse({}, { rows: Array.from({ length: 101 }, () => row) })).toBeNull();
    expect(parse({ time: "99:00" })?.rows[0]).toMatchObject({ timeState: "unreadable", startTime: null, needsReview: ["time"] });
  });
});
