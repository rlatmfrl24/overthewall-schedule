import type { ScheduleActor } from "../../domain/schedule";

export interface PendingBulkAuditPayload {
  eventType: "pending.bulk_approve" | "pending.bulk_reject";
  action: "approve" | "reject";
  status: "success" | "partial" | "failed";
  actor: ScheduleActor;
  targetCount: number;
  successCount: number;
  failureCount: number;
  detail: Record<string, unknown>;
}

export interface PendingBulkAudit {
  insert(payload: PendingBulkAuditPayload): Promise<void>;
}
