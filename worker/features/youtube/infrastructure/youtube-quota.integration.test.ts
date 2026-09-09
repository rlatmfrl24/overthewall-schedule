import type { D1Migration } from "cloudflare:test";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeOtwPlayMetadataReader } from "../../otw-play";
import {
  readYouTubeDailyQuota,
  reserveYouTubeQuota,
  YouTubeQuotaAdmissionError,
  YouTubeQuotaConfigurationError,
} from "./youtube-quota";

type TestEnv = Env & {
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
  YOUTUBE_QUOTA_MIGRATIONS: D1Migration[];
};

const testEnv = env as TestEnv;
const db = testEnv.otw_db;

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
       key TEXT PRIMARY KEY NOT NULL,
       value TEXT NOT NULL,
       updated_at TEXT NOT NULL
     )`,
  ).run();
  await db.batch([
    db.prepare("DELETE FROM scheduled_usage_daily"),
    db.prepare("DELETE FROM settings WHERE key = 'youtube_api_daily_quota_units'"),
    db.prepare("DELETE FROM settings WHERE key = 'youtube_warmup_daily_quota_units'"),
    db.prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ('youtube_api_daily_quota_units', '1000', '0')`,
    ),
  ]);
});

describe("YouTube shared quota admission", () => {
  it("low 70%, core 85%, critical 100% 우선순위 경계를 한 원장에 적용한다", async () => {
    await reserveYouTubeQuota(db, "low", 700);
    await expect(reserveYouTubeQuota(db, "low", 1)).rejects.toBeInstanceOf(
      YouTubeQuotaAdmissionError,
    );

    await reserveYouTubeQuota(db, "core", 150);
    await expect(reserveYouTubeQuota(db, "core", 1)).rejects.toBeInstanceOf(
      YouTubeQuotaAdmissionError,
    );

    await reserveYouTubeQuota(db, "critical", 150);
    await expect(
      reserveYouTubeQuota(db, "critical", 1),
    ).rejects.toBeInstanceOf(YouTubeQuotaAdmissionError);

    const row = await db.prepare(
      `SELECT used, limit_value AS limitValue
       FROM scheduled_usage_daily
       WHERE lane = 'youtube-all' AND resource = 'youtube_quota_units'`,
    ).first<{ used: number; limitValue: number }>();
    expect(row).toEqual({ used: 1_000, limitValue: 1_000 });
  });

  it("canonical quota 설정만 사용한다", async () => {
    await db.prepare(
      `INSERT OR REPLACE INTO settings (key, value, updated_at)
       VALUES ('youtube_api_daily_quota_units', '100', '0')`,
    ).run();

    await reserveYouTubeQuota(db, "core", 85);
    await expect(reserveYouTubeQuota(db, "core", 1)).rejects.toBeInstanceOf(
      YouTubeQuotaAdmissionError,
    );

    const row = await db.prepare(
      `SELECT used, limit_value AS limitValue
       FROM scheduled_usage_daily
       WHERE lane = 'youtube-all' AND resource = 'youtube_quota_units'`,
    ).first<{ used: number; limitValue: number }>();
    expect(row).toEqual({ used: 85, limitValue: 100 });
  });

  it("첫 예약부터 우선순위 한도를 지킨다", async () => {
    await expect(reserveYouTubeQuota(db, "low", 701)).rejects.toBeInstanceOf(YouTubeQuotaAdmissionError);
    const result = await db.prepare("SELECT COUNT(*) AS count FROM scheduled_usage_daily").first<{ count: number }>();
    expect(result?.count).toBe(0);
  });

  it("동시 최초 예약도 같은 원장에서 한도를 초과하지 않는다", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveYouTubeQuota(db, "low", 100)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(7);
    expect((await db.prepare("SELECT used FROM scheduled_usage_daily").first<{ used: number }>())?.used).toBe(700);
  });

  it.each([null, "", "bad", "0", "10001", "12x", "-1"])("잘못된 canonical %s에서 fallback·요청·예약을 하지 않는다", async (value) => {
    await db.prepare("DELETE FROM settings WHERE key = 'youtube_api_daily_quota_units'").run();
    await db.prepare("INSERT INTO settings VALUES ('youtube_warmup_daily_quota_units', '1000', '0')").run();
    if (value !== null) await db.prepare("INSERT INTO settings VALUES ('youtube_api_daily_quota_units', ?, '0')").bind(value).run();
    await expect(reserveYouTubeQuota(db, "core")).rejects.toBeInstanceOf(YouTubeQuotaConfigurationError);
    await expect(readYouTubeDailyQuota(db)).rejects.toBeInstanceOf(YouTubeQuotaConfigurationError);
    const fetcher = vi.fn<typeof fetch>();
    const reader = new YouTubeOtwPlayMetadataReader("key", fetcher, { db });
    await expect(reader.readVideos(["abcdefghijk"])).rejects.toMatchObject({ code: "configuration" });
    expect(fetcher).not.toHaveBeenCalled();
    expect((await db.prepare("SELECT COUNT(*) AS count FROM scheduled_usage_daily").first<{ count: number }>())?.count).toBe(0);
    expect((await db.prepare("SELECT value FROM settings WHERE key = 'youtube_api_daily_quota_units'").first<{ value: string }>())?.value ?? null).toBe(value);
  });
});

describe("canonical quota data migration", () => {
  const migrate = () => db.batch(testEnv.YOUTUBE_QUOTA_MIGRATIONS.flatMap(migration => migration.queries.map(sql => db.prepare(sql))));
  it.each([
    ["500", "700", "500"],
    ["500", "bad", "500"],
    [null, "700", "700"],
    [null, null, "1000"],
  ])("canonical=%s / legacy=%s를 %s로 이관한다", async (canonical, legacy, expected) => {
    await db.prepare("DELETE FROM settings").run();
    if (canonical !== null) await db.prepare("INSERT INTO settings VALUES ('youtube_api_daily_quota_units', ?, 'unchanged')").bind(canonical).run();
    if (legacy !== null) await db.prepare("INSERT INTO settings VALUES ('youtube_warmup_daily_quota_units', ?, 'history')").bind(legacy).run();
    await migrate();
    await migrate();
    const row = await db.prepare("SELECT value, updated_at FROM settings WHERE key = 'youtube_api_daily_quota_units'").first<{ value: string; updated_at: string }>();
    expect(row?.value).toBe(expected);
    if (canonical !== null) expect(row?.updated_at).toBe("unchanged");
    if (legacy !== null) expect(await db.prepare("SELECT value FROM settings WHERE key = 'youtube_warmup_daily_quota_units'").first()).toEqual({ value: legacy });
  });

  it.each(["bad", "0", "10001", "1.5", "", "-1"])("이관 대상 %s를 변경하지 않고 차단한다", async (invalid) => {
    for (const key of ["youtube_api_daily_quota_units", "youtube_warmup_daily_quota_units"]) {
      await db.prepare("DELETE FROM settings").run();
      await db.prepare("INSERT INTO settings VALUES (?, ?, 'unchanged')").bind(key, invalid).run();
      await expect(migrate()).rejects.toThrow();
      expect((await db.prepare("SELECT key, value, updated_at FROM settings").all()).results).toEqual([{ key, value: invalid, updated_at: "unchanged" }]);
    }
  });
});
