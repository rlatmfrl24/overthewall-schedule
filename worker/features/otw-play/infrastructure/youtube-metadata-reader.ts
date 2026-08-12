import { parseISO8601Duration } from "../../../platform/http-helpers";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeChannelMetadata,
  type OtwPlayYouTubeMetadataReader,
  type OtwPlayYouTubeVideoMetadata,
} from "../application/ports/youtube-metadata";

type ChannelResponse = {
  items?: Array<{ id?: string; snippet?: { title?: string } }>;
};

type VideoResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      channelId?: string;
      channelTitle?: string;
      title?: string;
      publishedAt?: string;
      thumbnails?: {
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    contentDetails?: { duration?: string };
    status?: {
      privacyStatus?: string;
      embeddable?: boolean;
    };
  }>;
};

const parsePublishedAt = (value: string | undefined) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
};

const getSafeFetchFailureCode = (error: unknown) => {
  if (!(error instanceof Error)) return null;
  const cause = error.cause;
  if (!cause || typeof cause !== "object" || !("code" in cause)) {
    return error.name !== "Error" ? error.name : null;
  }
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" && /^[A-Za-z0-9_]{1,50}$/.test(code)
    ? code
    : error.name !== "Error"
      ? error.name
      : null;
};

export class YouTubeOtwPlayMetadataReader
  implements OtwPlayYouTubeMetadataReader
{
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(apiKey: string, fetcher: typeof fetch = fetch) {
    this.apiKey = apiKey.trim();
    this.fetcher = fetcher;
  }

  private async read<T>(path: string, parameters: Record<string, string>) {
    if (!this.apiKey) {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube API key is not configured",
      );
    }
    const search = new URLSearchParams({ ...parameters, key: this.apiKey });
    const fetcher = this.fetcher;
    let response: Response;
    try {
      response = await fetcher(
        `https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`,
      );
    } catch (error) {
      const failureCode = getSafeFetchFailureCode(error);
      throw new OtwPlayYouTubeMetadataError(
        failureCode
          ? `YouTube metadata request failed (${failureCode})`
          : "YouTube metadata request failed",
      );
    }
    if (!response.ok) {
      throw new OtwPlayYouTubeMetadataError(
        `YouTube metadata request returned ${response.status}`,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube metadata response was invalid",
      );
    }
  }

  async readChannel(
    channelId: string,
  ): Promise<OtwPlayYouTubeChannelMetadata | null> {
    const data = await this.read<ChannelResponse>("channels", {
      part: "snippet",
      id: channelId,
      maxResults: "1",
    });
    const item = data.items?.[0];
    if (item?.id !== channelId || !item.snippet?.title?.trim()) return null;
    return { channelId, displayName: item.snippet.title.trim() };
  }

  async readVideo(
    videoId: string,
  ): Promise<OtwPlayYouTubeVideoMetadata | null> {
    const data = await this.read<VideoResponse>("videos", {
      part: "snippet,contentDetails,status",
      id: videoId,
      maxResults: "1",
    });
    const item = data.items?.[0];
    const channelId = item?.snippet?.channelId?.trim();
    if (item?.id !== videoId || !channelId) return null;
    const privacyStatus = item.status?.privacyStatus;
    const availabilityStatus =
      privacyStatus === "private"
        ? "private"
        : item.status?.embeddable === false
          ? "embed_disabled"
          : "playable";
    const duration = item.contentDetails?.duration
      ? parseISO8601Duration(item.contentDetails.duration)
      : null;
    return {
      videoId,
      channelId,
      channelTitle: item.snippet?.channelTitle?.trim() || channelId,
      title: item.snippet?.title?.trim() || videoId,
      thumbnailUrl:
        item.snippet?.thumbnails?.high?.url ??
        item.snippet?.thumbnails?.medium?.url ??
        item.snippet?.thumbnails?.default?.url ??
        null,
      durationSeconds: duration,
      publishedAt: parsePublishedAt(item.snippet?.publishedAt),
      availabilityStatus,
    };
  }
}
