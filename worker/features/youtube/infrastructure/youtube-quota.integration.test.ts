import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import {
  reserveYouTubeQuota,
  YouTubeQuotaAdmissionError,
} from "./youtube-quota";

type TestEnv = Env & {
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
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
       VALUES ('youtube_warmup_daily_quota_units', '1000', '0')`,
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

  it("canonical quota 설정이 legacy fallback보다 우선한다", async () => {
    await db.prepare(
      `INSERT INTO settings (key, value, updated_at)
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
});
