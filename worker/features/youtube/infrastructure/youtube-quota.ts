import { isYouTubeApiDailyQuotaUnitsValue } from "@contracts/configuration";

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

export class YouTubeQuotaConfigurationError extends Error {
  constructor() {
    super("youtube_quota_configuration_invalid");
    this.name = "YouTubeQuotaConfigurationError";
  }
}

export const readYouTubeDailyQuota = async (db: YouTubeQuotaDb): Promise<number> => {
  const row = await db.prepare(
    "SELECT value FROM settings WHERE key = ?",
  ).bind("youtube_api_daily_quota_units").first<{ value: string | null }>();
  if (!isYouTubeApiDailyQuotaUnitsValue(row?.value)) {
    throw new YouTubeQuotaConfigurationError();
  }
  return Number(row!.value);
};

export const reserveYouTubeQuota = async (
  db: YouTubeQuotaDb | undefined,
  priority: YouTubeQuotaPriority,
  units = 1,
) => {
  if (!db) return;
  if (!Number.isSafeInteger(units) || units <= 0) {
    throw new RangeError("YouTube quota units must be a positive safe integer");
  }
  const now = Date.now();
  const { day } = getYouTubeQuotaWindow(now);
  const ratio = getPriorityLimitRatio(priority);
  const result = await db.prepare(
    `INSERT INTO scheduled_usage_daily (
       day, lane, resource, reserved, used, limit_value, updated_at
     ) SELECT ?, 'youtube-all', 'youtube_quota_units', 0, ?,
              CAST(value AS INTEGER), ?
       FROM settings
       WHERE key = 'youtube_api_daily_quota_units'
         AND TRIM(value) <> '' AND TRIM(value) NOT GLOB '*[^0-9]*'
         AND CAST(value AS INTEGER) BETWEEN 1 AND 10000
         AND ? <= CAST(CAST(value AS INTEGER) * ? AS INTEGER)
     ON CONFLICT(day, lane, resource) DO UPDATE SET
       used = scheduled_usage_daily.used + excluded.used,
       limit_value = excluded.limit_value,
       updated_at = excluded.updated_at
     WHERE scheduled_usage_daily.used + scheduled_usage_daily.reserved + excluded.used
       <= CAST(excluded.limit_value * ? AS INTEGER)
     RETURNING used`,
  ).bind(day, units, now, units, ratio, ratio).first<{ used: number }>();
  if (!result) {
    // Failure-only diagnostic: distinguish invalid configuration from a full
    // budget without another query on the successful reservation path.
    await readYouTubeDailyQuota(db);
    throw new YouTubeQuotaAdmissionError(priority);
  }
};
