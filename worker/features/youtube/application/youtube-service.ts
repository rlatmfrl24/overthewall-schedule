import type {
  CreateKirinukiChannelDto,
  KirinukiChannelDto,
  UpdateKirinukiChannelDto,
  YouTubeCacheStatusResponseDto,
  YouTubeVideoDto,
  YouTubeWarmupRunSummaryDto,
  YouTubeWarmupStatusSummaryDto,
} from "@contracts/youtube";
import { authorizeYouTubeChannelTargets } from "./authorize-channel-targets";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

const YOUTUBE_BATCH_CONCURRENCY = 4;
const KIRINUKI_BATCH_CONCURRENCY = 4;

export type YouTubeChannelContent = {
  videos: YouTubeVideoDto[];
  shorts: YouTubeVideoDto[];
} | null;

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
  fetchChannelVideos(
    channelId: string,
    maxResults: number,
  ): Promise<YouTubeChannelContent>;
  readCacheStatus(windowHours: number): Promise<YouTubeCacheStatusResponseDto>;
  readWarmupStatus(
    windowHours: number,
  ): Promise<YouTubeWarmupStatusSummaryDto>;
  runWarmup(): Promise<YouTubeWarmupRunSummaryDto>;
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

const mapWithConcurrency = async <T, R>(
  items: readonly T[],
  mapper: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]!);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, items.length) },
      () => worker(),
    ),
  );
  return results;
};

const sortNewestFirst = (items: YouTubeVideoDto[]) =>
  items.sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

export const createYouTubeApplication = (
  ports: YouTubeApplicationPorts,
) => ({
  async readCacheOverview(windowHours: number) {
    const [cacheStatus, warmupStatus] = await Promise.all([
      ports.readCacheStatus(windowHours),
      ports.readWarmupStatus(windowHours),
    ]);
    return { ...cacheStatus, warmup: warmupStatus };
  },

  async runManualWarmup(actor: YouTubeActor) {
    const result = await ports.runWarmup();
    await ports.writeWarmupAudit({ ...actor, result });
    return result;
  },

  async readVideos(channelIds: string[], maxResults: number) {
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

    const byChannel = await mapWithConcurrency(
      channelIds,
      async (channelId) => ({
        channelId,
        content: await ports.fetchChannelVideos(channelId, maxResults),
      }),
      YOUTUBE_BATCH_CONCURRENCY,
    );
    const videos = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.videos ?? []),
    );
    const shorts = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.shorts ?? []),
    );
    return { videos, shorts, byChannel };
  },

  listKirinukiChannels: () => ports.listKirinukiChannels(),
  createKirinukiChannel: (input: CreateKirinukiChannelDto) =>
    ports.createKirinukiChannel(input),
  updateKirinukiChannel: (input: UpdateKirinukiChannelDto) =>
    ports.updateKirinukiChannel(input),
  deleteKirinukiChannel: (id: number) =>
    ports.deleteKirinukiChannel(id),

  async readKirinukiVideos(maxResults: number) {
    const channels = (await ports.listKirinukiChannels()).filter((channel) =>
      YOUTUBE_CHANNEL_ID_PATTERN.test(channel.youtube_channel_id.trim()),
    );
    if (channels.length === 0) {
      return { videos: [], shorts: [], byChannel: [] };
    }
    if (!ports.isApiConfigured()) {
      throw new YouTubeApiKeyUnavailableError();
    }

    const byChannel = await mapWithConcurrency(
      channels,
      async (channel) => ({
        channelId: channel.youtube_channel_id,
        channelName: channel.channel_name,
        content: await ports.fetchChannelVideos(
          channel.youtube_channel_id,
          maxResults,
        ),
      }),
      KIRINUKI_BATCH_CONCURRENCY,
    );
    const videos = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.videos ?? []),
    ).slice(0, maxResults);
    const shorts = sortNewestFirst(
      byChannel.flatMap((item) => item.content?.shorts ?? []),
    ).slice(0, maxResults);
    return { videos, shorts, byChannel };
  },
});

export type YouTubeApplication = ReturnType<typeof createYouTubeApplication>;
