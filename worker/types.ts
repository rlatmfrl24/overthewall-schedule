import {
  type NewSchedule,
  updateLogs,
  pendingSchedules,
} from "../src/db/schema";

export interface Env {
  YOUTUBE_API_KEY: string;
  X_BEARER_TOKEN?: string;
  otw_db: D1Database;
  ASSETS?: {
    fetch: (request: Request) => Response | Promise<Response>;
  };
}

export type CachedLiveStatus = {
  fetchedAt: number;
  content: {
    status: "OPEN" | "CLOSE";
    liveTitle: string;
    concurrentUserCount: number;
    liveImageUrl: string;
    defaultThumbnailImageUrl: string;
    channelId: string;
    channelName: string;
    channelImageUrl: string;
  } | null;
};

export type LiveStatusDebug = {
  cacheHit: boolean;
  cacheAgeMs: number | null;
  fetchedAt: number | null;
  httpStatus: number | null;
  error: string | null;
  staleCacheUsed: boolean | null;
};

export type CachedChzzkVideos = {
  fetchedAt: number;
  content: {
    page: number;
    size: number;
    totalCount: number;
    totalPages: number;
    data: Array<{
      videoNo: number;
      videoId: string;
      videoTitle: string;
      videoType: string;
      publishDate: string;
      thumbnailImageUrl: string;
      trailerUrl: string;
      duration: number;
      readCount: number;
      publishDateAt: number;
      categoryType: string | null;
      videoCategory: string | null;
      videoCategoryValue: string;
      channel: {
        channelId: string;
        channelName: string;
        channelImageUrl: string;
      };
      channelId: string;
      channelName: string;
      channelImageUrl: string;
    }>;
  } | null;
};

export type CachedChzzkClips = {
  fetchedAt: number;
  content: {
    size: number;
    page: {
      next: { clipUID: string } | null;
      prev: { clipUID: string } | null;
    };
    data: Array<{
      clipUID: string;
      videoNo: number | null;
      clipTitle: string;
      ownerChannelId: string;
      thumbnailImageUrl: string | null;
      categoryType: string;
      clipCategory: string;
      duration: number;
      adult: boolean;
      createdDate: string;
      readCount: number;
      blindType: string | null;
      hasStreamerClips: boolean;
    }>;
  } | null;
};

export type YouTubeVideoItem = {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  channelId: string;
  channelTitle: string;
  isShort: boolean;
};

export type CachedYouTubeVideos = {
  fetchedAt: number;
  content: {
    videos: YouTubeVideoItem[];
    shorts: YouTubeVideoItem[];
  } | null;
};

export type XPostMediaItem = {
  mediaKey: string;
  type: string;
  url: string | null;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export type XLinkedPostPreviewItem = {
  id: string;
  text: string;
  createdAt: string | null;
  url: string;
  username: string;
  name: string | null;
  profileImageUrl: string | null;
  metrics: {
    likeCount: number;
    replyCount: number;
    repostCount: number;
    quoteCount: number;
  };
  media: XPostMediaItem[];
};

export type XPostLinkItem = {
  url: string;
  expandedUrl: string | null;
  displayUrl: string | null;
  resolvedUrl?: string | null;
  domain?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  siteName?: string | null;
  previewStatus?: "ready" | "unavailable" | "skipped";
  linkedPost?: XLinkedPostPreviewItem | null;
};

export type XPostItem = {
  id: string;
  text: string;
  createdAt: string;
  url: string;
  username: string;
  metrics: {
    likeCount: number;
    replyCount: number;
    repostCount: number;
    quoteCount: number;
  };
  media: XPostMediaItem[];
  links?: XPostLinkItem[];
};

export type UpdateLogPayload = {
  scheduleId?: number | null;
  memberUid?: number | null;
  memberName?: string | null;
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
  scheduleDate: string;
  action:
    | "create"
    | "update"
    | "delete"
    | "approve"
    | "reject"
    | "reset_processed"
    | "auto_collected"
    | "auto_updated"
    | "auto_failed";
  title?: string | null;
  previousStatus?: string | null;
};

export type NoticePayload = {
  id?: number | string;
  content?: string;
  url?: string;
  type?: string;
  is_active?: string | number | boolean;
  started_at?: string;
  ended_at?: string;
};

export type SchedulePayload = Pick<
  NewSchedule,
  "member_uid" | "date" | "start_time" | "title" | "status"
>;

export type UpdateSchedulePayload = SchedulePayload & { id: number | string };

export type DDayPayload = {
  id?: number | string;
  title?: string;
  date?: string;
  description?: string;
  color?: string;
  type?: string;
};

export type AutoUpdateDetail = {
  memberUid: number;
  memberName: string;
  scheduleId: number | null;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string | null;
};

export type NewPendingSchedule = typeof pendingSchedules.$inferInsert;
export type NewUpdateLog = typeof updateLogs.$inferInsert;
