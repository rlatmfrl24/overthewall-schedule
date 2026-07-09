import {
  type AutoUpdateIntervalHours,
  type XCollectionIntervalHours,
  type YouTubeWarmupIntervalHours,
  isAutoUpdateIntervalHours,
  isXCollectionIntervalHours,
  isYouTubeWarmupIntervalHours,
  normalizeAutoUpdateIntervalHours,
  normalizeXCollectionIntervalHours,
  normalizeYouTubeWarmupIntervalHours,
} from "./auto-update-interval";
import {
  isBooleanSettingValue,
  isYouTubeWarmupDailyQuotaUnitsValue,
  normalizeYouTubeWarmupBoolean,
  normalizeYouTubeWarmupDailyQuotaUnits,
  YOUTUBE_WARMUP_SETTINGS_KEYS,
} from "./youtube-warmup-settings";

export const LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY =
  "live_schedule_auto_fill_enabled";

export const SETTINGS_VISIBILITY_VALUES = [
  "public",
  "members",
  "private",
] as const;

export type SettingsVisibility = (typeof SETTINGS_VISIBILITY_VALUES)[number];
export type BooleanSettingValue = "true" | "false";

export interface AdminSettings {
  auto_update_enabled: BooleanSettingValue | null;
  auto_update_interval_hours: AutoUpdateIntervalHours;
  auto_update_last_run: string | null;
  auto_update_range_days: string | null;
  live_schedule_auto_fill_enabled: BooleanSettingValue;
  x_rich_link_preview_enabled: BooleanSettingValue;
  x_posts_visibility: SettingsVisibility;
  naver_cafe_posts_enabled: BooleanSettingValue;
  naver_cafe_posts_visibility: SettingsVisibility;
  x_collection_enabled: BooleanSettingValue;
  x_collection_daily_budget_cents: string;
  x_collection_interval_hours: XCollectionIntervalHours;
  x_collection_last_run: string | null;
  youtube_warmup_enabled: BooleanSettingValue;
  youtube_warmup_interval_hours: YouTubeWarmupIntervalHours;
  youtube_warmup_daily_quota_units: string;
  youtube_warmup_official_enabled: BooleanSettingValue;
  youtube_warmup_kirinuki_enabled: BooleanSettingValue;
  youtube_warmup_last_run: string | null;
}

export const SETTINGS_KEYS = [
  "auto_update_enabled",
  "auto_update_interval_hours",
  "auto_update_last_run",
  "auto_update_range_days",
  "x_rich_link_preview_enabled",
  "x_posts_visibility",
  "naver_cafe_posts_enabled",
  "naver_cafe_posts_visibility",
  "x_collection_enabled",
  "x_collection_daily_budget_cents",
  "x_collection_interval_hours",
  "x_collection_last_run",
  ...YOUTUBE_WARMUP_SETTINGS_KEYS,
  LIVE_SCHEDULE_AUTO_FILL_SETTING_KEY,
] as const satisfies readonly (keyof AdminSettings)[];

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

export const READONLY_SETTINGS_KEYS = [
  "auto_update_last_run",
  "x_collection_last_run",
  "youtube_warmup_last_run",
] as const satisfies readonly SettingsKey[];

export type ReadonlySettingsKey = (typeof READONLY_SETTINGS_KEYS)[number];
export type WritableSettingsKey = Exclude<SettingsKey, ReadonlySettingsKey>;
export type SettingsUpdatePayload = Partial<{
  [Key in WritableSettingsKey]: Extract<AdminSettings[Key], string>;
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

type SettingWrite = {
  key: WritableSettingsKey;
  value: string;
};

type SettingsUpdateParseResult =
  | { ok: true; updates: SettingWrite[] }
  | { ok: false; error: string };

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
    normalize: passthroughNullable,
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
): { settings: AdminSettings; writes: SettingWrite[] } => {
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

  return { settings: normalized as unknown as AdminSettings, writes };
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
