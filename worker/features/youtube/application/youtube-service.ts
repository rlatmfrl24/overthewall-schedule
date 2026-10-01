import type {
  CreateKirinukiChannelDto, KirinukiChannelDto, UpdateKirinukiChannelDto,
  YouTubeFeedStatusDto, YouTubePublicCacheMetadataDto, YouTubeShortsResponseDto,
  YouTubeVideoDto, YouTubeVodsRequest, YouTubeVodsResponseDto,
} from "@contracts/youtube";
import { authorizeYouTubeChannelTargets } from "./authorize-channel-targets";
import { YOUTUBE_CHANNEL_ID_PATTERN } from "../domain/channel-targets";

type StoredFeed = { videos: YouTubeVideoDto[]; shorts: YouTubeVideoDto[]; oldestRetainedAt: string | null };
export interface YouTubeApplicationPorts {
  readVods(input: YouTubeVodsRequest): Promise<YouTubeVodsResponseDto>;
  readFeedStatus(windowHours: 24 | 168): Promise<YouTubeFeedStatusDto>;
  readAllowedChannelIds(): Promise<ReadonlySet<string>>;
  readStoredFeed(channelIds: readonly string[], maxResults: number, source: "official" | "kirinuki"): Promise<StoredFeed>;
  readShorts(channelIds: readonly string[], limit: number, cursor: string | null, ctx?: ExecutionContext): Promise<YouTubeShortsResponseDto>;
  listKirinukiChannels(): Promise<KirinukiChannelDto[]>;
  createKirinukiChannel(input: CreateKirinukiChannelDto): Promise<boolean>;
  updateKirinukiChannel(input: UpdateKirinukiChannelDto): Promise<boolean>;
  deleteKirinukiChannel(id: number): Promise<boolean>;
}
export class YouTubeAllowlistUnavailableError extends Error {
  constructor(options?: ErrorOptions) { super("YouTube channel allowlist is unavailable", options); this.name = "YouTubeAllowlistUnavailableError"; }
}
export class YouTubeTargetsNotAllowedError extends Error {
  readonly unauthorized: string[];
  constructor(unauthorized: string[]) { super("Unapproved YouTube channel targets"); this.name = "YouTubeTargetsNotAllowedError"; this.unauthorized = unauthorized; }
}
export const storedFeedCache = (feed: StoredFeed, now = Date.now()): YouTubePublicCacheMetadataDto => ({
  state: !feed.videos.length && !feed.shorts.length ? "empty" :
    feed.oldestRetainedAt && now - Date.parse(feed.oldestRetainedAt) < 24 * 60 * 60_000 ? "fresh" : "stale",
  oldestFetchedAt: feed.oldestRetainedAt,
  refreshScheduledCount: 0, pendingCount: 0, revalidateAfterMs: null,
});
export const createYouTubeApplication = (ports: YouTubeApplicationPorts) => {
  const authorize = async (ids: string[]) => {
    let allowed: ReadonlySet<string>;
    try { allowed = await ports.readAllowedChannelIds(); }
    catch (error) { throw new YouTubeAllowlistUnavailableError({ cause: error }); }
    const result = authorizeYouTubeChannelTargets(ids, allowed);
    if (!result.ok) throw new YouTubeTargetsNotAllowedError(result.unauthorized);
  };
  return {
    readVods: ports.readVods,
    readFeedStatus: ports.readFeedStatus,
    async readVideos(channelIds: string[], maxResults: number) {
      await authorize(channelIds);
      const feed = await ports.readStoredFeed(channelIds, maxResults, "official");
      return { ...feed, collectionState: "storage_only" as const, cache: storedFeedCache(feed), targetCount: channelIds.length, availableTargetCount: channelIds.length };
    },
    async readShorts(ids: string[], limit: number, cursor: string | null, ctx?: ExecutionContext) {
      await authorize(ids);
      return ports.readShorts(ids, limit, cursor, ctx);
    },
    listKirinukiChannels: ports.listKirinukiChannels,
    createKirinukiChannel: ports.createKirinukiChannel,
    updateKirinukiChannel: ports.updateKirinukiChannel,
    deleteKirinukiChannel: ports.deleteKirinukiChannel,
    async readKirinukiVideos(maxResults: number) {
      const channels = (await ports.listKirinukiChannels()).filter((channel) => YOUTUBE_CHANNEL_ID_PATTERN.test(channel.youtube_channel_id.trim()));
      const feed = await ports.readStoredFeed(channels.map((channel) => channel.youtube_channel_id), maxResults, "kirinuki");
      return {
        ...feed, collectionState: "storage_only" as const, cache: storedFeedCache(feed),
        byChannel: channels.map((channel) => ({
          channelId: channel.youtube_channel_id, channelName: channel.channel_name,
          content: { videos: feed.videos.filter((video) => video.channelId === channel.youtube_channel_id), shorts: feed.shorts.filter((video) => video.channelId === channel.youtube_channel_id) },
        })),
      };
    },
  };
};
export type YouTubeApplication = ReturnType<typeof createYouTubeApplication>;
