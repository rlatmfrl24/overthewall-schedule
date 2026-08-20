import type {
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";

export interface OtwPlayYouTubeChannelMetadata {
  channelId: string;
  displayName: string;
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
