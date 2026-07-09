import { normalizeYouTubeWarmupIntervalHours } from "./auto-update-interval";

export const YOUTUBE_WARMUP_SETTINGS_KEYS = [
  "youtube_warmup_enabled",
  "youtube_warmup_interval_hours",
  "youtube_warmup_daily_quota_units",
  "youtube_warmup_official_enabled",
  "youtube_warmup_kirinuki_enabled",
  "youtube_warmup_last_run",
] as const;

export type YouTubeWarmupSettingKey =
  (typeof YOUTUBE_WARMUP_SETTINGS_KEYS)[number];

export const DEFAULT_YOUTUBE_WARMUP_ENABLED = "true";
export const DEFAULT_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS = 1000;
export const MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS = 1;
export const MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS = 10_000;

export const isBooleanSettingValue = (value: unknown) =>
  value === "true" || value === "false";

export const normalizeYouTubeWarmupBoolean = (
  value: string | null | undefined,
) => (value === "false" ? "false" : "true");

export const normalizeYouTubeWarmupDailyQuotaUnits = (
  value: string | number | null | undefined,
) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) {
    return String(DEFAULT_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS);
  }
  return String(
    Math.min(
      Math.max(parsed, MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS),
      MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS,
    ),
  );
};

export const isYouTubeWarmupDailyQuotaUnitsValue = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return false;
  const parsed = Number.parseInt(value, 10);
  return (
    Number.isFinite(parsed) &&
    parsed >= MIN_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS &&
    parsed <= MAX_YOUTUBE_WARMUP_DAILY_QUOTA_UNITS
  );
};

export const normalizeYouTubeWarmupSettings = (
  values: Partial<Record<YouTubeWarmupSettingKey, string | null | undefined>>,
) => ({
  youtube_warmup_enabled: normalizeYouTubeWarmupBoolean(
    values.youtube_warmup_enabled ?? DEFAULT_YOUTUBE_WARMUP_ENABLED,
  ),
  youtube_warmup_interval_hours: normalizeYouTubeWarmupIntervalHours(
    values.youtube_warmup_interval_hours,
  ),
  youtube_warmup_daily_quota_units: normalizeYouTubeWarmupDailyQuotaUnits(
    values.youtube_warmup_daily_quota_units,
  ),
  youtube_warmup_official_enabled: normalizeYouTubeWarmupBoolean(
    values.youtube_warmup_official_enabled ?? "true",
  ),
  youtube_warmup_kirinuki_enabled: normalizeYouTubeWarmupBoolean(
    values.youtube_warmup_kirinuki_enabled ?? "true",
  ),
  youtube_warmup_last_run: values.youtube_warmup_last_run ?? null,
});
