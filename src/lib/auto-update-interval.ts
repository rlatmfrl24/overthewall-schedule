export const AUTO_UPDATE_INTERVAL_HOURS = ["1", "6", "12", "24"] as const;

export type AutoUpdateIntervalHours =
  (typeof AUTO_UPDATE_INTERVAL_HOURS)[number];

export const DEFAULT_AUTO_UPDATE_INTERVAL_HOURS: AutoUpdateIntervalHours = "6";

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

export const X_COLLECTION_INTERVAL_HOURS = ["2", "6", "12", "24"] as const;

export type XCollectionIntervalHours =
  (typeof X_COLLECTION_INTERVAL_HOURS)[number];

export const DEFAULT_X_COLLECTION_INTERVAL_HOURS: XCollectionIntervalHours = "2";

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
