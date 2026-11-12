import type { ApplyScheduleImageGroup } from "../../../../contracts/schedule-image-import";
import { imageContext, imageResult, applyImageGroup } from "./d1-schedule-image-apply";
import type { SaveScheduleResult } from "../../../../contracts/schedules";
import { NON_BROADCAST_SCHEDULE_STATUSES } from "../../../../contracts/schedules";
import type {
  ScheduleActor,
  ScheduleWriteInput,
} from "../domain/schedule";
import type { ScheduleWriteRepository } from "../application/ports/schedule-write-repository";
import type { SiteId } from "@contracts/site-definition";
import { scheduleWriteRestriction } from "./public-schedule-write-policy";

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

const conflictPredicate = (input: ScheduleWriteInput, retainedIds: number[] = []) => {
  const common = `member_uid = ? AND date = ?${retainedIds.length ? " AND id NOT IN (SELECT value FROM json_each(?))" : ""}`;
  const commonBindings: unknown[] = [input.memberUid, input.date, ...(retainedIds.length ? [JSON.stringify(retainedIds)] : [])];

  if (input.status === "미정") {
    return { sql: common, bindings: commonBindings };
  }

  const withoutCurrent = `${common} AND id <> ?`;
  const bindings = [...commonBindings, input.id ?? -1];

  if (input.status === "방송") {
    return {
      sql: `${withoutCurrent} AND status IN (${NON_BROADCAST_SCHEDULE_STATUSES.map(status => `'${status}'`).join(", ")})`,
      bindings,
    };
  }

  return { sql: withoutCurrent, bindings };
};

export class D1ScheduleWriteRepository implements ScheduleWriteRepository {
  private readonly db: D1Database;
  private readonly siteId: SiteId;

  constructor(db: D1Database, siteId: SiteId = "otw") {
    this.db = db;
    this.siteId = siteId;
  }

  private async batch(statements: D1PreparedStatement[], input: ScheduleWriteInput | { id: number }, actor: ScheduleActor) {
    const guards = this.siteId === "luvdia" && !actor.isAdmin ? [scheduleWriteRestriction(this.db, input, true)] : [];
    return (await this.db.batch([...guards, ...statements, ...guards])).slice(guards.length, guards.length + statements.length);
  }

  private prepareSave(input: ScheduleWriteInput, actor: ScheduleActor, retainedIds: number[] = []): D1PreparedStatement[] {
    const predicate = conflictPredicate(input, retainedIds);
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
      return statements;
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

      return statements;
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

    return statements;
  }

  async saveWithConflictResolution(input: ScheduleWriteInput, actor: ScheduleActor): Promise<SaveScheduleResult> {
    const results = await this.batch(this.prepareSave(input, actor), input, actor);
    const scheduleId = input.status === "미정" ? null : input.id ?? Number(results[3].meta.last_row_id);
    return { success:true, action: input.status === "미정" ? "delete_conflicts" : input.id !== null ? "update" : "create",
      scheduleId: scheduleId !== null && Number.isSafeInteger(scheduleId) ? scheduleId : null,
      deletedIds: results[0].results.map(row => (row as ScheduleIdRow).id) };
  }

  imageContext(memberUid: number, date: string, actor: ScheduleActor) {
    return imageContext(this.db, this.siteId, memberUid, date, actor);
  }
  imageResult(operationId: string, actor: ScheduleActor) {
    return imageResult(this.db, this.siteId, operationId, actor);
  }
  applyImageGroup(group: ApplyScheduleImageGroup, actor: ScheduleActor) {
    return applyImageGroup(this.db, this.siteId, group, actor,
      (input, retainedIds) => this.prepareSave(input, actor, retainedIds), conflictPredicate,
      (statements, input) => this.batch(statements, input, actor));
  }

  async create(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void> {
    await this.batch([
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
    ], input, actor);
  }

  async update(input: ScheduleWriteInput, actor: ScheduleActor): Promise<void> {
    if (input.id === null) {
      throw new Error("Schedule ID is required for update");
    }

    await this.batch([
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
    ], input, actor);
  }

  async delete(id: number, actor: ScheduleActor): Promise<void> {
    await this.batch([
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
    ], { id }, actor);
  }
}
