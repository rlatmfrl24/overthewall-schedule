export type BooleanSettingValue = "true" | "false";

export const SETTINGS_VISIBILITY_VALUES = [
  "public",
  "members",
  "private",
] as const;
export type SettingsVisibility = (typeof SETTINGS_VISIBILITY_VALUES)[number];

export const AUTO_UPDATE_INTERVAL_HOURS = ["1", "6", "12", "24"] as const;
export type AutoUpdateIntervalHours =
  (typeof AUTO_UPDATE_INTERVAL_HOURS)[number];
export const DEFAULT_AUTO_UPDATE_INTERVAL_HOURS: AutoUpdateIntervalHours = "6";

export const AUTO_UPDATE_RANGE_DAYS = ["1", "2", "3", "5", "7"] as const;
export type AutoUpdateRangeDays = (typeof AUTO_UPDATE_RANGE_DAYS)[number];
export const DEFAULT_AUTO_UPDATE_RANGE_DAYS: AutoUpdateRangeDays = "3";

export const X_COLLECTION_INTERVAL_HOURS = ["2", "6", "12", "24"] as const;
export type XCollectionIntervalHours =
  (typeof X_COLLECTION_INTERVAL_HOURS)[number];
export const DEFAULT_X_COLLECTION_INTERVAL_HOURS: XCollectionIntervalHours =
  "2";

export const YOUTUBE_WARMUP_INTERVAL_HOURS = [
  "1",
  "2",
  "6",
  "12",
  "24",
] as const;
export type YouTubeWarmupIntervalHours =
  (typeof YOUTUBE_WARMUP_INTERVAL_HOURS)[number];
export const DEFAULT_YOUTUBE_WARMUP_INTERVAL_HOURS: YouTubeWarmupIntervalHours =
  "1";

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
export const YOUTUBE_API_DAILY_QUOTA_SETTING_KEY =
  "youtube_api_daily_quota_units" as const;
export const LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY =
  "live_schedule_auto_fill_enabled";
export const OTW_PLAY_SUBMISSION_DAILY_LIMIT_SETTING_KEY =
  "otw_play_submission_daily_limit";
export const DEFAULT_OTW_PLAY_SUBMISSION_DAILY_LIMIT = 5;
export const MIN_OTW_PLAY_SUBMISSION_DAILY_LIMIT = 1;
export const MAX_OTW_PLAY_SUBMISSION_DAILY_LIMIT = 100;

export interface AdminSettingsDto {
  auto_update_enabled: BooleanSettingValue | null;
  auto_update_interval_hours: AutoUpdateIntervalHours;
  auto_update_last_run: string | null;
  auto_update_range_days: string | null;
  live_schedule_auto_fill_enabled: BooleanSettingValue;
  x_rich_link_preview_enabled: BooleanSettingValue;
  x_posts_visibility: SettingsVisibility;
  naver_cafe_posts_enabled: BooleanSettingValue;
  naver_cafe_collection_enabled: BooleanSettingValue;
  naver_cafe_posts_visibility: SettingsVisibility;
  x_collection_enabled: BooleanSettingValue;
  x_history_analytics_enabled: BooleanSettingValue;
  x_metrics_snapshot_enabled: BooleanSettingValue;
  x_compliance_enabled: BooleanSettingValue;
  x_collection_daily_budget_cents: string;
  x_collection_interval_hours: XCollectionIntervalHours;
  x_collection_last_run: string | null;
  youtube_warmup_enabled: BooleanSettingValue;
  youtube_warmup_interval_hours: YouTubeWarmupIntervalHours;
  youtube_warmup_daily_quota_units: string;
  youtube_warmup_official_enabled: BooleanSettingValue;
  youtube_warmup_kirinuki_enabled: BooleanSettingValue;
  youtube_warmup_last_run: string | null;
  youtube_api_daily_quota_units: string;
  youtube_feed_enabled: BooleanSettingValue;
  otw_play_submission_daily_limit: string;
}

export const SETTINGS_KEYS = [
  "auto_update_enabled",
  "auto_update_interval_hours",
  "auto_update_last_run",
  "auto_update_range_days",
  "x_rich_link_preview_enabled",
  "x_posts_visibility",
  "naver_cafe_posts_enabled",
  "naver_cafe_collection_enabled",
  "naver_cafe_posts_visibility",
  "x_collection_enabled",
  "x_history_analytics_enabled",
  "x_metrics_snapshot_enabled",
  "x_compliance_enabled",
  "x_collection_daily_budget_cents",
  "x_collection_interval_hours",
  "x_collection_last_run",
  "youtube_warmup_enabled",
  "youtube_warmup_interval_hours",
  "youtube_warmup_daily_quota_units",
  "youtube_warmup_official_enabled",
  "youtube_warmup_kirinuki_enabled",
  "youtube_warmup_last_run",
  YOUTUBE_API_DAILY_QUOTA_SETTING_KEY,
  "youtube_feed_enabled",
  OTW_PLAY_SUBMISSION_DAILY_LIMIT_SETTING_KEY,
  LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY,
] as const satisfies readonly (keyof AdminSettingsDto)[];

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const READONLY_SETTINGS_KEYS = [
  "auto_update_last_run",
  "x_collection_last_run",
  "youtube_warmup_last_run",
] as const satisfies readonly SettingsKey[];

export type ReadonlySettingsKey = (typeof READONLY_SETTINGS_KEYS)[number];
export type WritableSettingsKey = Exclude<SettingsKey, ReadonlySettingsKey>;
export type SettingsUpdatePayload = Partial<{
  [Key in WritableSettingsKey]: Extract<AdminSettingsDto[Key], string>;
}>;

type StoredSettingsRecord = Partial<
  Record<SettingsKey, string | null | undefined>
>;

type SettingConfig = {
  key: SettingsKey;
  writable: boolean;
  normalize: (value: string | null | undefined) => string | null;
  validate?: (value: string) => boolean;
  persistOnRead?: boolean;
};

export type SettingWrite = {
  key: WritableSettingsKey;
  value: string;
};

export type SettingsUpdateParseResult =
  | { ok: true; updates: SettingWrite[] }
  | { ok: false; error: string };

export const isAutoUpdateIntervalHours = (
  value: unknown,
): value is AutoUpdateIntervalHours =>
  typeof value === "string" &&
  (AUTO_UPDATE_INTERVAL_HOURS as readonly string[]).includes(value);

export const normalizeAutoUpdateIntervalHours = (
  value: string | null | undefined,
): AutoUpdateIntervalHours =>
  isAutoUpdateIntervalHours(value)
    ? value
    : DEFAULT_AUTO_UPDATE_INTERVAL_HOURS;

export const parseAutoUpdateIntervalHours = (
  value: string | null | undefined,
) => Number(normalizeAutoUpdateIntervalHours(value));

export const isAutoUpdateRangeDays = (
  value: unknown,
): value is AutoUpdateRangeDays =>
  typeof value === "string" &&
  (AUTO_UPDATE_RANGE_DAYS as readonly string[]).includes(value);

export const normalizeAutoUpdateRangeDays = (
  value: string | null | undefined,
): AutoUpdateRangeDays =>
  isAutoUpdateRangeDays(value) ? value : DEFAULT_AUTO_UPDATE_RANGE_DAYS;

export const parseAutoUpdateRangeDays = (
  value: string | null | undefined,
) => Number(normalizeAutoUpdateRangeDays(value));

export const isXCollectionIntervalHours = (
  value: unknown,
): value is XCollectionIntervalHours =>
  typeof value === "string" &&
  (X_COLLECTION_INTERVAL_HOURS as readonly string[]).includes(value);

export const normalizeXCollectionIntervalHours = (
  value: string | null | undefined,
): XCollectionIntervalHours =>
  isXCollectionIntervalHours(value)
    ? value
    : DEFAULT_X_COLLECTION_INTERVAL_HOURS;

export const parseXCollectionIntervalHours = (
  value: string | null | undefined,
) => Number(normalizeXCollectionIntervalHours(value));

export const isYouTubeWarmupIntervalHours = (
  value: unknown,
): value is YouTubeWarmupIntervalHours =>
  typeof value === "string" &&
  (YOUTUBE_WARMUP_INTERVAL_HOURS as readonly string[]).includes(value);

export const normalizeYouTubeWarmupIntervalHours = (
  value: string | null | undefined,
): YouTubeWarmupIntervalHours =>
  isYouTubeWarmupIntervalHours(value)
    ? value
    : DEFAULT_YOUTUBE_WARMUP_INTERVAL_HOURS;

export const parseYouTubeWarmupIntervalHours = (
  value: string | null | undefined,
) => Number(normalizeYouTubeWarmupIntervalHours(value));

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

export const isOtwPlaySubmissionDailyLimitValue = (value: unknown) => {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return false;
  const parsed = Number.parseInt(value, 10);
  return (
    Number.isSafeInteger(parsed) &&
    parsed >= MIN_OTW_PLAY_SUBMISSION_DAILY_LIMIT &&
    parsed <= MAX_OTW_PLAY_SUBMISSION_DAILY_LIMIT
  );
};

export const normalizeOtwPlaySubmissionDailyLimit = (
  value: string | number | null | undefined,
) => {
  const candidate = String(value ?? "");
  return isOtwPlaySubmissionDailyLimitValue(candidate)
    ? candidate
    : String(DEFAULT_OTW_PLAY_SUBMISSION_DAILY_LIMIT);
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

const settingsKeySet = new Set<string>(SETTINGS_KEYS);
const readonlySettingsKeySet = new Set<string>(READONLY_SETTINGS_KEYS);

const isBooleanValue = (value: unknown): value is BooleanSettingValue =>
  isBooleanSettingValue(value);

const normalizeNullableBoolean = (
  value: string | null | undefined,
): BooleanSettingValue | null => (isBooleanValue(value) ? value : null);

const normalizeBoolean = (
  value: string | null | undefined,
  defaultValue: BooleanSettingValue,
): BooleanSettingValue => (isBooleanValue(value) ? value : defaultValue);

const normalizeWarmupBoolean = (
  value: string | null | undefined,
): BooleanSettingValue =>
  normalizeYouTubeWarmupBoolean(value) as BooleanSettingValue;

const isSettingsVisibility = (value: unknown): value is SettingsVisibility =>
  typeof value === "string" &&
  (SETTINGS_VISIBILITY_VALUES as readonly string[]).includes(value);

const normalizeVisibility = (
  value: string | null | undefined,
  defaultValue: SettingsVisibility,
): SettingsVisibility => (isSettingsVisibility(value) ? value : defaultValue);

const isXCollectionDailyBudgetCents = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100_000;
};

const normalizeXCollectionDailyBudgetCents = (
  value: string | null | undefined,
) => (isXCollectionDailyBudgetCents(value) ? value : "100");

const passthroughNullable = (value: string | null | undefined) => value ?? null;

const SETTINGS_CONFIGS: readonly SettingConfig[] = [
  {
    key: "auto_update_enabled",
    writable: true,
    normalize: normalizeNullableBoolean,
    validate: isBooleanValue,
  },
  {
    key: "auto_update_interval_hours",
    writable: true,
    normalize: normalizeAutoUpdateIntervalHours,
    validate: isAutoUpdateIntervalHours,
    persistOnRead: true,
  },
  {
    key: "auto_update_last_run",
    writable: false,
    normalize: passthroughNullable,
  },
  {
    key: "auto_update_range_days",
    writable: true,
    normalize: normalizeAutoUpdateRangeDays,
    validate: isAutoUpdateRangeDays,
  },
  {
    key: "x_rich_link_preview_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "false"),
    validate: isBooleanValue,
  },
  {
    key: "x_posts_visibility",
    writable: true,
    normalize: (value) => normalizeVisibility(value, "members"),
    validate: isSettingsVisibility,
  },
  {
    key: "naver_cafe_posts_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "true"),
    validate: isBooleanValue,
  },
  {
    key: "naver_cafe_collection_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "true"),
    validate: isBooleanValue,
  },
  {
    key: "youtube_feed_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "false"),
    validate: isBooleanValue,
  },
  {
    key: "naver_cafe_posts_visibility",
    writable: true,
    normalize: (value) => normalizeVisibility(value, "members"),
    validate: isSettingsVisibility,
  },
  {
    key: "x_collection_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "true"),
    validate: isBooleanValue,
  },
  {
    key: "x_history_analytics_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "false"),
    validate: isBooleanValue,
  },
  {
    key: "x_metrics_snapshot_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "false"),
    validate: isBooleanValue,
  },
  {
    key: "x_compliance_enabled",
    writable: true,
    normalize: (value) => normalizeBoolean(value, "false"),
    validate: isBooleanValue,
  },
  {
    key: "x_collection_daily_budget_cents",
    writable: true,
    normalize: normalizeXCollectionDailyBudgetCents,
    validate: isXCollectionDailyBudgetCents,
  },
  {
    key: "x_collection_interval_hours",
    writable: true,
    normalize: normalizeXCollectionIntervalHours,
    validate: isXCollectionIntervalHours,
    persistOnRead: true,
  },
  {
    key: "x_collection_last_run",
    writable: false,
    normalize: passthroughNullable,
  },
  {
    key: "youtube_warmup_enabled",
    writable: true,
    normalize: normalizeWarmupBoolean,
    validate: isBooleanValue,
    persistOnRead: true,
  },
  {
    key: "youtube_warmup_interval_hours",
    writable: true,
    normalize: normalizeYouTubeWarmupIntervalHours,
    validate: isYouTubeWarmupIntervalHours,
    persistOnRead: true,
  },
  {
    key: "youtube_warmup_daily_quota_units",
    writable: true,
    normalize: normalizeYouTubeWarmupDailyQuotaUnits,
    validate: isYouTubeWarmupDailyQuotaUnitsValue,
    persistOnRead: true,
  },
  {
    key: "youtube_warmup_official_enabled",
    writable: true,
    normalize: normalizeWarmupBoolean,
    validate: isBooleanValue,
    persistOnRead: true,
  },
  {
    key: "youtube_warmup_kirinuki_enabled",
    writable: true,
    normalize: normalizeWarmupBoolean,
    validate: isBooleanValue,
    persistOnRead: true,
  },
  {
    key: "youtube_warmup_last_run",
    writable: false,
    normalize: passthroughNullable,
  },
  {
    key: YOUTUBE_API_DAILY_QUOTA_SETTING_KEY,
    writable: true,
    normalize: normalizeYouTubeWarmupDailyQuotaUnits,
    validate: isYouTubeWarmupDailyQuotaUnitsValue,
  },
  {
    key: OTW_PLAY_SUBMISSION_DAILY_LIMIT_SETTING_KEY,
    writable: true,
    normalize: normalizeOtwPlaySubmissionDailyLimit,
    validate: isOtwPlaySubmissionDailyLimitValue,
  },
  {
    key: LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY,
    writable: true,
    normalize: (value) => normalizeBoolean(value, "true"),
    validate: isBooleanValue,
  },
] as const satisfies readonly SettingConfig[];

const settingsConfigByKey = new Map<SettingsKey, SettingConfig>(
  SETTINGS_CONFIGS.map((config) => [config.key, config]),
);

export const isSettingsKey = (value: string): value is SettingsKey =>
  settingsKeySet.has(value);

export const isWritableSettingsKey = (
  value: SettingsKey,
): value is WritableSettingsKey => !readonlySettingsKeySet.has(value);

export const normalizeAdminSettings = (
  storedSettings: StoredSettingsRecord,
): { settings: AdminSettingsDto; writes: SettingWrite[] } => {
  const normalized = {} as Record<SettingsKey, string | null>;
  const writes: SettingWrite[] = [];

  for (const config of SETTINGS_CONFIGS) {
    const storedValue = storedSettings[config.key];
    const normalizedValue = config.normalize(storedValue);
    normalized[config.key] = normalizedValue;

    if (
      config.persistOnRead &&
      isWritableSettingsKey(config.key) &&
      normalizedValue !== null &&
      storedValue !== normalizedValue
    ) {
      writes.push({ key: config.key, value: normalizedValue });
    }
  }

  return { settings: normalized as unknown as AdminSettingsDto, writes };
};

export const parseSettingsUpdatePayload = (
  body: Record<string, unknown>,
): SettingsUpdateParseResult => {
  const updates: SettingWrite[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (!isSettingsKey(key) || !isWritableSettingsKey(key)) continue;
    const config = settingsConfigByKey.get(key);
    if (!config?.writable) continue;

    if (
      typeof value !== "string" ||
      (config.validate !== undefined && !config.validate(value))
    ) {
      return { ok: false, error: `Invalid ${key}` };
    }

    updates.push({ key, value });
  }

  if (updates.length === 0) {
    return { ok: false, error: "No valid settings to update" };
  }

  return { ok: true, updates };
};
