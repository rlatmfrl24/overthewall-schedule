import type { SaveScheduleResult } from "../../../../contracts/schedules";
import type {
  ScheduleActor,
  ScheduleWriteInput,
} from "../domain/schedule";
import type { ScheduleWriteRepository } from "../application/ports/schedule-write-repository";

type ScheduleIdRow = { id: number };

const UPDATE_LOG_COLUMNS = `
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

const createLogStatement = (
  db: D1Database,
  input: ScheduleWriteInput,
  actor: ScheduleActor,
) =>
  db
    .prepare(
      `INSERT INTO update_logs (${UPDATE_LOG_COLUMNS})
       VALUES (
         last_insert_rowid(),
         ?,
         (SELECT name FROM members WHERE uid = ? LIMIT 1),
         ?, ?, ?, ?, 'create', ?, NULL
       )`,
    )
    .bind(
      input.memberUid,
      input.memberUid,
      ...actorBindings(actor),
      input.date,
      input.title,
    );

const conflictPredicate = (input: ScheduleWriteInput) => {
  const common = "member_uid = ? AND date = ?";
  const commonBindings: unknown[] = [input.memberUid, input.date];

  if (input.status === "미정") {
    return { sql: common, bindings: commonBindings };
  }

  const withoutCurrent = `${common} AND id <> ?`;
  const bindings = [...commonBindings, input.id ?? -1];

  if (input.status === "방송") {
    return {
      sql: `${withoutCurrent} AND status IN ('휴방', '게릴라', '미정')`,
      bindings,
    };
  }

  return { sql: withoutCurrent, bindings };
};

export class D1ScheduleWriteRepository implements ScheduleWriteRepository {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async saveWithConflictResolution(
    input: ScheduleWriteInput,
    actor: ScheduleActor,
  ): Promise<SaveScheduleResult> {
    const predicate = conflictPredicate(input);
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(`SELECT id FROM schedules WHERE ${predicate.sql} ORDER BY id`)
        .bind(...predicate.bindings),
      this.db
        .prepare(
          `INSERT INTO update_logs (${UPDATE_LOG_COLUMNS})
           SELECT
             id,
             member_uid,
             (
               SELECT name
               FROM members
               WHERE members.uid = schedules.member_uid
               LIMIT 1
             ),
             ?, ?, ?, date, 'delete', title, status
           FROM schedules
           WHERE ${predicate.sql}`,
        )
        .bind(...actorBindings(actor), ...predicate.bindings),
      this.db
        .prepare(`DELETE FROM schedules WHERE ${predicate.sql}`)
        .bind(...predicate.bindings),
    ];

    if (input.status === "미정") {
      const results = await this.db.batch<ScheduleIdRow>(statements);
      return {
        success: true,
        action: "delete_conflicts",
        scheduleId: null,
        deletedIds: results[0].results.map((row) => row.id),
      };
    }

    if (input.id !== null) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO update_logs (${UPDATE_LOG_COLUMNS})
             SELECT
               id,
               ?,
               (SELECT name FROM members WHERE uid = ? LIMIT 1),
               ?, ?, ?, ?, 'update', ?, status
             FROM schedules
             WHERE id = ?`,
          )
          .bind(
            input.memberUid,
            input.memberUid,
            ...actorBindings(actor),
            input.date,
            input.title,
            input.id,
          ),
        this.db
          .prepare(
            `UPDATE schedules
             SET member_uid = ?, date = ?, start_time = ?, title = ?, status = ?
             WHERE id = ?`,
          )
          .bind(
            input.memberUid,
            input.date,
            input.startTime,
            input.title,
            input.status,
            input.id,
          ),
      );

      const results = await this.db.batch<ScheduleIdRow>(statements);
      return {
        success: true,
        action: "update",
        scheduleId: input.id,
        deletedIds: results[0].results.map((row) => row.id),
      };
    }

    statements.push(
      this.db
        .prepare(
          `INSERT INTO schedules (member_uid, date, start_time, title, status)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          input.memberUid,
          input.date,
          input.startTime,
          input.title,
          input.status,
        ),
      createLogStatement(this.db, input, actor),
    );

    const results = await this.db.batch<ScheduleIdRow>(statements);
    const insertResult = results[3];
    const scheduleId = Number(insertResult.meta.last_row_id);

    return {
      success: true,
      action: "create",
      scheduleId: Number.isSafeInteger(scheduleId) ? scheduleId : null,
      deletedIds: results[0].results.map((row) => row.id),
    };
  }

  async create(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO schedules (member_uid, date, start_time, title, status)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          input.memberUid,
          input.date,
          input.startTime,
          input.title,
          input.status,
        ),
      createLogStatement(this.db, input, actor),
    ]);
  }

  async update(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void> {
    if (input.id === null) {
      throw new Error("Schedule ID is required for update");
    }

    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO update_logs (${UPDATE_LOG_COLUMNS})
           SELECT
             id,
             ?,
             (SELECT name FROM members WHERE uid = ? LIMIT 1),
             ?, ?, ?, ?, 'update', ?, status
           FROM schedules
           WHERE id = ?`,
        )
        .bind(
          input.memberUid,
          input.memberUid,
          ...actorBindings(actor),
          input.date,
          input.title,
          input.id,
        ),
      this.db
        .prepare(
          `UPDATE schedules
           SET member_uid = ?, date = ?, start_time = ?, title = ?, status = ?
           WHERE id = ?`,
        )
        .bind(
          input.memberUid,
          input.date,
          input.startTime,
          input.title,
          input.status,
          input.id,
        ),
    ]);
  }

  async delete(id: number, actor: ScheduleActor): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO update_logs (${UPDATE_LOG_COLUMNS})
           SELECT
             id,
             member_uid,
             (
               SELECT name
               FROM members
               WHERE members.uid = schedules.member_uid
               LIMIT 1
             ),
             ?, ?, ?, date, 'delete', title, status
           FROM schedules
           WHERE id = ?`,
        )
        .bind(...actorBindings(actor), id),
      this.db.prepare("DELETE FROM schedules WHERE id = ?").bind(id),
    ]);
  }
}
