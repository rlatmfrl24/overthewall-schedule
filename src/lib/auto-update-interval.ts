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
