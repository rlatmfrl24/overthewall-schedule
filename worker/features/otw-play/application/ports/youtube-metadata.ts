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

export interface OtwPlayYouTubeMetadataReader {
  readChannel(channelId: string): Promise<OtwPlayYouTubeChannelMetadata | null>;
  readVideo(videoId: string): Promise<OtwPlayYouTubeVideoMetadata | null>;
}

export class OtwPlayYouTubeMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OtwPlayYouTubeMetadataError";
  }
}
import type { OtwPlaySourceAvailabilityStatus } from "@contracts/otw-play";
