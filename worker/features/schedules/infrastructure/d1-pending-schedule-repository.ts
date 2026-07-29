import type {
  PendingApprovalOptions,
  PendingRejectionOptions,
} from "../../../../contracts/pending-schedules";
import type {
  PendingActionOutcome,
  PendingScheduleRepository,
} from "../application/ports/pending-schedule-repository";
import {
  getPendingApprovalValues,
  type PendingScheduleRow,
} from "../domain/pending-schedule";
import type { ScheduleActor } from "../domain/schedule";
import {
  AUTO_UPDATE_TIME_WINDOW_MINUTES,
  getTitleSimilarity,
} from "../domain/auto-update-matcher";

type IdRow = { id: number };
type EmptyTargetRow = {
  id: number;
  status: string;
  start_time?: string | null;
  title?: string | null;
};

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
    previous_title,
    previous_start_time,
    candidate_kind,
    match_reason,
    match_confidence,
    ranked_schedule_ids,
    source_vod_ids,
    session_started_at,
    session_ended_at,
    vod_segment_count,
    vod_id,
    vod_started_at,
    vod_duration_seconds,
    vod_thumbnail_url
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
  previous_status,
  vod_id,
  reason_code,
  reason_note
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
    if (
      item.candidate_kind === "ambiguous" &&
      !options?.targetScheduleId
    ) {
      return {
        success: false,
        error: "validation",
        message: "매칭이 불확실한 후보는 수정할 일정을 먼저 선택해야 합니다.",
      };
    }
    const targetMode =
      item.candidate_kind &&
      item.candidate_kind !== "missing_schedule"
        ? "update"
        : options?.targetMode ??
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
    if (item.candidate_kind) {
      const options: PendingApprovalOptions = {
        applyMode: "all",
        targetMode: "update",
        timeMode: "exact",
        targetScheduleId: target.id,
      };
      return this.updateFromPending(
        item,
        target.id,
        options,
        { startTime: item.start_time, title: item.title },
        actor,
        true,
      );
    }
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
    options: PendingRejectionOptions | null,
  ): Promise<PendingActionOutcome> {
    const reasonCode = options?.reasonCode ?? null;
    const reasonNote = options?.reasonNote?.trim() || null;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO schedule_candidate_rejections (
             vod_id,
             member_uid,
             member_name,
             date,
             start_time,
             title,
             status,
             action_type,
             existing_schedule_id,
             previous_status,
             previous_title,
             previous_start_time,
             candidate_kind,
             match_reason,
             match_confidence,
             ranked_schedule_ids,
             source_vod_ids,
             session_started_at,
             session_ended_at,
             vod_segment_count,
             vod_started_at,
             vod_duration_seconds,
             vod_thumbnail_url,
             reason_code,
             reason_note,
             actor_id,
             actor_name,
             actor_ip
           )
           SELECT
             vod_id,
             member_uid,
             member_name,
             date,
             start_time,
             title,
             status,
             action_type,
             existing_schedule_id,
             previous_status,
             previous_title,
             previous_start_time,
             candidate_kind,
             match_reason,
             match_confidence,
             ranked_schedule_ids,
             source_vod_ids,
             session_started_at,
             session_ended_at,
             vod_segment_count,
             vod_started_at,
             vod_duration_seconds,
             vod_thumbnail_url,
             ?,
             ?,
             ?,
             ?,
             ?
           FROM pending_schedules
           WHERE id = ? AND vod_id IS NOT NULL
           ON CONFLICT(vod_id) DO NOTHING`,
        )
        .bind(
          reasonCode,
          reasonNote,
          ...actorBindings(actor),
          item.id,
        ),
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
             previous_status,
             vod_id,
             ?,
             ?
           FROM pending_schedules
           WHERE id = ?
             AND (
               vod_id IS NULL
               OR EXISTS (
                 SELECT 1
                 FROM schedule_candidate_rejections AS rejection
                 WHERE rejection.vod_id = pending_schedules.vod_id
               )
             )`,
        )
        .bind(
          ...actorBindings(actor),
          reasonCode,
          reasonNote,
          item.id,
        ),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);

    if (results[2].meta.changes !== 1) {
      return staleOutcome();
    }
    return { success: true, action: "reject" };
  }

  async reopenRejection(
    id: number,
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
             'reopen_rejection',
             title,
             previous_status,
             vod_id,
             reason_code,
             reason_note
           FROM schedule_candidate_rejections
           WHERE id = ?`,
        )
        .bind(...actorBindings(actor), id),
      this.db
        .prepare(
          `DELETE FROM schedule_candidate_rejections
           WHERE id = ? AND changes() = 1`,
        )
        .bind(id),
    ]);

    if (results[1].meta.changes !== 1) {
      return {
        success: false,
        error: "not_found",
        message: "거부 제외 기록을 찾을 수 없습니다.",
      };
    }
    return { success: true, action: "reopen_rejection" };
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
             'pending:' || id,
             vod_id,
             NULL,
             NULL
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
    if (item.candidate_kind) {
      const equivalent = await this.findEquivalentSchedule(
        item,
        startTime,
        title,
      );
      if (equivalent) {
        return this.resolveObsolete(item, equivalent.id, actor);
      }
    }
    const minutes = timeToMinutes(startTime);
    const conflictWindow = item.candidate_kind
      ? AUTO_UPDATE_TIME_WINDOW_MINUTES
      : 30;
    const results = await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO schedules (member_uid, date, start_time, title, status)
           SELECT
             member_uid,
             date,
             ?,
             ?,
             CASE WHEN candidate_kind IS NOT NULL THEN '방송' ELSE status END
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
                   ) <= ?
               )
             )`,
        )
        .bind(
          startTime,
          title,
          item.id,
          minutes,
          minutes,
          conflictWindow,
        ),
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
             previous_status,
             vod_id,
             NULL,
             NULL
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
        const conflict = await this.findTimeConflict(
          item,
          minutes,
          conflictWindow,
        );
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
    const target = await this.db
      .prepare(
        `SELECT id, status, start_time, title
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

    const assignments: string[] = [];
    const bindings: unknown[] = [];
    const guards: string[] = [];
    if (item.candidate_kind) {
      if (!target.start_time?.trim()) {
        assignments.push(
          "start_time = CASE WHEN COALESCE(TRIM(start_time), '') = '' THEN ? ELSE start_time END",
        );
        bindings.push(values.startTime);
        guards.push("COALESCE(TRIM(start_time), '') = ''");
      }
      if (!target.title?.trim()) {
        assignments.push(
          "title = CASE WHEN COALESCE(TRIM(title), '') = '' THEN ? ELSE title END",
        );
        bindings.push(values.title);
        guards.push("COALESCE(TRIM(title), '') = ''");
      }
      if (assignments.length === 0) {
        return this.resolveObsolete(item, target.id, actor);
      }
    } else {
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
    }

    const results = await this.db.batch([
      this.db
        .prepare(
          `UPDATE schedules
           SET ${assignments.join(", ")}
           WHERE id = ?
             AND member_uid = ?
             AND date = ?
             ${
               guards.length > 0
                 ? `AND (${guards.join(" OR ")})`
                 : ""
             }
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
           ?,
           vod_id,
           NULL,
           NULL
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
    conflictWindow: number = 30,
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
           ) <= ?
         ORDER BY id
         LIMIT 1`,
      )
      .bind(item.member_uid, item.date, minutes, conflictWindow)
      .first<{ id: number; start_time: string }>();
  }

  private async findEquivalentSchedule(
    item: PendingScheduleRow,
    startTime: string | null,
    title: string | null,
  ): Promise<{ id: number } | null> {
    const result = await this.db
      .prepare(
        `SELECT id, start_time, title, status
         FROM schedules
         WHERE member_uid = ? AND date = ?
         ORDER BY id`,
      )
      .bind(item.member_uid, item.date)
      .all<{
        id: number;
        start_time: string | null;
        title: string | null;
        status: string;
      }>();
    const candidateMinutes = timeToMinutes(startTime);
    for (const schedule of result.results) {
      if (schedule.status === "휴방") return { id: schedule.id };
      const scheduleMinutes = timeToMinutes(schedule.start_time);
      if (
        candidateMinutes !== null &&
        scheduleMinutes !== null &&
        Math.abs(candidateMinutes - scheduleMinutes) <=
          AUTO_UPDATE_TIME_WINDOW_MINUTES
      ) {
        return { id: schedule.id };
      }
      if (getTitleSimilarity(title, schedule.title) >= 0.6) {
        return { id: schedule.id };
      }
    }
    if (
      result.results.length === 1 &&
      !result.results[0].start_time?.trim() &&
      !result.results[0].title?.trim()
    ) {
      return { id: result.results[0].id };
    }
    return null;
  }

  private async resolveObsolete(
    item: PendingScheduleRow,
    scheduleId: number | null,
    actor: ScheduleActor,
  ): Promise<PendingActionOutcome> {
    const results = await this.db.batch([
      this.db
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
             'candidate_obsolete',
             title,
             previous_status,
             vod_id,
             NULL,
             NULL
           FROM pending_schedules
           WHERE id = ?`,
        )
        .bind(
          scheduleId,
          ...actorBindings(actor),
          item.id,
        ),
      this.db
        .prepare(
          `DELETE FROM pending_schedules
           WHERE id = ? AND changes() = 1`,
        )
        .bind(item.id),
    ]);
    if (results[1].meta.changes !== 1) return staleOutcome();
    return {
      success: true,
      action: "candidate_obsolete",
      scheduleId,
    };
  }
}
