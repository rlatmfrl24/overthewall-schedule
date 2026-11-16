import type { ApplyScheduleImageGroup, ScheduleImageContext, ScheduleImageReceipt } from "../../../../contracts/schedule-image-import";
import { SCHEDULE_IMAGE_LIMITS } from "../../../../contracts/schedule-image-import";
import type { ScheduleDto } from "../../../../contracts/schedules";
import type { ScheduleActor, ScheduleWriteInput } from "../domain/schedule";
import { parseScheduleImageGroup } from "../domain/schedule-image-command";
import { ScheduleImageError } from "../application/read-schedule-image";
import { scheduleWriteRestriction } from "./public-schedule-write-policy";
import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";

export const IMAGE_SNAPSHOT_SQL = `SELECT json_group_array(json_array(id,status,start_time,title,content_access)) FROM
  (SELECT id,status,start_time,title,content_access FROM schedules WHERE member_uid=? AND date=? ORDER BY id)`;
const scope = (actor: ScheduleActor) => {
  if (!actor.actorId) throw new ScheduleImageError("로그인이 필요합니다.", 401);
  return actor.actorId;
};
const issuedAt = (id: string) => {
  if (!/^\d{13}_[0-9a-f-]{36}$/.test(id)) throw new ScheduleImageError("잘못된 적용 요청입니다.");
  const issued = Number(id.split("_")[0]);
  if (issued > Date.now() + 120_000) throw new ScheduleImageError("기기의 시간을 확인해주세요.");
  return issued;
};
export async function imageResult(db: D1Database, site: string, id: string, actor: ScheduleActor): Promise<ScheduleImageReceipt | null> {
  const issued = issuedAt(id);
  const result = await db.prepare("SELECT result_json,expires_at FROM schedule_image_results WHERE site_id=? AND actor_id=? AND operation_id=?").bind(site, scope(actor), id).first<{ result_json: string; expires_at: number }>();
  if (result && result.expires_at >= Date.now()) return JSON.parse(result.result_json) as ScheduleImageReceipt;
  if (result || issued + SCHEDULE_IMAGE_LIMITS.receiptMs < Date.now()) throw new ScheduleImageError("적용 결과 확인 기간이 지났습니다. 기존 일정을 다시 비교해주세요.", 410);
  return null;
}
export async function imageContext(db: D1Database, site: SiteId, memberUid: number, date: string, actor: ScheduleActor): Promise<ScheduleImageContext> {
  scope(actor);
  const member = await db.prepare(`SELECT uid FROM members WHERE uid=? AND content_access='normal' AND NOT (${publicationHiddenSql("members","members",site)})`).bind(memberUid).first();
  if (!member) throw new ScheduleImageError("이 멤버의 일정에 접근할 수 없습니다.", 403);
  if (site === "luvdia" && !actor.isAdmin && await scheduleWriteRestriction(db, { memberUid, date, id: null, status: "방송", startTime: null, title: null }).first<number>("restricted")) throw new ScheduleImageError("이 멤버·날짜의 일정은 관리자만 수정할 수 있습니다.", 403);
  const schedules = (await db.prepare("SELECT * FROM schedules WHERE member_uid=? AND date=? ORDER BY id").bind(memberUid, date).all<ScheduleDto>()).results;
  if (schedules.some(s => s.content_access !== "normal")) throw new ScheduleImageError("보관된 일정이 있어 이 화면에서 적용할 수 없습니다.", 403);
  const expected = JSON.stringify(schedules.map(s => [s.id, s.status, s.start_time, s.title, s.content_access]));
  return { schedules, expected };
}
export async function applyImageGroup(db: D1Database, site: SiteId, value: ApplyScheduleImageGroup, actor: ScheduleActor,
  prepare: (input: ScheduleWriteInput, retainedIds: number[]) => D1PreparedStatement[],
  conflicts: (input: ScheduleWriteInput, retainedIds: number[]) => { sql: string; bindings: unknown[] },
  batch: (statements: D1PreparedStatement[], input: ScheduleWriteInput) => Promise<unknown>,
): Promise<ScheduleImageReceipt> {
  const group = parseScheduleImageGroup(value);
  if (!group) throw new ScheduleImageError("일정의 값이나 묶음 안의 충돌을 확인해주세요.");
  const actorId = scope(actor), issued = issuedAt(group.operationId), now = Date.now();
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(group)));
  const hash = [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2,"0")).join("");
  const replay = async () => {
    const found = await imageResult(db, site, group.operationId, actor);
    if (found) {
      const storedHash = await db.prepare("SELECT request_hash FROM schedule_image_results WHERE site_id=? AND actor_id=? AND operation_id=?").bind(site, actorId, group.operationId).first<string>("request_hash");
      if (storedHash !== hash) throw new ScheduleImageError("이미 사용한 적용 요청의 내용을 바꿀 수 없습니다.", 409);
    }
    return found;
  };
  const previous = await replay(); if (previous) return previous;
  const inputs = group.changes.map(c => ({ id: c.id, memberUid: group.memberUid, date: group.date, startTime: c.startTime, title: c.title, status: c.status }));
  const retainedIds = inputs.flatMap(input => input.id === null ? [] : [input.id]);
  const expiresAt = Math.max(now, issued) + SCHEDULE_IMAGE_LIMITS.receiptMs;
  const access = () => db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM members WHERE uid=? AND content_access='normal' AND NOT (${publicationHiddenSql("members","members",site)})) AND NOT EXISTS(SELECT 1 FROM schedules WHERE member_uid=? AND date=? AND content_access<>'normal') THEN 1 ELSE json_extract('[]','schedule_image_access') END`).bind(group.memberUid, group.memberUid, group.date);
  try {
    const context = await imageContext(db, site, group.memberUid, group.date, actor);
    if (context.expected !== group.expected) throw new ScheduleImageError("기존 일정이 변경되었습니다. 다시 비교해주세요.", 409);
    for (const input of inputs) {
      if (input.id !== null && !context.schedules.some(s => s.id === input.id)) throw new ScheduleImageError("수정할 기존 일정을 다시 선택해주세요.", 409);
      if (input.id === null && context.schedules.some(s => !retainedIds.includes(s.id) && s.status === input.status && s.start_time === input.startTime && (s.title ?? "") === (input.title ?? ""))) throw new ScheduleImageError("이미 같은 일정이 있습니다. 중복 항목을 제외해주세요.", 409);
    }
    // Multi-row groups are all broadcasts; their protected conflict set is identical.
    const p = conflicts(inputs[0], retainedIds);
    const deleted = (await db.prepare(`SELECT id FROM schedules WHERE ${p.sql} ORDER BY id`).bind(...p.bindings).all<{id:number}>()).results.map(row => row.id);
    if (JSON.stringify(deleted) !== JSON.stringify(group.confirmedDeletedIds)) throw new ScheduleImageError("삭제될 기존 일정 전체를 확인해주세요.", 409);
    await batch([
      db.prepare(`SELECT CASE WHEN (${IMAGE_SNAPSHOT_SQL})=? THEN 1 ELSE json_extract('[]','schedule_image_conflict') END`).bind(group.memberUid, group.date, group.expected),
      access(), ...inputs.flatMap(input => prepare(input, retainedIds)),
      ...inputs.map(input => db.prepare(`SELECT CASE WHEN EXISTS(SELECT 1 FROM schedules
        WHERE member_uid=? AND date=? AND status=? AND start_time IS ? AND title IS ? AND (? IS NULL OR id=?))
        THEN 1 ELSE json_extract('[]','schedule_image_incomplete') END`)
        .bind(input.memberUid, input.date, input.status, input.startTime, input.title, input.id, input.id)),
      access(),
      db.prepare(`INSERT INTO schedule_image_results(site_id,actor_id,operation_id,request_hash,result_json,expires_at)
        VALUES(?,?,?,?,json_object('operationId',?,'state','applied','scheduleIds',(SELECT json_group_array(id) FROM schedules WHERE member_uid=? AND date=?),'expiresAt',?),?)`)
        .bind(site, actorId, group.operationId, hash, group.operationId, group.memberUid, group.date, expiresAt, expiresAt),
    ], inputs[0]);
  } catch (error) {
    const committed = await replay(); if (committed) return committed;
    if (error instanceof ScheduleImageError) throw error;
    if (!(error instanceof Error) || !/SQLITE_|JSON path|schedule_member_policy/.test(error.message)) throw new ScheduleImageError("저장 결과를 확인 중입니다. 같은 요청의 결과를 다시 조회해주세요.", 502);
    throw new ScheduleImageError("이 묶음은 반영되지 않았습니다. 권한과 최신 일정을 다시 확인해주세요.", 409);
  }
  // Prune only after the atomic receipt exists; cost/audit records have independent retention.
  await db.prepare("DELETE FROM schedule_image_results WHERE expires_at<?").bind(now).run();
  return (await imageResult(db, site, group.operationId, actor))!;
}
