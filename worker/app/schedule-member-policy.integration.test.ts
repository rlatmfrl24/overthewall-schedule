import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { readSiteSchemaMigrations } from "../test-support/site-schema";
import { siteEnv } from "../test-support/site-env";
import { handleWorkerFetch } from "./fetch";
import { clearAuthCachesForTests } from "../platform/auth";
import type { Env } from "../platform/types";
import { getDb } from "../platform/db";
import { D1ScheduleWriteRepository } from "../features/schedules/infrastructure/d1-schedule-write-repository";
import { D1CollectorWriter, D1LiveScheduleWriter } from "../features/schedules/infrastructure/publication-writers";
import { applyLiveScheduleFillPlan, autoFillUndecidedLiveSchedules, type LiveStatusItem } from "../features/schedules/infrastructure/live-schedule";
import { executeHolidayCollectorCommand } from "../features/schedules/infrastructure/holiday-suggestions";
import { autoUpdateSchedules, executeChzzkObservationScan, readAutoUpdateMatchTargets } from "../features/schedules/infrastructure/auto-update";
import { allowsAutomaticSchedule } from "../features/schedules/infrastructure/automatic-schedule-policy";

const d1 = env.otw_db;
const origin = "http://localhost:5174";
const issuer = "https://schedule-policy.clerk.invalid";
const runtime = { ...env, ...siteEnv("luvdia"), CLERK_ISSUER: issuer,
  CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`, CLERK_AUTHORIZED_PARTIES: origin,
  CLERK_ADMIN_IDS: "policy-admin" } as unknown as Env;
const channelId = "a".repeat(32);
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const encode = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
async function request(path: string, user?: string, body?: unknown, method = body ? "POST" : "GET") {
  const headers = new Headers({ "Origin": origin });
  if (user) {
    const input = `${part({ alg: "RS256", kid: "policy-key" })}.${part({ iss: issuer, azp: origin, sub: user, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input));
    headers.set("Authorization", `Bearer ${input}.${encode(new Uint8Array(signature))}`);
  }
  if (body) headers.set("Content-Type", "application/json");
  return handleWorkerFetch(new Request(origin + path, { method, headers, body: body ? JSON.stringify(body) : undefined }), runtime);
}
const input = { member_uid: 1, date: "2026-11-16", title: "관리자 예외 방송", status: "방송", start_time: "20:00" };
beforeAll(async () => {
  for (const migration of await readSiteSchemaMigrations()) {
    if (migration.name.startsWith("0030_")) await d1.batch(["kurenai_natsuki", "terri_nunna", "bing_hayu", "yang_mei", "u_lili", "on_haru", "hane", "kim_ate"].map((code, index) =>
      d1.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(?,?,?,1)").bind(-10000-index, code, "migration bootstrap")));
    await applyD1Migrations(d1, [migration]);
  }
  await d1.batch([d1.prepare("DELETE FROM member_links"), d1.prepare("DELETE FROM music_entities"), d1.prepare("DELETE FROM members")]);
  keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
}, 120000);
beforeEach(async () => {
  clearAuthCachesForTests();
  vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL) => {
    if (String(url) === runtime.CLERK_JWKS_URL) return Response.json({ keys: [{ ...jwk, kid: "policy-key", alg: "RS256", use: "sig" }] });
    throw new Error("Unexpected provider request: " + String(url));
  }));
  await d1.batch([
    ...["pending_schedules", "schedule_day_assessments", "schedule_broadcast_observations", "update_logs", "schedules", "members"].map(table => d1.prepare(`DELETE FROM ${table}`)),
    d1.prepare("INSERT INTO members(uid,code,name,url_chzzk) VALUES(1,'bing_hayu','빙하유',?),(2,'yang_mei','양메이',NULL)").bind("https://chzzk.naver.com/" + channelId),
  ]);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("정상 날짜, 빈 종료 날짜, 관리자 저장과 공개 동일 ID 조회를 지원한다", async () => {
  const board = async (date: string) => (await request("/api/schedule-board?startDate=" + date + "&endDate=" + date)).json<{ members: { code: string }[]; schedules: { id: number }[] }>();
  expect((await board("2026-11-15")).members.some(m => m.code === "bing_hayu")).toBe(true);
  expect((await board("2026-11-16")).members.some(m => m.code === "bing_hayu")).toBe(false);
  expect((await request("/api/members")).status).toBe(200);
  const saved = await request("/api/schedules/save", "policy-admin", input);
  expect(saved.status, await saved.clone().text()).toBe(200);
  const result = await saved.json<{ scheduleId: number }>();
  const visible = await board("2026-11-16");
  expect(visible.members.some(m => m.code === "bing_hayu")).toBe(true);
  expect(visible.schedules.map(s => s.id)).toContain(result.scheduleId);
  expect(await d1.prepare("SELECT title FROM schedules WHERE id=?").bind(result.scheduleId).first("title")).toBe(input.title);
});
it("비로그인 유리리 일정의 생성·시간 수정·삭제와 익명 변경 기록을 지원한다", async () => {
  await d1.prepare("INSERT INTO members(uid,code,name) VALUES(3,'u_lili','유리리')").run();
  const draft = { member_uid: 3, date: "2026-10-22", start_time: "11:00", title: "치레동 랠리 연습", status: "방송" };
  expect((await request("/api/schedules", undefined, draft)).status).toBe(201);
  const [created] = await (await request("/api/schedules?date=" + draft.date)).json<{ id: number }[]>();
  const saved = await request("/api/schedules/save", undefined, { ...draft, id: created.id, start_time: "18:00" });
  expect(saved.status).toBe(200);
  expect(await saved.json()).toMatchObject({ success: true, action: "update", scheduleId: created.id });
  const board = await (await request(`/api/schedule-board?startDate=${draft.date}&endDate=${draft.date}`))
    .json<{ schedules: { id: number; start_time: string }[] }>();
  expect(board.schedules).toContainEqual(expect.objectContaining({ id: created.id, start_time: "18:00" }));
  expect(await d1.prepare("SELECT start_time FROM schedules WHERE id=?").bind(created.id).first("start_time")).toBe("18:00");
  expect((await request("/api/schedules", undefined, { ...draft, id: created.id, start_time: "19:00" }, "PUT")).status).toBe(200);
  expect((await request(`/api/schedules?id=${created.id}`, undefined, undefined, "DELETE")).status).toBe(200);
  expect(await d1.prepare("SELECT id FROM schedules WHERE id=?").bind(created.id).first()).toBeNull();
  expect((await d1.prepare("SELECT action,actor_id,actor_name FROM update_logs WHERE schedule_id=? ORDER BY id").bind(created.id)
    .all()).results).toEqual(["create", "update", "update", "delete"].map(action => ({ action, actor_id: null, actor_name: null })));
});
it.each([undefined, "policy-member"])("익명·일반 회원의 종료 후 일정 생성·수정·삭제·이동 우회를 차단한다 (%s)", async user => {
  for (const path of ["/api/schedules/save", "/api/schedules"]) expect((await request(path, user, input)).status).toBe(403);
  await d1.prepare("INSERT INTO schedules(id,member_uid,date,status,title) VALUES(7,1,'2026-11-16','방송','기존 미래 일정')").run();
  expect((await request("/api/schedules?id=7", user, undefined, "DELETE")).status).toBe(403);
  for (const path of ["/api/schedules/save", "/api/schedules"]) expect((await request(path, user,
    { ...input, id: 7, member_uid: 2, date: "2026-11-15" }, path.endsWith("save") ? "POST" : "PUT")).status).toBe(403);
  expect(await d1.prepare("SELECT title FROM schedules WHERE id=7").first("title")).toBe("기존 미래 일정");
  expect((await request("/api/schedules/save", user, { ...input, date: "2026-11-15" })).status).toBe(200);
  expect((await request("/api/schedules?id=7", "policy-admin", undefined, "DELETE")).status).toBe(200);
});
it("권한 확인 후 원본이 이동해도 쓰기 트랜잭션이 감사 로그까지 롤백한다", async () => {
  await d1.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(7,1,'2026-11-16','방송')").run();
  const repository = new D1ScheduleWriteRepository(d1, "luvdia");
  await expect(repository.update({ id: 7, memberUid: 2, date: "2026-11-15", startTime: null, title: "우회", status: "방송" },
    { actorId: "policy-member", actorName: null, actorIp: null })).rejects.toThrow("schedule_member_policy");
  expect(await d1.prepare("SELECT count(*) AS n FROM update_logs").first("n")).toBe(0);
});
it("자동 라이브 입력과 재시도는 미래 일정을 보존하고 마지막 날 방송은 유지한다", async () => {
  const writer = new D1LiveScheduleWriter(d1, "luvdia");
  const items: LiveStatusItem[] = [{ channelId, content: { status: "OPEN", openDate: "2026-11-16T12:00:00+09:00", liveTitle: "자동 입력",
    concurrentUserCount: 1, liveImageUrl: "", defaultThumbnailImageUrl: "", channelId, channelName: "빙하유", channelImageUrl: "" } }];
  expect((await autoFillUndecidedLiveSchedules(getDb(runtime), items, writer)).updated).toBe(0);
  await d1.prepare("INSERT INTO schedules(id,member_uid,date,status) VALUES(7,1,'2026-11-16','방송')").run();
  expect(await applyLiveScheduleFillPlan(getDb(runtime), { plan: { action: "update", scheduleId: 7, memberUid: 1,
    memberName: "빙하유", scheduleDate: "2026-11-16", startTime: "12:00", title: "재시도",
    previousStatus: "방송", previousStartTime: null, previousTitle: null }, expectedRows: [] }, writer)).toBe(false);
  const last = [{ channelId, content: { ...items[0].content!, openDate: "2026-11-15T23:50:00+09:00" } }];
  expect((await autoFillUndecidedLiveSchedules(getDb(runtime), last, writer)).updated).toBe(1);
  expect(await d1.prepare("SELECT date,start_time FROM schedules WHERE date='2026-11-15'").first()).toEqual({ date: "2026-11-15", start_time: "23:50" });
  await d1.prepare("UPDATE schedules SET title=NULL,start_time=NULL WHERE date='2026-11-15'").run();
  expect((await autoFillUndecidedLiveSchedules(getDb(runtime), last, writer)).updated).toBe(1);
});
it("종료 이후 휴방 제안과 오래된 매칭 입력을 적용하지 않는다", async () => {
  const writer = new D1CollectorWriter(d1, "luvdia");
  const now = Date.parse("2026-11-17T10:00:00+09:00");
  vi.spyOn(Date, "now").mockReturnValue(now);
  await d1.prepare("INSERT INTO schedule_day_assessments(member_uid,date,channel_id,checked_at,range_start,range_end,scan_status,broadcast_seen) VALUES(1,'2026-11-16',?,?,?,?,'complete',0)")
    .bind(channelId, now, now - 86400000, now).run();
  await executeHolidayCollectorCommand(d1, { action: "holiday_create", now, target: null }, writer);
  expect(await d1.prepare("SELECT count(*) AS n FROM pending_schedules").first("n")).toBe(0);
  const result = await autoUpdateSchedules(getDb(runtime), 3, { skipScan: true, collectorWriter: writer, matchTarget: { memberUid: 1, date: "2026-11-16" },
    originalInput: { startedAt: now, members: [{ uid: 1, name: "빙하유", url_chzzk: "https://chzzk.naver.com/" + channelId }],
      schedules: [], observations: [], rejections: [], pending: [] } });
  expect(result.updated).toBe(0);
  const fetchVideosBatch = vi.fn();
  expect((await executeChzzkObservationScan(getDb(runtime), { members: [{ uid: 1, code: "bing_hayu", name: "빙하유", channelId }],
    startedAt: now, rangeDays: 1, startDate: "2026-11-16", today: "2026-11-17" }, undefined, { fetchVideosBatch }, undefined, "luvdia")).channels).toBe(0);
  expect(fetchVideosBatch).not.toHaveBeenCalled();
});
it("동일 코드의 모든 UID에서 종료 후 자동 매칭과 라이브 재시도를 차단한다", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T10:00:00+09:00"));
  await d1.prepare("INSERT INTO members(uid,code,name,url_chzzk) VALUES(3,'bing_hayu','빙하유 중복',?)").bind("https://chzzk.naver.com/" + "b".repeat(32)).run();
  await d1.prepare("INSERT INTO schedules(id,member_uid,date,status,title) VALUES(7,3,'2026-11-16','미정','보존할 미래 일정')").run();
  const startedAt = Date.parse("2026-11-16T12:00:00+09:00");
  const observation = { member_uid: 3, vod_id: "duplicate-member-vod", title: "자동 매칭", started_at: startedAt,
    ended_at: startedAt + 3600000, duration_seconds: 3600, thumbnail_url: null };
  await d1.prepare("INSERT INTO schedule_broadcast_observations(vod_id,member_uid,channel_id,title,started_at,ended_at,duration_seconds,first_seen_at,last_seen_at) VALUES(?,3,?,?,?,?,?,?,?)")
    .bind(observation.vod_id, "b".repeat(32), observation.title, observation.started_at, observation.ended_at, observation.duration_seconds, Date.now(), Date.now()).run();
  const db = getDb(runtime);
  for (const uid of [1, 3]) expect.soft(await allowsAutomaticSchedule(d1, "luvdia", uid, "2026-11-16")).toBe(false);
  expect.soft(await readAutoUpdateMatchTargets(db, 3, undefined, "luvdia")).toEqual([]);
  const result = await autoUpdateSchedules(db, 3, { skipScan: true, collectorWriter: new D1CollectorWriter(d1, "luvdia"),
    matchTarget: { memberUid: 3, date: "2026-11-16" }, originalInput: { startedAt: Date.now(),
      members: [{ uid: 3, name: "빙하유 중복", url_chzzk: "https://chzzk.naver.com/" + "b".repeat(32) }],
      schedules: [], observations: [observation], rejections: [], pending: [] } });
  expect.soft(result.checked).toBe(0);
  expect.soft(await applyLiveScheduleFillPlan(db, { plan: { action: "update", scheduleId: 7, memberUid: 3,
    memberName: "빙하유 중복", scheduleDate: "2026-11-16", startTime: "12:00", title: "자동 재시도",
    previousStatus: "미정", previousStartTime: null, previousTitle: "보존할 미래 일정" }, expectedRows: [] }, new D1LiveScheduleWriter(d1, "luvdia"))).toBe(false);
  expect.soft(await d1.prepare("SELECT title FROM schedules WHERE id=7").first("title")).toBe("보존할 미래 일정");
  expect(await allowsAutomaticSchedule(d1, "luvdia", 3, "2026-11-15")).toBe(true);
  expect(await allowsAutomaticSchedule(d1, "luvdia", 2, "2026-11-16")).toBe(true);
  expect(await allowsAutomaticSchedule(d1, "otw", 3, "2026-11-16")).toBe(true);
});
