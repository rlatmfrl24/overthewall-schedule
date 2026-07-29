import type { PendingApprovalOptions } from "../../../../contracts/pending-schedules";
import type {
  PendingActionOutcome,
  PendingScheduleRepository,
} from "../application/ports/pending-schedule-repository";
import {
  getPendingApprovalValues,
  type PendingScheduleRow,
} from "../domain/pending-schedule";
import type { ScheduleActor } from "../domain/schedule";

type IdRow = { id: number };
type EmptyTargetRow = { id: number; status: string };

const PENDING_SELECT = `
  SELECT
    id,
    member_uid,
    member_name,
    date,
    start_time,
    title,
    status,
    action_type,
    existing_schedule_id,
    previous_status,
    previous_title
  FROM pending_schedules
`;

const LOG_COLUMNS = `
  schedule_id,
  member_uid,
  member_name,
  actor_id,
  actor_name,
  actor_ip,
  schedule_date,
  action,
  title,
  previous_status
`;

const actorBindings = (actor: ScheduleActor) => [
  actor.actorId,
  actor.actorName,
  actor.actorIp,
];

const timeToMinutes = (time: string | null) => {
  if (!time) return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};

const staleOutcome = (): PendingActionOutcome => ({
  success: false,
  error: "stale",
  message: "이미 처리되었거나 상태가 변경된 대기 스케줄입니다.",
});

export class D1PendingScheduleRepository
  implements PendingScheduleRepository
{
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  findById(id: number): Promise<PendingScheduleRow | null> {
    return this.db
      .prepare(`${PENDING_SELECT} WHERE id = ?`)
      .bind(id)
      .first<PendingScheduleRow>();
  }

  async listIds(): Promise<number[]> {
    const result = await this.db
      .prepare(
        "SELECT id FROM pending_schedules ORDER BY created_at DESC, id DESC",
      )
      .all<IdRow>();
    return result.results.map((row) => row.id);
  }

  findEmptyTarget(
    item: PendingScheduleRow,
  ): Promise<EmptyTargetRow | null> {
    return this.db
      .prepare(
        `SELECT id, status
         FROM schedules
         WHERE member_uid = ?
           AND date = ?
           AND COALESCE(TRIM(start_time), '') = ''
           AND COALESCE(TRIM(title), '') = ''
         ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, id
         LIMIT 1`,
      )
      .bind(item.member_uid, item.date, item.existing_schedule_id ?? -1)
      .first<EmptyTargetRow>();
  }

  async approve(
    item: PendingScheduleRow,
    options: PendingApprovalOptions | null,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const targetMode =
      options?.targetMode ??
      (item.action_type === "create" ? "create" : "update");
    const normalizedOptions: PendingApprovalOptions =
      options ?? {
        applyMode: "all",
        targetMode,
        timeMode: "exact",
        targetScheduleId: null,
      };
    const values = getPendingApprovalValues(item, normalizedOptions);

    if (targetMode === "create") {
      return this.createFromPending(
        item,
        values.startTime,
        values.title,
        actor,
      );
    }

    const targetId =
      normalizedOptions.targetScheduleId ?? item.existing_schedule_id;
    if (!targetId) {
      return {
        success: false,
        error: "not_found",
        message: "수정 대상 스케줄을 찾을 수 없습니다.",
      };
    }

    return this.updateFromPending(
      item,
      targetId,
      normalizedOptions,
      values,
      actor,
      options !== null,
    );
  }

  async applyToEmptyTarget(
    item: PendingScheduleRow,
    target: EmptyTargetRow,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE schedules
           SET start_time = ?, title = ?, status = ?
           WHERE id = ?
             AND member_uid = ?
             AND date = ?
             AND COALESCE(TRIM(start_time), '') = ''
             AND COALESCE(TRIM(title), '') = ''
             AND EXISTS (
               SELECT 1 FROM pending_schedules WHERE id = ?
             )`,
        )
        .bind(
          item.start_time,
          item.title,
          item.status,
          target.id,
          item.member_uid,
          item.date,
          item.id,
        ),
      this.approvalLogStatement(
        item,
        target.id,
        target.status,
        actor,
      ),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);

    if (results[0].meta.changes !== 1) {
      return staleOutcome();
    }
    return { success: true, action: "update", scheduleId: target.id };
  }

  async reject(
    item: PendingScheduleRow,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO update_logs (${LOG_COLUMNS})
           SELECT
             existing_schedule_id,
             member_uid,
             member_name,
             ?,
             ?,
             ?,
             date,
             'reject',
             title,
             previous_status
           FROM pending_schedules
           WHERE id = ?`,
        )
        .bind(...actorBindings(actor), item.id),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);

    if (results[0].meta.changes !== 1) {
      return staleOutcome();
    }
    return { success: true, action: "reject" };
  }

  async resetProcessed(
    item: PendingScheduleRow,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const resetAt = new Date().toISOString();
    const results = await this.db.batch([
      this.db
        .prepare(
          "UPDATE pending_schedules SET processed_reset_at = ? WHERE id = ?",
        )
        .bind(resetAt, item.id),
      this.db
        .prepare(
          `INSERT INTO update_logs (${LOG_COLUMNS})
           SELECT
             existing_schedule_id,
             member_uid,
             member_name,
             ?,
             ?,
             ?,
             date,
             'reset_processed',
             title,
             'pending:' || id
           FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(...actorBindings(actor), item.id),
    ]);

    if (results[0].meta.changes !== 1) {
      return staleOutcome();
    }
    return { success: true, action: "reset_processed", resetAt };
  }

  private async createFromPending(
    item: PendingScheduleRow,
    startTime: string | null,
    title: string | null,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const minutes = timeToMinutes(startTime);
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO schedules (member_uid, date, start_time, title, status)
           SELECT member_uid, date, ?, ?, status
           FROM pending_schedules AS pending
           WHERE pending.id = ?
             AND (
               ? IS NULL
               OR NOT EXISTS (
                 SELECT 1
                 FROM schedules AS existing
                 WHERE existing.member_uid = pending.member_uid
                   AND existing.date = pending.date
                   AND existing.start_time IS NOT NULL
                   AND ABS(
                     (
                       CAST(SUBSTR(existing.start_time, 1, 2) AS INTEGER) * 60
                       + CAST(SUBSTR(existing.start_time, 4, 2) AS INTEGER)
                     ) - ?
                   ) <= 30
               )
             )`,
        )
        .bind(startTime, title, item.id, minutes, minutes),
      this.db
        .prepare(
          `INSERT INTO update_logs (${LOG_COLUMNS})
           SELECT
             last_insert_rowid(),
             member_uid,
             member_name,
             ?,
             ?,
             ?,
             date,
             'approve',
             title,
             previous_status
           FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(...actorBindings(actor), item.id),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);

    if (results[0].meta.changes !== 1) {
      const current = await this.findById(item.id);
      if (current && minutes !== null) {
        const conflict = await this.findTimeConflict(item, minutes);
        if (conflict) {
          return {
            success: false,
            error: "conflict",
            message: `이미 비슷한 시간(${conflict.start_time})에 스케줄이 존재합니다.`,
            conflictingScheduleId: conflict.id,
          };
        }
      }
      return staleOutcome();
    }

    const scheduleId = Number(results[0].meta.last_row_id);
    return {
      success: true,
      action: "create",
      scheduleId: Number.isSafeInteger(scheduleId) ? scheduleId : null,
    };
  }

  private async updateFromPending(
    item: PendingScheduleRow,
    targetId: number,
    options: PendingApprovalOptions,
    values: { startTime: string | null; title: string | null },
    actor: ScheduleActor,
    usesExplicitOptions: boolean,
  ): Promise<PendingActionOutcome> {
    const assignments: string[] = [];
    const bindings: unknown[] = [];
    if (options.applyMode === "all" || options.applyMode === "time") {
      assignments.push("start_time = ?");
      bindings.push(values.startTime);
    }
    if (options.applyMode === "all" || options.applyMode === "title") {
      assignments.push("title = ?");
      bindings.push(values.title);
    }
    if (options.applyMode === "all") {
      assignments.push(
        "status = (SELECT status FROM pending_schedules WHERE id = ?)",
      );
      bindings.push(item.id);
    }

    const target = await this.db
      .prepare(
        `SELECT id, status
         FROM schedules
         WHERE id = ? AND member_uid = ? AND date = ?`,
      )
      .bind(targetId, item.member_uid, item.date)
      .first<EmptyTargetRow>();
    if (!target) {
      return {
        success: false,
        error: "not_found",
        message: "수정 대상 스케줄을 찾을 수 없습니다.",
      };
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE schedules
           SET ${assignments.join(", ")}
           WHERE id = ?
             AND member_uid = ?
             AND date = ?
             AND EXISTS (
               SELECT 1 FROM pending_schedules WHERE id = ?
             )`,
        )
        .bind(
          ...bindings,
          targetId,
          item.member_uid,
          item.date,
          item.id,
        ),
      this.approvalLogStatement(
        item,
        targetId,
        usesExplicitOptions ? target.status : item.previous_status,
        actor,
      ),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);

    if (results[0].meta.changes !== 1) {
      return staleOutcome();
    }
    return { success: true, action: "update", scheduleId: targetId };
  }

  private approvalLogStatement(
    item: PendingScheduleRow,
    scheduleId: number,
    previousStatus: string | null,
    actor: ScheduleActor,
  ) {
    return this.db
      .prepare(
        `INSERT INTO update_logs (${LOG_COLUMNS})
         SELECT
           ?,
           member_uid,
           member_name,
           ?,
           ?,
           ?,
           date,
           'approve',
           title,
           ?
         FROM pending_schedules
         WHERE id = ? AND changes() = 1`,
      )
      .bind(
        scheduleId,
        ...actorBindings(actor),
        previousStatus,
        item.id,
      );
  }

  private findTimeConflict(
    item: PendingScheduleRow,
    minutes: number,
  ): Promise<{ id: number; start_time: string } | null> {
    return this.db
      .prepare(
        `SELECT id, start_time
         FROM schedules
         WHERE member_uid = ?
           AND date = ?
           AND start_time IS NOT NULL
           AND ABS(
             (
               CAST(SUBSTR(start_time, 1, 2) AS INTEGER) * 60
               + CAST(SUBSTR(start_time, 4, 2) AS INTEGER)
             ) - ?
           ) <= 30
         ORDER BY id
         LIMIT 1`,
      )
      .bind(item.member_uid, item.date, minutes)
      .first<{ id: number; start_time: string }>();
  }
}
