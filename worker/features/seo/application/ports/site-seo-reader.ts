import type { MemberProfileDto } from "@contracts/members";
import type { PlaySongSeoProjection } from "@contracts/site-seo";

export interface FeedSeoState {
  xVisibility: string;
  cafeEnabled: boolean;
  cafeVisibility: string;
}

export interface PlaySeoState {
  revision: number;
  readModelRevision: number | null;
  publicReadEnabled: boolean;
  navigationVisible: boolean;
  updatedAt: number;
}

export interface SiteSeoReader {
  readFeedState(): Promise<FeedSeoState>;
  listActiveProfileCodes(): Promise<string[]>;
  findActiveProfileByCode(code: string): Promise<MemberProfileDto | null>;
  readPlayState(): Promise<PlaySeoState>;
  listPublishedPlaySongSlugs(): Promise<string[]>;
  findPublishedPlaySongBySlug(
    slug: string,
  ): Promise<PlaySongSeoProjection | null>;
}
