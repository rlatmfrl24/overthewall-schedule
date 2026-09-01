import type {
  CreateKirinukiChannelDto,
  KirinukiChannelDto,
  YouTubeCacheRefreshRunSummaryDto,
  YouTubeCacheAnalyticsDto,
  YouTubePublicCacheMetadataDto,
  UpdateKirinukiChannelDto,
  YouTubeCacheStatusResponseDto,
  YouTubeVideoDto,
  YouTubeWarmupRunSummaryDto,
  YouTubeWarmupStatusSummaryDto,
} from "@contracts/youtube";
import { authorizeYouTubeChannelTargets } from "./authorize-channel-targets";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

export type YouTubeChannelContent = {
  videos: YouTubeVideoDto[];
  shorts: YouTubeVideoDto[];
} | null;

export type YouTubeCacheReadTarget = {
  channelId: string;
  source: "official" | "kirinuki";
};

export type YouTubeCacheBatchReadResult = {
  byChannel: Array<YouTubeCacheReadTarget & { content: YouTubeChannelContent }>;
  cache: YouTubePublicCacheMetadataDto;
};

export type YouTubeCacheTargetDescriptor = YouTubeCacheReadTarget & {
  cacheKey: string;
};

export type YouTubeActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

export type YouTubeWarmupAuditInput = YouTubeActor & {
  result: YouTubeWarmupRunSummaryDto;
};

export interface YouTubeApplicationPorts {
  isApiConfigured(): boolean;
  readAllowedChannelIds(): Promise<ReadonlySet<string>>;
  readChannelsWithSWR(
    targets: readonly YouTubeCacheReadTarget[],
    ctx?: ExecutionContext,
  ): Promise<YouTubeCacheBatchReadResult>;
  readStoredFeed?(
    channelIds: readonly string[],
    maxResults: number,
    source: "official" | "kirinuki",
  ): Promise<{
    videos: YouTubeVideoDto[];
    shorts: YouTubeVideoDto[];
    oldestRetainedAt: string | null;
  } | null>;
  readCacheTargets(): Promise<YouTubeCacheTargetDescriptor[]>;
  readCacheStatus(
    windowHours: number,
    usageEndAt?: number,
  ): Promise<YouTubeCacheStatusResponseDto>;
  readCacheAnalytics(windowHours: number): Promise<YouTubeCacheAnalyticsDto>;
  readWarmupStatus(
    windowHours: number,
  ): Promise<YouTubeWarmupStatusSummaryDto>;
  runCacheRefresh(): Promise<YouTubeCacheRefreshRunSummaryDto>;
  writeWarmupAudit(input: YouTubeWarmupAuditInput): Promise<void>;
  listKirinukiChannels(): Promise<KirinukiChannelDto[]>;
  createKirinukiChannel(input: CreateKirinukiChannelDto): Promise<boolean>;
  updateKirinukiChannel(input: UpdateKirinukiChannelDto): Promise<boolean>;
  deleteKirinukiChannel(id: number): Promise<boolean>;
}

export class YouTubeAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("YouTube channel allowlist is unavailable", options);
    this.name = "YouTubeAllowlistUnavailableError";
  }
}

export class YouTubeTargetsNotAllowedError extends Error {
  readonly unauthorized: string[];

  constructor(unauthorized: string[]) {
    super("Unapproved YouTube channel targets");
    this.name = "YouTubeTargetsNotAllowedError";
    this.unauthorized = unauthorized;
  }
}

export class YouTubeApiKeyUnavailableError extends Error {
  constructor() {
    super("YouTube API key not configured");
    this.name = "YouTubeApiKeyUnavailableError";
  }
}

export class YouTubeCacheRefreshInProgressError extends Error {
  constructor() {
    super("youtube_cache_refresh_in_progress");
    this.name = "YouTubeCacheRefreshInProgressError";
  }
}

const sortNewestFirst = (items: YouTubeVideoDto[]) =>
  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

export const createYouTubeApplication = (
  ports: YouTubeApplicationPorts,
) => ({
  async readCacheOverview(windowHours: number) {
    const [analytics, warmupStatus, targets] = await Promise.all([
      ports.readCacheAnalytics(windowHours),
      ports.readWarmupStatus(windowHours),
      ports.readCacheTargets(),
    ]);
    const analyticsGeneratedAt = Date.parse(analytics.generatedAt);
    const cacheStatus = await ports.readCacheStatus(
      windowHours,
      Number.isFinite(analyticsGeneratedAt) ? analyticsGeneratedAt : undefined,
    );
    const channelsByKey = new Map(
      cacheStatus.channels.map((channel) => [channel.cacheKey, channel]),
    );
    const targetStates = {
      official: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
      kirinuki: { total: 0, fresh: 0, stale: 0, expired: 0, missing: 0 },
    };
    for (const target of targets) {
      const counts = targetStates[target.source];
      counts.total += 1;
      const channel = channelsByKey.get(target.cacheKey);
      if (!channel || channel.fetchedAt <= 0) counts.missing += 1;
      else counts[channel.status] += 1;
    }
    const activeUsage = cacheStatus.usage.byOrigin.filter(
      (item) => item.origin === "demand" || item.origin === "manual",
    );
    const externalApiCalls = activeUsage.reduce(
      (sum, item) => sum + item.apiCalls,
      0,
    );
    const activeQuotaUnits = activeUsage.reduce(
      (sum, item) => sum + item.quotaUnits,
      0,
    );
    const analyticsAvailable = analytics.status === "available";
    const analyticsSummary = analytics.summary;
    const requestCount = analyticsAvailable
      ? analyticsSummary.requestCount
      : null;
    const nonBlockingServeCount = analyticsAvailable
      ? analyticsSummary.nonBlockingServeCount
      : null;
    const changedCount = analyticsAvailable
      ? analyticsSummary.changedCount
      : null;
    const unchangedCount = analyticsAvailable
      ? analyticsSummary.unchangedCount
      : null;
    const evaluatedCount = (changedCount ?? 0) + (unchangedCount ?? 0);
    return {
      ...cacheStatus,
      analytics,
      warmup: warmupStatus,
      targetStates,
      legacyScheduledRuns: warmupStatus.recentRuns.filter(
        (run) => run.source === "scheduled",
      ),
      effectiveness: {
        requestCount,
        nonBlockingServeCount,
        nonBlockingServeRate:
          requestCount && nonBlockingServeCount !== null
            ? nonBlockingServeCount / requestCount
            : null,
        externalApiCalls,
        activeQuotaUnits,
        baselineCount: analyticsAvailable
          ? analyticsSummary.baselineCount
          : null,
        changedCount,
        unchangedCount,
        changeRate:
          changedCount !== null && evaluatedCount > 0
            ? changedCount / evaluatedCount
            : null,
        quotaPerChange:
          changedCount === null || changedCount === 0
            ? null
            : activeQuotaUnits / changedCount,
      },
    };
  },

  async runManualCacheRefresh(actor: YouTubeActor) {
    const result = await ports.runCacheRefresh();
    await ports.writeWarmupAudit({ ...actor, result });
    return result;
  },

  async readVideos(
    channelIds: string[],
    maxResults: number,
    ctx?: ExecutionContext,
  ) {
    let allowedChannelIds: ReadonlySet<string>;
    try {
      allowedChannelIds = await ports.readAllowedChannelIds();
    } catch (error) {
      throw new YouTubeAllowlistUnavailableError({ cause: error });
    }
    const authorized = authorizeYouTubeChannelTargets(
      channelIds,
      allowedChannelIds,
    );
    if (!authorized.ok) {
      throw new YouTubeTargetsNotAllowedError(authorized.unauthorized);
    }

    const storedFeed = await ports.readStoredFeed?.(
      channelIds,
      maxResults,
      "official",
    );
    if (storedFeed) {
      return {
        ...storedFeed,
        collectionState: "storage_only" as const,
        cache: {
          state: storedFeed.videos.length + storedFeed.shorts.length > 0 ? "fresh" as const : "empty" as const,
          oldestFetchedAt: storedFeed.oldestRetainedAt,
          refreshScheduledCount: 0,
          pendingCount: 0,
          revalidateAfterMs: null,
        },
        targetCount: channelIds.length,
        availableTargetCount: channelIds.length,
      };
    }

    const result = await ports.readChannelsWithSWR(
      channelIds.map((channelId) => ({ channelId, source: "official" })),
      ctx,
    );
    const videos = sortNewestFirst(
      result.byChannel.flatMap((item) => item.content?.videos ?? []),
    ).slice(0, maxResults);
    const shorts = sortNewestFirst(
      result.byChannel.flatMap((item) => item.content?.shorts ?? []),
    ).slice(0, maxResults);
    return {
      videos,
      shorts,
      cache: result.cache,
      targetCount: result.byChannel.length,
      availableTargetCount: result.byChannel.filter((item) => item.content).length,
    };
  },

  listKirinukiChannels: () => ports.listKirinukiChannels(),
  createKirinukiChannel: (input: CreateKirinukiChannelDto) =>
    ports.createKirinukiChannel(input),
  updateKirinukiChannel: (input: UpdateKirinukiChannelDto) =>
    ports.updateKirinukiChannel(input),
  deleteKirinukiChannel: (id: number) =>
    ports.deleteKirinukiChannel(id),

  async readKirinukiVideos(maxResults: number, ctx?: ExecutionContext) {
    const channels = (await ports.listKirinukiChannels()).filter((channel) =>
      YOUTUBE_CHANNEL_ID_PATTERN.test(channel.youtube_channel_id.trim()),
    );
    if (channels.length === 0) {
      return {
        videos: [],
        shorts: [],
        byChannel: [],
        cache: {
          state: "empty" as const,
          oldestFetchedAt: null,
          refreshScheduledCount: 0,
          pendingCount: 0,
          revalidateAfterMs: null,
        },
      };
    }
    const storedFeed = await ports.readStoredFeed?.(
      channels.map((channel) => channel.youtube_channel_id),
      maxResults,
      "kirinuki",
    );
    if (storedFeed) {
      const channelNames = new Map(channels.map((channel) => [channel.youtube_channel_id, channel.channel_name]));
      return {
        ...storedFeed,
        collectionState: "storage_only" as const,
        byChannel: channels.map((channel) => ({
          channelId: channel.youtube_channel_id,
          channelName: channelNames.get(channel.youtube_channel_id) ?? channel.youtube_channel_id,
          content: {
            videos: storedFeed.videos.filter((video) => video.channelId === channel.youtube_channel_id),
            shorts: storedFeed.shorts.filter((video) => video.channelId === channel.youtube_channel_id),
          },
        })),
        cache: {
          state: storedFeed.videos.length + storedFeed.shorts.length > 0 ? "fresh" as const : "empty" as const,
          oldestFetchedAt: storedFeed.oldestRetainedAt,
          refreshScheduledCount: 0,
          pendingCount: 0,
          revalidateAfterMs: null,
        },
      };
    }
    const result = await ports.readChannelsWithSWR(
      channels.map((channel) => ({
        channelId: channel.youtube_channel_id,
        source: "kirinuki",
      })),
      ctx,
    );
    const channelNames = new Map(
      channels.map((channel) => [channel.youtube_channel_id, channel.channel_name]),
    );
    const byChannel = result.byChannel.map((item) => ({
      channelId: item.channelId,
      channelName: channelNames.get(item.channelId) ?? item.channelId,
      content: item.content
        ? {
            videos: sortNewestFirst([...item.content.videos]).slice(0, maxResults),
            shorts: sortNewestFirst([...item.content.shorts]).slice(0, maxResults),
          }
        : null,
    }));
    const videos = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.videos ?? []),
    ).slice(0, maxResults);
    const shorts = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.shorts ?? []),
    ).slice(0, maxResults);
    return { videos, shorts, byChannel, cache: result.cache };
  },
});

export type YouTubeApplication = ReturnType<typeof createYouTubeApplication>;
