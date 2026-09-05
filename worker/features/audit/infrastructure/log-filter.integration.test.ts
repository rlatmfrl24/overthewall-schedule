import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../../platform/db";
import { readAdminAuditLogPage } from "./admin-audit-repository";
import { readUpdateLogs } from "../../schedules/infrastructure/update-log-repository";

const d1 = env.otw_db;
beforeEach(async () => {
  await d1.batch([
    d1.prepare("DROP TABLE IF EXISTS admin_audit_logs"),
    d1.prepare("DROP TABLE IF EXISTS update_logs"),
    d1.prepare(`CREATE TABLE admin_audit_logs (id INTEGER PRIMARY KEY, event_type TEXT, resource_type TEXT, resource_id TEXT, action TEXT, status TEXT, actor_id TEXT, actor_name TEXT, actor_ip TEXT, target_count INTEGER, success_count INTEGER, failure_count INTEGER, detail TEXT, error TEXT, created_at INTEGER)`),
    d1.prepare(`CREATE TABLE update_logs (id INTEGER PRIMARY KEY, schedule_id INTEGER, member_uid INTEGER, member_name TEXT, actor_id TEXT, actor_name TEXT, actor_ip TEXT, schedule_date TEXT, action TEXT, title TEXT, previous_status TEXT, vod_id TEXT, reason_code TEXT, reason_note TEXT, created_at TEXT)`),
  ]);
  for (const [id, date, title] of [[1, "2026-09-01 00:00:00", "50%_수집"], [2, "2026-09-01 23:59:59", "50%_수집"], [3, "2026-09-02 00:00:00", "50%_수집"], [4, "2026-09-01 12:00:00", "50ABC수집"]] as const) {
    await d1.prepare("INSERT INTO update_logs (id, member_uid, member_name, schedule_date, action, title, created_at) VALUES (?, 7, '멤버', '2026-09-01', 'update', ?, ?)").bind(id, title, date).run();
    await d1.prepare("INSERT INTO admin_audit_logs (id, event_type, resource_type, action, status, detail, created_at) VALUES (?, 'settings.update', 'settings', 'update', 'success', ?, ?)").bind(id, title, Date.parse(date.replace(" ", "T") + "Z")).run();
  }
});

describe("filtered log pagination", () => {
  it("uses identical filters for schedule rows and total, including the entire UTC end day", async () => {
    const options = {limit: 50, page: 1, pageSize: 1, sort: "created_asc" as const, q: "50%_", target: "7", action: "update", from: "2026-09-01", until: "2026-09-01"};
    const first = await readUpdateLogs(getDb(env), options);
    const second = await readUpdateLogs(getDb(env), {...options, page: 2});
    expect(first).toMatchObject({total: 2, totalPages: 2, items: [{id: 1}]});
    expect(second).toMatchObject({total: 2, items: [{id: 2}]});
    expect(await d1.prepare("SELECT COUNT(*) AS count FROM update_logs").first("count")).toBe(4);
  });
  it("keeps audit totals and records aligned for status, target, action and literal search", async () => {
    const filters = {q: "50%_", target: "settings", action: "update", status: "success", from: "2026-09-01", until: "2026-09-01"};
    expect(await readAdminAuditLogPage(getDb(env), 1, 1, filters)).toMatchObject({total: 2, totalPages: 2, items: [{id: 2}]});
    expect(await readAdminAuditLogPage(getDb(env), 2, 1, filters)).toMatchObject({total: 2, items: [{id: 1}]});
    expect(await readAdminAuditLogPage(getDb(env), 1, 1, {...filters, status: "failed"})).toMatchObject({total: 0, items: []});
    expect(await d1.prepare("SELECT COUNT(*) AS count FROM admin_audit_logs").first("count")).toBe(4);
  });
});
