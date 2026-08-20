import type {
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";

export const OTW_PLAY_SOURCE_HEALTH_LIMIT = 50;
export const OTW_PLAY_SOURCE_HEALTH_LEASE_MS = 30 * 60_000;
export const OTW_PLAY_SOURCE_HEALTH_FETCH_TIMEOUT_MS = 10_000;
export const OTW_PLAY_SOURCE_HEALTH_RECOVERY_WINDOW_DAYS = 7 as const;
export const OTW_PLAY_SOURCE_HEALTH_LINK_LIMIT = 5;

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;

const SUCCESS_INTERVALS: Record<OtwPlaySourceAvailabilityStatus, number> = {
  unknown: 6 * HOUR_MS,
  playable: DAY_MS,
  private: 6 * HOUR_MS,
  embed_disabled: DAY_MS,
  deleted: 7 * DAY_MS,
  region_blocked: DAY_MS,
  unavailable: 6 * HOUR_MS,
};

const RETRY_INTERVALS: Record<OtwPlaySourceHealthRetryCode, number> = {
  timeout: 30 * 60_000,
  network: 30 * 60_000,
  upstream_5xx: 30 * 60_000,
  invalid_response: 30 * 60_000,
  rate_limited: HOUR_MS,
  quota_exceeded: DAY_MS,
};

export const getNextSourceCheckAt = (
  availabilityStatus: OtwPlaySourceAvailabilityStatus,
  now: number,
) => now + SUCCESS_INTERVALS[availabilityStatus];

export const getSourceRetryAt = (
  retryCode: OtwPlaySourceHealthRetryCode,
  now: number,
  retryAfterMs?: number | null,
) => {
  if (retryCode !== "rate_limited" || retryAfterMs == null) {
    return now + RETRY_INTERVALS[retryCode];
  }
  const clamped = Math.min(DAY_MS, Math.max(15 * 60_000, retryAfterMs));
  return now + clamped;
};
