import type { ScheduleBoardResponse } from "@contracts/schedule-board";
import type { NoticeDto } from "@contracts/notices";
import type { SiteContentSection } from "@contracts/site-public-content";
import type { FeedSeoState } from "./site-seo-reader";

export interface SiteContentReader {
  readSchedule(start: string, end: string): Promise<ScheduleBoardResponse>;
  readNotices(today: string): Promise<NoticeDto[]>;
  readFeed(state: FeedSeoState): Promise<SiteContentSection[]>;
  readVideos(): Promise<SiteContentSection[]>;
  readPlaySongs(slug?: string): Promise<SiteContentSection[]>;
}
