import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, expect, it } from "vitest";
import { D1ScheduleWriteRepository } from "./d1-schedule-write-repository";
import type { ApplyScheduleImageGroup, ScheduleImageChange } from "../../../../contracts/schedule-image-import";

const db = env.otw_db;
const actor = { actorId: "viewer", actorName: "사용자", actorIp: null, isAdmin: false };
const repository = new D1ScheduleWriteRepository(db, "otw");
const change = (title = "방송") => ({ clientId: title, id: null, title, status: "방송" as const, startTime: "21:00" });
async function group(date = "2026-11-12", changes: ScheduleImageChange[] = [change()]): Promise<ApplyScheduleImageGroup> {
  const context = await repository.imageContext(1, date, actor);
  return { operationId: `${Date.now()}_${crypto.randomUUID()}`, memberUid: 1, date, expected: context.expected, changes, confirmedDeletedIds: [] };
}
beforeAll(async () => {
  await applyD1Migrations(db, (env as unknown as { IMAGE_IMPORT_WRITE_MIGRATIONS: D1Migration[] }).IMAGE_IMPORT_WRITE_MIGRATIONS);
});
beforeEach(async () => {
  await db.batch(["schedule_image_results", "update_logs", "schedules", "members"].map(table => db.prepare(`DELETE FROM ${table}`)));
  await db.prepare("INSERT INTO members(uid,code,name) VALUES(1,'bing_hayu','빙하유')").run();
});
it("unknown_time_never_invokes_delete_conflicts and preserves_other_broadcasts_on_same_date", async () => {
  await repository.applyImageGroup(await group(), actor);
  const second = await group("2026-11-12", [{ ...change("시간 미정 방송"), startTime: null }]);
  await repository.applyImageGroup(second, actor);
  expect((await db.prepare("SELECT title,status,start_time FROM schedules ORDER BY id").all()).results).toEqual([
    { title: "방송", status: "방송", start_time: "21:00" }, { title: "시간 미정 방송", status: "방송", start_time: null },
  ]);
});
it("requires_confirmation_of_exclusive_status_deletions", async () => {
  await repository.applyImageGroup(await group(), actor);
  const input = await group("2026-11-12", [{ ...change("휴방"), status: "휴방", startTime: null }]);
  await expect(repository.applyImageGroup(input, actor)).rejects.toThrow();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(1);
  input.confirmedDeletedIds = (await repository.imageContext(1, input.date, actor)).schedules.map(row => row.id);
  await repository.applyImageGroup(input, actor);
  expect(await db.prepare("SELECT status FROM schedules").first("status")).toBe("휴방");
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs WHERE action='delete'").first("n")).toBe(1);
});
it("rejects_changed_target_without_silent_overwrite", async () => {
  const input = await group();
  await db.prepare("INSERT INTO schedules(member_uid,date,status,title) VALUES(1,'2026-11-12','방송','other')").run();
  await expect(repository.applyImageGroup(input, actor)).rejects.toThrow();
  expect(await db.prepare("SELECT title FROM schedules").first("title")).toBe("other");
});
it("replay_after_lost_response_does_not_duplicate_write", async () => {
  const input = await group();
  const [a, b] = await Promise.all([repository.applyImageGroup(input, actor), repository.applyImageGroup(input, actor)]);
  expect(a).toEqual(b);
  expect(await repository.imageResult(input.operationId, actor)).toEqual(a);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(1);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs").first("n")).toBe(1);
  await expect(repository.applyImageGroup({ ...input, changes: [change("변경한 본문")] }, actor)).rejects.toThrow();
});
it("rolls_back_entire_member_date_group_and_preserves_other_groups", async () => {
  await repository.applyImageGroup(await group("2026-11-13"), actor);
  const input = await group("2026-11-12", [change("first"), change("explode")]);
  await db.prepare("CREATE TRIGGER image_test_audit_failure BEFORE INSERT ON update_logs WHEN NEW.title='explode' BEGIN SELECT RAISE(ABORT,'audit failed'); END").run();
  try { await expect(repository.applyImageGroup(input, actor)).rejects.toThrow(); }
  finally { await db.prepare("DROP TRIGGER image_test_audit_failure").run(); }
  expect((await db.prepare("SELECT date FROM schedules").all()).results).toEqual([{ date: "2026-11-13" }]);
  expect(await repository.imageResult(input.operationId, actor)).toBeNull();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs").first("n")).toBe(1);
});
it("scopes_saved_results_to_actor_and_site_for_24_hours and rejects_expired_replay_instead_of_treating_it_as_new_write", async () => {
  const input = await group(); await repository.applyImageGroup(input, actor);
  expect(await repository.imageResult(input.operationId, { ...actor, actorId: "other" })).toBeNull();
  expect(await new D1ScheduleWriteRepository(db, "luvdia").imageResult(input.operationId, actor)).toBeNull();
  const expired = `${Date.now() - 86400001}_${crypto.randomUUID()}`;
  await expect(repository.applyImageGroup({ ...input, operationId: expired }, actor)).rejects.toThrow();
  await expect(repository.imageResult(expired, actor)).rejects.toThrow();
});
it("keeps original LuvDia stopped-member policy in the transaction", async () => {
  const input = await group("2026-11-16");
  const luvdia = new D1ScheduleWriteRepository(db, "luvdia");
  await expect(luvdia.applyImageGroup(input, actor)).rejects.toThrow();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(0);
  await luvdia.applyImageGroup(input, { ...actor, isAdmin: true });
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(1);
});
it.each([false,true])("preserves every selected update target regardless of add/edit order (reverse=%s)",async reverse=>{
  const inserted=await db.prepare("INSERT INTO schedules(member_uid,date,status,title) VALUES(1,'2026-11-12','휴방','기존 휴방') RETURNING id").first<{id:number}>();
  const changes:ScheduleImageChange[]=[change("추가 방송"),{...change("기존 일정 수정 방송"),id:inserted!.id,startTime:"22:00"}];
  const input=await group("2026-11-12",reverse?changes.reverse():changes);
  // The selected target is updated, not deleted as a side effect of another row.
  expect(input.confirmedDeletedIds).toEqual([]);
  const result=await repository.applyImageGroup(input,actor);
  expect(result.state).toBe("applied");
  expect((await db.prepare("SELECT id,title FROM schedules ORDER BY title").all()).results).toEqual([
    {id:inserted!.id,title:"기존 일정 수정 방송"},{id:result.scheduleIds.find(id=>id!==inserted!.id),title:"추가 방송"},
  ]);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs WHERE action='delete'").first("n")).toBe(0);
});
it("rolls back instead of issuing an applied receipt when a selected update silently affects zero rows",async()=>{
  await repository.applyImageGroup(await group(),actor);
  const original=(await repository.imageContext(1,"2026-11-12",actor)).schedules[0];
  const input=await group("2026-11-12",[{...change("고친 제목"),id:original.id}]);
  await db.prepare("CREATE TRIGGER image_test_ignore_update BEFORE UPDATE ON schedules BEGIN SELECT RAISE(IGNORE); END").run();
  try{await expect(repository.applyImageGroup(input,actor)).rejects.toThrow();}
  finally{await db.prepare("DROP TRIGGER image_test_ignore_update").run();}
  expect(await db.prepare("SELECT title FROM schedules WHERE id=?").bind(original.id).first("title")).toBe("방송");
  expect(await repository.imageResult(input.operationId,actor)).toBeNull();
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs WHERE action='update'").first("n")).toBe(0);
});
it("returns the real D1 receipt committed between the initial replay read and context validation",async()=>{
  const input=await group();let interleaved=false;
  const interleavedDb={prepare(sql:string){
    const statement=db.prepare(sql);
    if(!sql.startsWith("SELECT result_json"))return statement;
    return {bind(...values:unknown[]){const bound=statement.bind(...values);return {first:async()=>{
      const first=await bound.first();
      if(!interleaved){interleaved=true;await repository.applyImageGroup(input,actor);}
      return first;
    }};}};
  },batch:db.batch.bind(db)} as unknown as D1Database;
  const retried=await new D1ScheduleWriteRepository(interleavedDb,"otw").applyImageGroup(input,actor);
  expect(retried).toEqual(await repository.imageResult(input.operationId,actor));
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(1);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs").first("n")).toBe(1);
});
it("supports a new broadcast that replaces an explicitly edited target's old values",async()=>{
  await repository.applyImageGroup(await group(),actor);
  const existing=(await repository.imageContext(1,"2026-11-12",actor)).schedules[0];
  const input=await group("2026-11-12",[change(),{...change("다른 방송으로 수정"),id:existing.id,startTime:"22:00"}]);
  await repository.applyImageGroup(input,actor);
  expect((await db.prepare("SELECT title FROM schedules ORDER BY title").all()).results).toEqual([{title:"다른 방송으로 수정"},{title:"방송"}]);
});
