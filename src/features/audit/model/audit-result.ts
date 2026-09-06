import type { AdminAuditLog } from "./types";

// Collection counters represent checked inputs and applied changes, not a success rate.
export function getAuditResultSummary(log: AdminAuditLog): string {
  const parts: string[] = [];
  const collection = log.event_type === "live_schedule.auto_fill" || log.event_type === "manual_collection.auto_update";
  if (log.target_count !== null) parts.push(`${collection ? "확인" : "대상"} ${log.target_count}`);
  if (log.success_count !== null) parts.push(`${collection ? "반영" : "성공"} ${log.success_count}`);
  if (log.failure_count !== null) parts.push(`실패 ${log.failure_count}`);
  return parts.length ? parts.join(" · ") : "처리 건수 미기록";
}
