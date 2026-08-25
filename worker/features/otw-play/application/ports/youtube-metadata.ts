import type {
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";

export interface OtwPlayYouTubeChannelMetadata {
  channelId: string;
  displayName: string;
}

export interface OtwPlayYouTubeChannelUploads {
  channelId: string;
  displayName: string;
  uploadsPlaylistId: string;
}

export interface OtwPlayYouTubeVideoMetadata {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: number | null;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
  madeForKids?: boolean | null;
  scopeReview?: boolean;
}

export interface OtwPlayYouTubeVideoObservation {
  videoId: string;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
  video: OtwPlayYouTubeVideoMetadata | null;
}

export type OtwPlayYouTubeMetadataErrorCode =
  | OtwPlaySourceHealthRetryCode
  | "configuration"
  | "provider_auth"
  | "invalid_request";

export interface OtwPlayYouTubeMetadataReader {
  readChannel(channelId: string): Promise<OtwPlayYouTubeChannelMetadata | null>;
  readVideo(videoId: string): Promise<OtwPlayYouTubeVideoMetadata | null>;
}

export interface OtwPlayYouTubeBatchMetadataReader
  extends OtwPlayYouTubeMetadataReader {
  readVideos(videoIds: readonly string[]): Promise<OtwPlayYouTubeVideoObservation[]>;
}

export interface OtwPlayYouTubePlaylistSummary {
  playlistId: string;
  title: string;
  ownerChannelId: string;
  ownerChannelTitle: string;
  itemCount: number;
  privacyStatus: "public" | "unlisted";
}

export interface OtwPlayYouTubePlaylistItem {
  playlistItemId: string;
  videoId: string;
  position: number;
}

export interface OtwPlayYouTubePlaylistPage {
  items: OtwPlayYouTubePlaylistItem[];
  nextPageToken: string | null;
}

export interface OtwPlayYouTubeIngestionReader
  extends OtwPlayYouTubeBatchMetadataReader {
  readChannelUploads(
    channelId: string,
  ): Promise<OtwPlayYouTubeChannelUploads | null>;
  readPlaylistSummary(
    playlistId: string,
  ): Promise<OtwPlayYouTubePlaylistSummary | null>;
  readPlaylistPage(
    playlistId: string,
    pageToken: string | null,
  ): Promise<OtwPlayYouTubePlaylistPage>;
}

export class OtwPlayYouTubeMetadataError extends Error {
  readonly code: OtwPlayYouTubeMetadataErrorCode;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    code: OtwPlayYouTubeMetadataErrorCode = "invalid_response",
    retryable = code === "timeout" ||
      code === "network" ||
      code === "upstream_5xx" ||
      code === "invalid_response" ||
      code === "rate_limited" ||
      code === "quota_exceeded",
    retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "OtwPlayYouTubeMetadataError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}
