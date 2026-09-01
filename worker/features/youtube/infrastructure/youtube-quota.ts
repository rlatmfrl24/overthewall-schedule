export type YouTubeQuotaPriority = "critical" | "core" | "low";

type YouTubeQuotaDb = Pick<D1Database, "prepare">;

const YOUTUBE_QUOTA_TIME_ZONE = "America/Los_Angeles";
const quotaDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: YOUTUBE_QUOTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const getQuotaDateTimeParts = (timestamp: number) => {
  const parts = new Map(
    quotaDateTimeFormatter
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.get("year")),
    month: Number(parts.get("month")),
    day: Number(parts.get("day")),
    hour: Number(parts.get("hour")),
    minute: Number(parts.get("minute")),
    second: Number(parts.get("second")),
  };
};

const getQuotaTimeZoneOffsetMs = (timestamp: number) => {
  const parts = getQuotaDateTimeParts(timestamp);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(timestamp / 1000) * 1000;
};

export const getYouTubeQuotaWindow = (timestamp = Date.now()) => {
  const parts = getQuotaDateTimeParts(timestamp);
  const day = [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
  const wallMidnightUtc = Date.UTC(parts.year, parts.month - 1, parts.day);
  let since = wallMidnightUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    since = wallMidnightUtc - getQuotaTimeZoneOffsetMs(since);
  }
  return { day, since };
};

export const readYouTubeQuotaLedgerUsage = async (
  db: YouTubeQuotaDb,
  timestamp = Date.now(),
) => {
  const window = getYouTubeQuotaWindow(timestamp);
  const row = await db.prepare(
    `SELECT used, limit_value AS limitValue
     FROM scheduled_usage_daily
     WHERE day = ? AND lane = 'youtube-all'
       AND resource = 'youtube_quota_units'`,
  ).bind(window.day).first<{ used: number | string; limitValue: number | string }>();
  return {
    ...window,
    used: Number(row?.used ?? 0),
    limit: row ? Number(row.limitValue) : null,
  };
};

const getPriorityLimitRatio = (priority: YouTubeQuotaPriority) => {
  if (priority === "critical") return 1;
  if (priority === "core") return 0.85;
  return 0.7;
};

export class YouTubeQuotaAdmissionError extends Error {
  constructor(priority: YouTubeQuotaPriority) {
    super(`youtube_quota_admission_denied:${priority}`);
    this.name = "YouTubeQuotaAdmissionError";
  }
}

export const reserveYouTubeQuota = async (
  db: YouTubeQuotaDb | undefined,
  priority: YouTubeQuotaPriority,
  units = 1,
) => {
  if (!db) return;
  const now = Date.now();
  await db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     SELECT 'youtube_api_daily_quota_units',
       COALESCE((SELECT value FROM settings
                 WHERE key = 'youtube_warmup_daily_quota_units'), '1000'), ?
     WHERE NOT EXISTS (
       SELECT 1 FROM settings WHERE key = 'youtube_api_daily_quota_units'
     )`,
  ).bind(String(now)).run();
  const { day } = getYouTubeQuotaWindow(now);
  const ratio = getPriorityLimitRatio(priority);
  const result = await db.prepare(
    `INSERT INTO scheduled_usage_daily (
       day, lane, resource, reserved, used, limit_value, updated_at
     ) VALUES (
       ?, 'youtube-all', 'youtube_quota_units', 0, ?,
       MAX(1, COALESCE((
         SELECT CAST(value AS INTEGER) FROM settings
         WHERE key = 'youtube_api_daily_quota_units'
       ), (
         SELECT CAST(value AS INTEGER) FROM settings
         WHERE key = 'youtube_warmup_daily_quota_units'
       ), 1000)), ?
     )
     ON CONFLICT(day, lane, resource) DO UPDATE SET
       used = scheduled_usage_daily.used + excluded.used,
       limit_value = excluded.limit_value,
       updated_at = excluded.updated_at
     WHERE scheduled_usage_daily.used + scheduled_usage_daily.reserved + excluded.used
       <= CAST(excluded.limit_value * ? AS INTEGER)
     RETURNING used`,
  ).bind(day, units, now, ratio).first<{ used: number }>();
  if (!result) throw new YouTubeQuotaAdmissionError(priority);
};
