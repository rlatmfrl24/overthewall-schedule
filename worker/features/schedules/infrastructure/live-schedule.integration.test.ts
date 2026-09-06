import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../platform/db";
import { autoFillUndecidedLiveSchedules, type LiveStatusItem } from "./live-schedule";
import { createLiveScheduleAutoFillService } from "./live-schedule-auto-fill-service";
const d1 = env.otw_db;
const channelId = "a".repeat(32);
const items: LiveStatusItem[] = [{channelId, content: {status: "OPEN", liveTitle: "실제 라이브 제목", openDate: "2026-09-07T13:10:00+09:00", concurrentUserCount: 1, liveImageUrl: "", defaultThumbnailImageUrl: "", channelId, channelName: "테스트", channelImageUrl: ""}}];
beforeEach(async () => {
  await d1.batch([
    ...["update_logs", "schedules", "members", "settings"].map((name) => d1.prepare(`DROP TABLE IF EXISTS ${name}`)),
    d1.prepare("CREATE TABLE members (uid INTEGER PRIMARY KEY, name TEXT, url_chzzk TEXT, is_deprecated INTEGER)"),
    d1.prepare("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)"),
    d1.prepare("CREATE TABLE schedules (id INTEGER PRIMARY KEY AUTOINCREMENT, member_uid INTEGER NOT NULL, date TEXT NOT NULL, start_time TEXT, title TEXT, status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("CREATE TABLE update_logs (id INTEGER PRIMARY KEY, schedule_id INTEGER, member_uid INTEGER, member_name TEXT, actor_id TEXT, actor_name TEXT, actor_ip TEXT, schedule_date TEXT, action TEXT, title TEXT, previous_status TEXT, vod_id TEXT, reason_code TEXT, reason_note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    d1.prepare("INSERT INTO members (uid,name,url_chzzk) VALUES (1,'테스트',?)").bind(`https://chzzk.naver.com/${channelId}`),
  ]);
});
describe("live fill D1 persistence", () => {
  it("concurrent empty-day collection creates only one schedule and links its log", async () => {
    const results = await Promise.all(Array.from({length: 4}, () => autoFillUndecidedLiveSchedules(getDb(env), items)));
    expect(results.reduce((sum, result) => sum + result.updated, 0)).toBe(1);
    const rows = await d1.prepare("SELECT * FROM schedules").all();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0]).toMatchObject({start_time: "13:00", title: "실제 라이브 제목", status: "방송"});
    expect(await d1.prepare("SELECT schedule_id FROM update_logs").first("schedule_id")).toBe(rows.results[0].id);
  });
  it("fills an empty title, preserving time under concurrent requests", async () => {
    await d1.prepare("INSERT INTO schedules (member_uid,date,start_time,title,status) VALUES (1,'2026-09-07','12:00','  ','방송')").run();
    const results = await Promise.all([autoFillUndecidedLiveSchedules(getDb(env), items), autoFillUndecidedLiveSchedules(getDb(env), items)]);
    expect(results.reduce((sum, result) => sum + result.updated, 0)).toBe(1);
    expect(await d1.prepare("SELECT title,start_time FROM schedules").first()).toEqual({title: "실제 라이브 제목", start_time: "12:00"});
    expect((await autoFillUndecidedLiveSchedules(getDb(env), items)).updated).toBe(0);
  });
  it("preserves a title when filling time and honors the disabled setting", async () => {
    await d1.prepare("INSERT INTO schedules (member_uid,date,start_time,title,status) VALUES (1,'2026-09-07',NULL,'예정 콘텐츠','방송')").run();
    await d1.prepare("INSERT INTO settings VALUES ('live_schedule_auto_fill_enabled','false')").run();
    expect((await createLiveScheduleAutoFillService(getDb(env)).run(items)).updated).toBe(0);
    await d1.prepare("UPDATE settings SET value='true'").run();
    expect((await createLiveScheduleAutoFillService(getDb(env)).run(items)).updated).toBe(1);
    expect(await d1.prepare("SELECT title,start_time FROM schedules").first()).toEqual({title: "예정 콘텐츠", start_time: "13:00"});
  });
});
