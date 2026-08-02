import type { MemberProfileDto } from "@contracts/members";

export interface FeedSeoState {
  xVisibility: string;
  cafeEnabled: boolean;
  cafeVisibility: string;
}

export interface SiteSeoReader {
  readFeedState(): Promise<FeedSeoState>;
  listActiveProfileCodes(): Promise<string[]>;
  findActiveProfileByCode(code: string): Promise<MemberProfileDto | null>;
}
