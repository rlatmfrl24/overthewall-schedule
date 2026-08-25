import { parseISO8601Duration } from "../../../platform/http-helpers";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeChannelMetadata,
  type OtwPlayYouTubeBatchMetadataReader,
  type OtwPlayYouTubeIngestionReader,
  type OtwPlayYouTubeVideoMetadata,
  type OtwPlayYouTubeVideoObservation,
} from "../application/ports/youtube-metadata";
import { OTW_PLAY_SOURCE_HEALTH_FETCH_TIMEOUT_MS } from "../domain/source-health-policy";

type ChannelResponse = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
  }>;
};

type VideoItem = {
  id?: string;
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    publishedAt?: string;
    liveBroadcastContent?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
  contentDetails?: {
    duration?: string;
    regionRestriction?: { allowed?: string[]; blocked?: string[] };
  };
  status?: {
    uploadStatus?: string;
    privacyStatus?: string;
    embeddable?: boolean;
    madeForKids?: boolean;
  };
  player?: { embedWidth?: number; embedHeight?: number };
  liveStreamingDetails?: {
    actualStartTime?: string;
    actualEndTime?: string;
    scheduledStartTime?: string;
  };
};

type VideoResponse = { items?: VideoItem[] };
type PlaylistResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      channelId?: string;
      channelTitle?: string;
    };
    contentDetails?: { itemCount?: number };
    status?: { privacyStatus?: string };
  }>;
};
type PlaylistItemsResponse = {
  items?: Array<{
    id?: string;
    snippet?: { position?: number };
    contentDetails?: { videoId?: string };
  }>;
  nextPageToken?: string;
};
type YouTubeErrorResponse = {
  error?: { errors?: Array<{ reason?: string }>; message?: string };
};

const parsePublishedAt = (value: string | undefined) => {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
};

const parseRetryAfterMs = (response: Response) => {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
};

const availabilityOf = (item: VideoItem) => {
  if (item.status?.uploadStatus === "deleted") return "deleted" as const;
  if (item.status?.privacyStatus === "private") return "private" as const;
  const restriction = item.contentDetails?.regionRestriction;
  if (
    (restriction?.allowed && !restriction.allowed.includes("KR")) ||
    restriction?.blocked?.includes("KR")
  ) {
    return "region_blocked" as const;
  }
  if (item.status?.embeddable === false) return "embed_disabled" as const;
  return item.status?.uploadStatus === "processed" &&
    (item.status.privacyStatus === "public" ||
      item.status.privacyStatus === "unlisted")
    ? ("playable" as const)
    : ("unavailable" as const);
};

const videoMetadata = (
  item: VideoItem,
  availabilityStatus: OtwPlayYouTubeVideoObservation["availabilityStatus"],
): OtwPlayYouTubeVideoMetadata | null => {
  const videoId = item.id?.trim();
  const channelId = item.snippet?.channelId?.trim();
  if (!videoId || !channelId) return null;
  const duration = item.contentDetails?.duration
    ? parseISO8601Duration(item.contentDetails.duration)
    : null;
  const width = item.player?.embedWidth;
  const height = item.player?.embedHeight;
  const verticalShort = duration !== null &&
    duration <= 180 &&
    typeof width === "number" &&
    typeof height === "number" &&
    height > width;
  const liveOrBroadcast = Boolean(item.liveStreamingDetails) ||
    (item.snippet?.liveBroadcastContent !== undefined &&
      item.snippet.liveBroadcastContent !== "none");
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
    madeForKids:
      typeof item.status?.madeForKids === "boolean"
        ? item.status.madeForKids
        : null,
    scopeReview: verticalShort || liveOrBroadcast,
  };
};

export class YouTubeOtwPlayMetadataReader
  implements OtwPlayYouTubeBatchMetadataReader, OtwPlayYouTubeIngestionReader
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
        "configuration",
        false,
      );
    }
    const search = new URLSearchParams({ ...parameters, key: this.apiKey });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OTW_PLAY_SOURCE_HEALTH_FETCH_TIMEOUT_MS,
    );
    let response: Response;
    try {
      const fetcher = this.fetcher;
      response = await fetcher(
        `https://www.googleapis.com/youtube/v3/${path}?${search.toString()}`,
        { signal: controller.signal },
      );
    } catch (error) {
      const timedOut =
        controller.signal.aborted ||
        (error instanceof Error && error.name === "AbortError");
      throw new OtwPlayYouTubeMetadataError(
        timedOut
          ? "YouTube metadata request timed out"
          : "YouTube metadata request failed",
        timedOut ? "timeout" : "network",
        true,
      );
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      let reason = "";
      try {
        const body = (await response.json()) as YouTubeErrorResponse;
        reason = body.error?.errors?.[0]?.reason ?? body.error?.message ?? "";
      } catch {
        // The status remains authoritative when the provider body is invalid.
      }
      if (response.status === 429) {
        throw new OtwPlayYouTubeMetadataError(
          "YouTube metadata request was rate limited",
          "rate_limited",
          true,
          parseRetryAfterMs(response),
        );
      }
      if (response.status === 403 && /quota|dailyLimit/i.test(reason)) {
        throw new OtwPlayYouTubeMetadataError(
          "YouTube metadata quota was exceeded",
          "quota_exceeded",
          true,
        );
      }
      if (response.status >= 500) {
        throw new OtwPlayYouTubeMetadataError(
          `YouTube metadata request returned ${response.status}`,
          "upstream_5xx",
          true,
        );
      }
      if ([400, 401, 403].includes(response.status)) {
        throw new OtwPlayYouTubeMetadataError(
          `YouTube metadata request returned ${response.status}`,
          response.status === 400 ? "invalid_request" : "provider_auth",
          false,
        );
      }
      throw new OtwPlayYouTubeMetadataError(
        `YouTube metadata request returned ${response.status}`,
        "invalid_response",
        true,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube metadata response was invalid",
        "invalid_response",
        true,
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

  async readChannelUploads(channelId: string) {
    const data = await this.read<ChannelResponse>("channels", {
      part: "snippet,contentDetails",
      id: channelId,
      maxResults: "1",
    });
    const item = data.items?.[0];
    const displayName = item?.snippet?.title?.trim();
    const uploadsPlaylistId = item?.contentDetails?.relatedPlaylists?.uploads?.trim();
    if (
      item?.id !== channelId ||
      !displayName ||
      !uploadsPlaylistId ||
      !/^UU[A-Za-z0-9_-]{22}$/.test(uploadsPlaylistId)
    ) {
      return null;
    }
    return { channelId, displayName, uploadsPlaylistId };
  }

  async readVideos(
    videoIds: readonly string[],
  ): Promise<OtwPlayYouTubeVideoObservation[]> {
    const ids = [...new Set(videoIds.map((id) => id.trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    if (ids.length > 50) {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube metadata batch exceeds 50 videos",
        "invalid_request",
        false,
      );
    }
    if (ids.length === 0) return [];
    const data = await this.read<VideoResponse>("videos", {
      part: "snippet,contentDetails,status,player,liveStreamingDetails",
      id: ids.join(","),
      maxResults: String(ids.length),
      maxWidth: "480",
    });
    if (!Array.isArray(data.items)) {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube metadata response was invalid",
        "invalid_response",
        true,
      );
    }
    const itemById = new Map(
      (data.items ?? [])
        .filter((item): item is VideoItem & { id: string } => Boolean(item.id))
        .map((item) => [item.id, item]),
    );
    return ids.map((videoId) => {
      const item = itemById.get(videoId);
      if (!item) {
        return {
          videoId,
          availabilityStatus: "unavailable" as const,
          video: null,
        };
      }
      const availabilityStatus = availabilityOf(item);
      const video = videoMetadata(item, availabilityStatus);
      if (!video && availabilityStatus === "playable") {
        throw new OtwPlayYouTubeMetadataError(
          "YouTube metadata response was invalid",
          "invalid_response",
          true,
        );
      }
      return {
        videoId,
        availabilityStatus,
        video,
      };
    });
  }

  async readVideo(
    videoId: string,
  ): Promise<OtwPlayYouTubeVideoMetadata | null> {
    return (await this.readVideos([videoId]))[0]?.video ?? null;
  }

  async readPlaylistSummary(playlistId: string) {
    const data = await this.read<PlaylistResponse>("playlists", {
      part: "snippet,contentDetails,status",
      id: playlistId,
      maxResults: "1",
    });
    const item = data.items?.[0];
    const privacyStatus = item?.status?.privacyStatus === "public"
      ? "public" as const
      : item?.status?.privacyStatus === "unlisted"
        ? "unlisted" as const
        : null;
    if (
      item?.id !== playlistId ||
      privacyStatus === null ||
      !item.snippet?.title?.trim() ||
      !item.snippet.channelId?.trim() ||
      !Number.isSafeInteger(item.contentDetails?.itemCount) ||
      Number(item.contentDetails?.itemCount) < 0
    ) {
      return null;
    }
    return {
      playlistId,
      title: item.snippet.title.trim(),
      ownerChannelId: item.snippet.channelId.trim(),
      ownerChannelTitle:
        item.snippet.channelTitle?.trim() || item.snippet.channelId.trim(),
      itemCount: Number(item.contentDetails?.itemCount),
      privacyStatus,
    };
  }

  async readPlaylistPage(playlistId: string, pageToken: string | null) {
    const data = await this.read<PlaylistItemsResponse>("playlistItems", {
      part: "snippet,contentDetails",
      playlistId,
      maxResults: "50",
      ...(pageToken ? { pageToken } : {}),
    });
    if (!Array.isArray(data.items)) {
      throw new OtwPlayYouTubeMetadataError(
        "YouTube playlist response was invalid",
        "invalid_response",
        true,
      );
    }
    const items = data.items.flatMap((item) => {
      const playlistItemId = item.id?.trim();
      const videoId = item.contentDetails?.videoId?.trim();
      const position = item.snippet?.position;
      if (
        !playlistItemId ||
        !videoId ||
        !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
        !Number.isSafeInteger(position) ||
        Number(position) < 0
      ) {
        return [];
      }
      return [{ playlistItemId, videoId, position: Number(position) }];
    });
    return {
      items,
      nextPageToken: data.nextPageToken?.trim() || null,
    };
  }
}
