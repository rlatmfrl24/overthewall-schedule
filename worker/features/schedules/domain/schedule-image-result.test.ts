import { describe, expect, it } from "vitest";
import { parseScheduleImageResult } from "./schedule-image-result";

const row = { sourceMemberName: "하루", date: "2026-11-12", sourceDate: "11/12", weekday: 4, time: "21:00", timeState: "specified", status: "방송", title: null };
const parse = (change = {}, extra = {}) => parseScheduleImageResult({ rows: [{ ...row, ...change }], warnings: [], overflow: false, ...extra }, [{ uid: 1, name: "하루" }]);
describe("schedule image result", () => {
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
  it("does_not_accept_truncated_or_more_than_100_rows_as_complete", () => {
    expect(parse({}, { overflow: true })).toBeNull();
    expect(parse({}, { rows: Array.from({ length: 101 }, () => row) })).toBeNull();
    expect(parse({ time: "99:00" })).toBeNull();
  });
});
