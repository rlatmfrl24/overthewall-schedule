import type {
  YouTubePublicCacheMetadataDto,
  YouTubeUsageRequestOrigin,
} from "@contracts/youtube";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";
import type { CachedYouTubeVideos } from "../../../platform/types";
import {
  fetchYouTubeVideosForChannel,
  getYouTubeVideosCacheKey,
  type YouTubeRefreshFailure,
} from "./youtube-api";
import type {
  YouTubeCacheTelemetryWriter,
} from "./youtube-cache-telemetry";

const EXECUTION_LEASE_MS = 90_000;
const CHANNEL_TIMEOUT_MS = 12_000;
const MAX_REFRESH_TARGETS = 2;
const FIVE_MINUTES_MS = 5 * 60_000;
const ONE_HOUR_MS = 60 * 60_000;
const SIX_HOURS_MS = 6 * ONE_HOUR_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

type YouTubeCacheDb = Pick<D1Database, "prepare">;
type ChannelContent = CachedYouTubeVideos["content"];

export type YouTubeCacheTargetSource = "official" | "kirinuki";
export type YouTubeCacheTarget = {
  channelId: string;
  source: YouTubeCacheTargetSource;
};

export type YouTubeCacheTargetState =
  | "fresh"
  | "stale"
  | "expired"
  | "missing";

type CacheRow = {
  key: string;
  value: string;
  fetched_at: number | string;
  expires_at: number | string;
  stale_until: number | string;
  refresh_after: number | string;
};

type ResolvedTarget = YouTubeCacheTarget & {
  cacheKey: string;
  canonicalMaxResults: number;
  freshTtlMs: number;
  staleTtlMs: number;
  content: ChannelContent;
  fetchedAt: number;
  refreshAfter: number;
  state: YouTubeCacheTargetState;
};

export type YouTubeSWRBatchResult = {
  byChannel: Array<{
    channelId: string;
    source: YouTubeCacheTargetSource;
    content: ChannelContent;
  }>;
  cache: YouTubePublicCacheMetadataDto;
  targetStates: Record<YouTubeCacheTargetState, number>;
};

const toNumber = (value: number | string | null | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getPolicy = (source: YouTubeCacheTargetSource) =>
  source === "official"
    ? WORKER_CACHE_POLICY.youtube.officialChannelVideos
    : WORKER_CACHE_POLICY.youtube.kirinukiChannelVideos;

const parseContent = (value: string): ChannelContent => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<NonNullable<ChannelContent>>;
    if (!Array.isArray(candidate.videos) || !Array.isArray(candidate.shorts)) {
      return null;
    }
    return {
      videos: candidate.videos,
      shorts: candidate.shorts,
    };
  } catch {
    return null;
  }
};

const classify = (
  row: CacheRow | null,
  timestamp: number,
): Pick<ResolvedTarget, "content" | "fetchedAt" | "refreshAfter" | "state"> => {
  if (!row) {
    return { content: null, fetchedAt: 0, refreshAfter: 0, state: "missing" };
  }
  const content = parseContent(row.value);
  if (!content) {
    return {
      content: null,
      fetchedAt: toNumber(row.fetched_at),
      refreshAfter: toNumber(row.refresh_after),
      state: "missing",
    };
  }
  const expiresAt = toNumber(row.expires_at);
  const staleUntil = toNumber(row.stale_until);
  return {
    content,
    fetchedAt: toNumber(row.fetched_at),
    refreshAfter: toNumber(row.refresh_after),
    state:
      timestamp <= expiresAt
        ? "fresh"
        : timestamp <= staleUntil
          ? "stale"
          : "expired",
  };
};

const readTarget = async (
  db: YouTubeCacheDb,
  target: YouTubeCacheTarget,
  timestamp: number,
): Promise<ResolvedTarget> => {
  const policy = getPolicy(target.source);
  const cacheKey = getYouTubeVideosCacheKey(
    target.channelId,
    policy.canonicalMaxResults,
  );
  let row: CacheRow | null = null;
  try {
    row = await db
      .prepare(
        `SELECT key, value, fetched_at, expires_at, stale_until, refresh_after
         FROM youtube_api_cache
         WHERE key = ? AND type = 'channel_videos'`,
      )
      .bind(cacheKey)
      .first<CacheRow>();
  } catch (error) {
    console.warn("Failed to read YouTube SWR cache target", error);
  }
  return {
    ...target,
    cacheKey,
    canonicalMaxResults: policy.canonicalMaxResults,
    freshTtlMs: policy.freshTtlMs,
    staleTtlMs: policy.staleTtlMs,
    ...classify(row, timestamp),
  };
};

const claimRefreshLease = async (
  db: YouTubeCacheDb,
  target: ResolvedTarget,
  timestamp: number,
) => {
  const leaseUntil = timestamp + EXECUTION_LEASE_MS;
  try {
    if (target.state === "missing") {
      const claimed = await db
        .prepare(
          `INSERT INTO youtube_api_cache (
             key, type, value, fetched_at, expires_at, stale_until,
             refresh_after, last_status, last_error
           ) VALUES (?, 'channel_videos', 'null', 0, 0, 0, ?, NULL, NULL)
           ON CONFLICT(key) DO UPDATE SET
             refresh_after = excluded.refresh_after
           WHERE youtube_api_cache.refresh_after <= ?
           RETURNING key`,
        )
        .bind(target.cacheKey, leaseUntil, timestamp)
        .first<{ key: string }>();
      return Boolean(claimed);
    }
    const claimed = await db
      .prepare(
        `UPDATE youtube_api_cache
         SET refresh_after = ?
         WHERE key = ? AND refresh_after <= ?
         RETURNING key`,
      )
      .bind(leaseUntil, target.cacheKey, timestamp)
      .first<{ key: string }>();
    return Boolean(claimed);
  } catch (error) {
    console.warn("Failed to claim YouTube SWR refresh lease", error);
    return false;
  }
};

const getBackoffMs = (failure: YouTubeRefreshFailure | null) => {
  if (!failure) return FIVE_MINUTES_MS;
  if (failure.quotaRejected) return SIX_HOURS_MS;
  if (failure.status === 429) {
    return Math.min(
      ONE_HOUR_MS,
      Math.max(FIVE_MINUTES_MS, failure.retryAfterMs ?? 15 * 60_000),
    );
  }
  if (failure.status === 403 && /quota/i.test(failure.error ?? "")) {
    return SIX_HOURS_MS;
  }
  if (failure.status === 0 || failure.status >= 500) return FIVE_MINUTES_MS;
  if (failure.status >= 400) return ONE_DAY_MS;
  return FIVE_MINUTES_MS;
};

const applyRefreshBackoff = async (
  db: YouTubeCacheDb,
  cacheKey: string,
  failure: YouTubeRefreshFailure | null,
) => {
  try {
    await db
      .prepare(
        `UPDATE youtube_api_cache
         SET refresh_after = ?, last_status = ?, last_error = ?
         WHERE key = ?`,
      )
      .bind(
        Date.now() + getBackoffMs(failure),
        failure?.status ?? 0,
        failure?.error ?? "youtube_refresh_failed",
        cacheKey,
      )
      .run();
  } catch (error) {
    console.warn("Failed to persist YouTube SWR backoff", error);
  }
};

type RefreshChange = "baseline" | "changed" | "unchanged" | null;

const videoIds = (content: ChannelContent) =>
  new Set(
    [...(content?.videos ?? []), ...(content?.shorts ?? [])].map(
      (video) => video.videoId,
    ),
  );

const classifyRefreshChange = (
  before: ChannelContent,
  after: ChannelContent,
): RefreshChange => {
  if (!after) return null;
  if (!before) return "baseline";
  const beforeIds = videoIds(before);
  const afterIds = videoIds(after);
  return beforeIds.size === afterIds.size &&
    Array.from(beforeIds).every((id) => afterIds.has(id))
    ? "unchanged"
    : "changed";
};

const refreshTarget = async (
  db: YouTubeCacheDb,
  apiKey: string,
  target: ResolvedTarget,
  origin: YouTubeUsageRequestOrigin,
  telemetry: YouTubeCacheTelemetryWriter,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_TIMEOUT_MS);
  const startedAt = Date.now();
  const failureState: { value: YouTubeRefreshFailure | null } = {
    value: null,
  };
  const beforeContent = target.content;
  try {
    const content = await fetchYouTubeVideosForChannel(
      target.channelId,
      apiKey,
      target.canonicalMaxResults,
      db,
      {
        forceRefresh: true,
        quotaPriority: origin === "manual" ? "critical" : "core",
        requestOrigin: origin,
        freshTtlMs: target.freshTtlMs,
        staleTtlMs: target.staleTtlMs,
        signal: controller.signal,
        onFailure: (nextFailure) => {
          failureState.value = nextFailure;
        },
      },
    );
    const failure = failureState.value;
    if (failure) {
      await applyRefreshBackoff(db, target.cacheKey, failure);
    }
    const change = failure
      ? null
      : classifyRefreshChange(beforeContent, content);
    telemetry.write({
      event: "youtube.cache.refresh",
      source: target.source,
      origin,
      state: content ? "fresh" : target.state,
      outcome: content
        ? failure
          ? "partial"
          : change ?? "refreshed"
        : failure?.quotaRejected
          ? "quota_rejected"
          : failure?.status === 429
            ? "rate_limited"
            : controller.signal.aborted
              ? "timeout"
              : "failed",
      status: failure?.status ?? (content ? 200 : 502),
      durationMs: Date.now() - startedAt,
      targetCount: 1,
      availableCount: content ? 1 : 0,
      refreshCount: 1,
      pendingCount: content ? 0 : 1,
    });
    return { content, failure, change };
  } catch (error) {
    const failure: YouTubeRefreshFailure = {
      status: 0,
      error: error instanceof Error ? error.message : String(error),
      retryAfterMs: null,
      quotaRejected: false,
    };
    await applyRefreshBackoff(db, target.cacheKey, failure);
    telemetry.write({
      event: "youtube.cache.refresh",
      source: target.source,
      origin,
      state: target.state,
      outcome: controller.signal.aborted ? "timeout" : "failed",
      status: 0,
      durationMs: Date.now() - startedAt,
      targetCount: 1,
      availableCount: target.content ? 1 : 0,
      refreshCount: 1,
      pendingCount: 1,
    });
    return { content: target.content, failure, change: null };
  } finally {
    clearTimeout(timer);
  }
};

const priority = (state: YouTubeCacheTargetState) =>
  state === "missing" ? 0 : state === "expired" ? 1 : 2;

const countStates = (targets: readonly ResolvedTarget[]) => ({
  fresh: targets.filter((target) => target.state === "fresh").length,
  stale: targets.filter((target) => target.state === "stale").length,
  expired: targets.filter((target) => target.state === "expired").length,
  missing: targets.filter((target) => target.state === "missing").length,
});

export const readYouTubeChannelsWithSWR = async ({
  db,
  apiKey,
  targets,
  ctx,
  telemetry,
}: {
  db: YouTubeCacheDb;
  apiKey: string;
  targets: readonly YouTubeCacheTarget[];
  ctx?: ExecutionContext;
  telemetry: YouTubeCacheTelemetryWriter;
}): Promise<YouTubeSWRBatchResult> => {
  const timestamp = Date.now();
  const uniqueTargets = Array.from(
    new Map(
      targets.map((target) => [
        `${target.source}:${target.channelId}`,
        target,
      ]),
    ).values(),
  );
  const resolved = await Promise.all(
    uniqueTargets.map((target) => readTarget(db, target, timestamp)),
  );
  const initialAvailability = new Map(
    (["official", "kirinuki"] as const).map((source) => {
      const sourceTargets = resolved.filter((target) => target.source === source);
      return [
        source,
        {
          targetCount: sourceTargets.length,
          availableCount: sourceTargets.filter((target) => target.content).length,
        },
      ] as const;
    }),
  );
  const candidates = resolved
    .filter(
      (target) =>
        target.state !== "fresh" &&
        target.refreshAfter <= timestamp &&
        (!target.content || Boolean(ctx)),
    )
    .sort(
      (a, b) =>
        priority(a.state) - priority(b.state) || a.fetchedAt - b.fetchedAt,
    )
    .slice(0, MAX_REFRESH_TARGETS);

  const claimed = (
    await Promise.all(
      candidates.map(async (target) => ({
        target,
        claimed: await claimRefreshLease(db, target, timestamp),
      })),
    )
  ).filter((item) => item.claimed);

  const synchronous = claimed.filter((item) => !item.target.content);
  const background = claimed.filter((item) => item.target.content && ctx);
  const blockingSources = new Set(
    synchronous.map((item) => item.target.source),
  );
  const syncResults = await Promise.all(
    synchronous.map(async ({ target }) => ({
      target,
      result: await refreshTarget(db, apiKey, target, "demand", telemetry),
    })),
  );
  for (const { target, result } of syncResults) {
    if (result.content) {
      target.content = result.content;
      target.fetchedAt = Date.now();
      target.state = "fresh";
      target.refreshAfter = 0;
    }
  }
  for (const { target } of background) {
    ctx?.waitUntil(
      refreshTarget(db, apiKey, target, "demand", telemetry).then(() => undefined),
    );
  }

  const available = resolved.filter((target) => target.content);
  const pendingCount = resolved.filter((target) => target.state !== "fresh").length;
  const refreshScheduledCount = background.length;
  const refreshingCount = resolved.filter(
    (target) => target.state !== "fresh" && target.refreshAfter > timestamp,
  ).length + refreshScheduledCount;
  const oldestFetchedAt = available.length
    ? new Date(Math.min(...available.map((target) => target.fetchedAt))).toISOString()
    : null;
  const state =
    resolved.length === 0 || available.length === 0
      ? "empty"
      : available.length < resolved.length
        ? "partial"
        : pendingCount === 0
          ? "fresh"
          : refreshingCount > 0
            ? "refreshing"
            : "stale";
  const cache: YouTubePublicCacheMetadataDto = {
    state,
    oldestFetchedAt,
    refreshScheduledCount,
    pendingCount,
    revalidateAfterMs: pendingCount > 0 ? 15000 : null,
  };

  for (const source of ["official", "kirinuki"] as const) {
    const sourceTargets = resolved.filter((target) => target.source === source);
    if (sourceTargets.length === 0) continue;
    const sourceAvailableCount = sourceTargets.filter(
      (target) => target.content,
    ).length;
    const initial = initialAvailability.get(source)!;
    telemetry.write({
      event: "youtube.cache.request",
      source,
      origin: "demand",
      state,
      outcome:
        sourceAvailableCount === 0
          ? "empty"
          : blockingSources.has(source)
            ? "served_after_refresh"
            : "served_non_blocking",
      status: sourceAvailableCount === 0 ? 503 : 200,
      durationMs: Date.now() - timestamp,
      targetCount: initial.targetCount,
      availableCount: initial.availableCount,
      refreshCount: claimed.filter((item) => item.target.source === source).length,
      pendingCount: sourceTargets.filter((target) => target.state !== "fresh").length,
    });
  }

  return {
    byChannel: resolved.map((target) => ({
      channelId: target.channelId,
      source: target.source,
      content: target.content,
    })),
    cache,
    targetStates: countStates(resolved),
  };
};

export const YOUTUBE_SWR_LIMITS = {
  executionLeaseMs: EXECUTION_LEASE_MS,
  channelTimeoutMs: CHANNEL_TIMEOUT_MS,
  maxRefreshTargets: MAX_REFRESH_TARGETS,
} as const;
