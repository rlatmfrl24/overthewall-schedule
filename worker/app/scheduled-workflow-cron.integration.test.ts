import { siteEnv } from "../test-support/site-env";
import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { CloudflareD1ReadBudget } from "../platform/cloudflare-d1-read-budget";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import { handleScheduledWorkflowCron, SCHEDULED_WORKFLOW_CRON } from "./scheduled-workflow-cron";

const testEnv = env as unknown as Env & { YOUTUBE_FEED_MIGRATIONS: D1Migration[]; X_REFERENCE_MIGRATIONS: D1Migration[] };
const database = testEnv.otw_db;
const scheduledTime = Date.parse("2026-09-08T02:23:00Z");
const event = { cron: SCHEDULED_WORKFLOW_CRON, scheduledTime } as ScheduledController;
const channelId = `UC${"A".repeat(22)}`;

afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(scheduledTime);
  vi.spyOn(CloudflareD1ReadBudget.prototype, "read").mockResolvedValue({ status: "available", rowsRead: 0, dailyTarget: 4_000_000, measuredAt: new Date(scheduledTime).toISOString(), resetAt: "2026-09-09T00:00:00Z", reason: null });
  await applyD1Migrations(database, testEnv.YOUTUBE_FEED_MIGRATIONS);
  await database.batch([
    database.prepare("DELETE FROM youtube_feed_videos"),
    database.prepare("DELETE FROM youtube_feed_sources"),
    database.prepare("DELETE FROM scheduled_job_runs"),
    database.prepare("DELETE FROM scheduled_usage_daily"),
    database.prepare("DELETE FROM kirinuki_channels"),
    database.prepare("DELETE FROM members"),
    database.prepare("DELETE FROM settings"),
    database.prepare(`INSERT INTO settings (key, value) VALUES
      ('youtube_feed_enabled', 'true'),
      ('youtube_shorts_legacy_import_completed_at', '1'),
      ('scheduled_v2_youtube_feed_collection_enabled', 'true')`),
    database.prepare("INSERT INTO members (uid, code, name, youtube_channel_id) VALUES (1, 'one', 'One', ?)").bind(channelId),
    database.prepare(`INSERT INTO youtube_feed_sources
      (id, source_kind, member_uid, youtube_channel_id, uploads_playlist_id,
       collection_started_at, next_check_at, created_at, updated_at)
      VALUES (1, 'official', 1, ?, 'uploads', ?, ?, ?, ?)`)
      .bind(channelId, scheduledTime, scheduledTime + 3_600_000, scheduledTime, scheduledTime),
  ]);
});

const observeAdmission = () => {
  const statements: string[] = [];
  const db = new Proxy(database, {
    get(target, property) {
      if (property === "prepare") return (sql: string) => {
        statements.push(sql);
        return target.prepare(sql);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const create = vi.fn();
  return {
    statements,
    create,
    env: { ...testEnv, ...siteEnv(), otw_db: db, YOUTUBE_API_KEY: "test",
      SCHEDULED_OPERATIONS_WORKFLOW: { create } } as unknown as Env,
  };
};

it.each([true, false])("checks the execution UTC day for delayed Cron, current day blocked: %s", async blocked => {
  await applyD1Migrations(database, testEnv.X_REFERENCE_MIGRATIONS);
  const delayedSlot = Date.parse("2026-09-08T23:23:00Z");
  vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-09T00:03:00Z"));
  await database.batch([
    database.prepare("UPDATE youtube_feed_sources SET next_check_at=0"),
    ...[["2026-09-08", blocked ? 0 : 40_000], ["2026-09-09", blocked ? 40_000 : 0]].map(([day, used]) =>
      database.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','d1_rows_written',?,0,40000,0)").bind(day, used)),
  ]);
  const before = (await database.prepare("SELECT * FROM scheduled_usage_daily ORDER BY day,lane,resource").all()).results;
  const { create, statements, env: runtime } = observeAdmission();
  await handleScheduledWorkflowCron({ cron: SCHEDULED_WORKFLOW_CRON, scheduledTime: delayedSlot } as ScheduledController, runtime);
  if (blocked) {
    expect(create).not.toHaveBeenCalled();
    expect(statements.filter(sql => /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql))).toEqual([]);
  } else {
    expect(create).toHaveBeenCalledWith({ params: { jobType: "youtube_feed_collection", scheduledFor: delayedSlot } });
  }
  expect((await database.prepare("SELECT * FROM scheduled_usage_daily ORDER BY day,lane,resource").all()).results).toEqual(before);
  expect(await database.prepare("SELECT count(*) n FROM scheduled_job_runs").first("n")).toBe(0);
});

describe("YouTube cron admission with real D1 retry and lease state", () => {
  it.each([
    ["backfill_lease_until", false],
    ["backfill_lease_until", true],
    ["backfill_retry_after", false],
    ["backfill_retry_after", true],
  ] as const)("defers initialization during %s (poll due: %s) without writes or Workflow creation", async (deadline, pollDue) => {
    await database.prepare(`UPDATE youtube_feed_sources SET ${deadline} = ?, next_check_at = ?`)
      .bind(scheduledTime + 3_600_000, pollDue ? 0 : scheduledTime + 3_600_000).run();
    const observed = observeAdmission();
    await handleScheduledWorkflowCron(event, observed.env);
    expect(observed.create).not.toHaveBeenCalled();
    expect(observed.statements.every((sql) => /^\s*SELECT\b/i.test(sql))).toBe(true);
    expect(await database.prepare("SELECT COUNT(*) AS total FROM scheduled_job_runs").first())
      .toEqual({ total: 0 });
    expect(await database.prepare(`SELECT ${deadline} AS deadline FROM youtube_feed_sources`).first())
      .toEqual({ deadline: scheduledTime + 3_600_000 });

    await database.prepare(`UPDATE youtube_feed_sources SET ${deadline} = ?`).bind(scheduledTime).run();
    await handleScheduledWorkflowCron(event, observed.env);
    expect(observed.create).toHaveBeenCalledExactlyOnceWith({
      params: { jobType: "youtube_feed_collection", scheduledFor: scheduledTime },
    });
  });

  it.each(["backfill_lease_until", "backfill_retry_after"] as const)("preserves due incremental collection while an existing backfill waits on %s", async (deadline) => {
    await database.prepare(`UPDATE youtube_feed_sources SET initialization_completed_at = ?,
      backfill_page_token = 'next', ${deadline} = ?`)
      .bind(scheduledTime - 1, scheduledTime + 3_600_000).run();
    const observed = observeAdmission();
    await handleScheduledWorkflowCron(event, observed.env);
    expect(observed.create).not.toHaveBeenCalled();
    await database.prepare("UPDATE youtube_feed_sources SET next_check_at = 0").run();
    await handleScheduledWorkflowCron(event, observed.env);
    expect(observed.create).toHaveBeenCalledExactlyOnceWith({
      params: { jobType: "youtube_feed_collection", scheduledFor: scheduledTime },
    });
  });
});
