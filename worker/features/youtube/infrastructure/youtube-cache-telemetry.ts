import type {
  YouTubePublicCacheState,
  YouTubeUsageRequestOrigin,
} from "@contracts/youtube";

export const YOUTUBE_CACHE_TELEMETRY_EVENTS = [
  "youtube.cache.request",
  "youtube.cache.outcome",
  "youtube.cache.refresh",
] as const;

export type YouTubeCacheTelemetryEventName =
  (typeof YOUTUBE_CACHE_TELEMETRY_EVENTS)[number];

export type YouTubeCacheTelemetrySource = "official" | "kirinuki";

export type YouTubeCacheTelemetryState =
  | YouTubePublicCacheState
  | "expired"
  | "missing";

export const YOUTUBE_CACHE_TELEMETRY_OUTCOMES = [
  "served",
  "served_non_blocking",
  "served_after_refresh",
  "scheduled",
  "refreshed",
  "baseline",
  "changed",
  "unchanged",
  "partial",
  "empty",
  "skipped",
  "lease_conflict",
  "quota_rejected",
  "rate_limited",
  "timeout",
  "failed",
] as const;

export const YOUTUBE_CACHE_TELEMETRY_SCHEMA_VERSION = "v2" as const;

export type YouTubeCacheTelemetryOutcome =
  (typeof YOUTUBE_CACHE_TELEMETRY_OUTCOMES)[number];

/**
 * Privacy-safe YouTube cache metrics. Deliberately excludes request URLs,
 * channel/video identifiers, titles, IP addresses, and user identifiers.
 */
export interface YouTubeCacheTelemetryEvent {
  event: YouTubeCacheTelemetryEventName;
  source: YouTubeCacheTelemetrySource;
  origin: YouTubeUsageRequestOrigin;
  state: YouTubeCacheTelemetryState;
  outcome: YouTubeCacheTelemetryOutcome;
  status: number;
  durationMs: number;
  targetCount?: number;
  availableCount?: number;
  refreshCount?: number;
  pendingCount?: number;
}

export interface YouTubeCacheTelemetryWriter {
  write(event: YouTubeCacheTelemetryEvent): void;
}

const EVENT_NAMES = new Set<string>(YOUTUBE_CACHE_TELEMETRY_EVENTS);
const SOURCES = new Set<string>(["official", "kirinuki"]);
const ORIGINS = new Set<string>([
  "demand",
  "manual",
  "scheduled",
  "legacy_unknown",
]);
const STATES = new Set<string>([
  "fresh",
  "refreshing",
  "stale",
  "partial",
  "empty",
  "expired",
  "missing",
]);
const OUTCOMES = new Set<string>(YOUTUBE_CACHE_TELEMETRY_OUTCOMES);

const fixedSlot = (value: unknown, allowed: ReadonlySet<string>) =>
  typeof value === "string" && allowed.has(value) ? value : "unknown";

const finiteNonNegative = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;

export const toYouTubeCacheAnalyticsDataPoint = (
  event: YouTubeCacheTelemetryEvent,
) => {
  const eventName = fixedSlot(event.event, EVENT_NAMES);
  const source = fixedSlot(event.source, SOURCES);
  const origin = fixedSlot(event.origin, ORIGINS);

  return {
    indexes: [`${eventName}|${source}|${origin}`],
    blobs: [
      eventName,
      source,
      origin,
      fixedSlot(event.state, STATES),
      fixedSlot(event.outcome, OUTCOMES),
      YOUTUBE_CACHE_TELEMETRY_SCHEMA_VERSION,
    ],
    doubles: [
      finiteNonNegative(event.status),
      finiteNonNegative(event.durationMs),
      finiteNonNegative(event.targetCount),
      finiteNonNegative(event.availableCount),
      finiteNonNegative(event.refreshCount),
      finiteNonNegative(event.pendingCount),
      1,
    ],
  };
};

class CloudflareYouTubeCacheTelemetryWriter
  implements YouTubeCacheTelemetryWriter
{
  private readonly dataset?: AnalyticsEngineDataset;

  constructor(dataset?: AnalyticsEngineDataset) {
    this.dataset = dataset;
  }

  write(event: YouTubeCacheTelemetryEvent): void {
    try {
      this.dataset?.writeDataPoint(toYouTubeCacheAnalyticsDataPoint(event));
    } catch {
      // Cache delivery and refresh authority never depend on observability.
    }
  }
}

export const createYouTubeCacheTelemetryWriter = (
  dataset?: AnalyticsEngineDataset,
): YouTubeCacheTelemetryWriter =>
  new CloudflareYouTubeCacheTelemetryWriter(dataset);
