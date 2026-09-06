import { describe, expect, it } from "vitest";
import { getAuditResultSummary } from "./audit-result";
import type { AdminAuditLog } from "./types";
const log: AdminAuditLog = {id: 1, event_type: "live_schedule.auto_fill", resource_type: "schedule", resource_id: null, action: "auto_fill", status: "success", actor_id: null, actor_name: null, actor_ip: null, target_count: 8, success_count: 0, failure_count: 0, detail: null, error: null, created_at: 0};
describe("audit result interpretation", () => {
  it("does not report unchanged live schedules as unsuccessful targets", () => {
    expect(getAuditResultSummary(log)).toBe("확인 8 · 반영 0 · 실패 0");
    expect(getAuditResultSummary({...log, event_type: "manual_collection.auto_update", success_count: 2})).toBe("확인 8 · 반영 2 · 실패 0");
  });
  it("preserves missing counters instead of converting them to zero", () => {
    expect(getAuditResultSummary({...log, target_count: null, success_count: null, failure_count: null})).toBe("처리 건수 미기록");
    expect(getAuditResultSummary({...log, event_type: "pending.bulk_approve", target_count: 3, success_count: 2, failure_count: 1})).toBe("대상 3 · 성공 2 · 실패 1");
  });
});
