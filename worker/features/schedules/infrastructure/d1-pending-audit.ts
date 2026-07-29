import type {
  PendingBulkAudit,
  PendingBulkAuditPayload,
} from "../application/ports/pending-bulk-audit";

export const insertPendingBulkAudit = async (
  db: D1Database,
  payload: PendingBulkAuditPayload,
) => {
  await db
    .prepare(
      `INSERT INTO admin_audit_logs (
         event_type,
         resource_type,
         resource_id,
         action,
         status,
         actor_id,
         actor_name,
         actor_ip,
         target_count,
         success_count,
         failure_count,
         detail,
         error,
         created_at
       )
       VALUES (?, 'pending_schedules', NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
    )
    .bind(
      payload.eventType,
      payload.action,
      payload.status,
      payload.actor.actorId,
      payload.actor.actorName,
      payload.actor.actorIp,
      payload.targetCount,
      payload.successCount,
      payload.failureCount,
      JSON.stringify(payload.detail),
      Date.now(),
    )
    .run();
};

export class D1PendingBulkAudit implements PendingBulkAudit {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  insert(payload: PendingBulkAuditPayload) {
    return insertPendingBulkAudit(this.database, payload);
  }
}
