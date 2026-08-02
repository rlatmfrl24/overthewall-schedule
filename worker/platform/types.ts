import {
  type NewSchedule,
  updateLogs,
  pendingSchedules,
} from "@db/schema";

export interface Env {
  YOUTUBE_API_KEY: string;
  X_BEARER_TOKEN?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  VITE_CLERK_ADMIN_IDS?: string;
  CLERK_JWKS_URL?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_AUDIENCE?: string;
  CLERK_ADMIN_IDS?: string;
  otw_db: D1Database;
  ASSET_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
}

export type CachedLiveStatus = {
  fetchedAt: number;
  content: {
    status: "OPEN" | "CLOSE";
    liveTitle: string;
    concurrentUserCount: number;
    liveImageUrl: string;
    defaultThumbnailImageUrl: string;
    openDate?: string | null;
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

export type YouTubeCacheType = "uploads_playlist" | "channel_videos";
export type YouTubeCacheStatus = "fresh" | "stale" | "expired";
export type YouTubeApiOperation =
  | "channels.list"
  | "playlistItems.list"
  | "videos.list";
export type YouTubeWarmupSource = "scheduled" | "manual";
export type YouTubeWarmupStatus = "success" | "skipped" | "partial" | "failed";
export type YouTubeWarmupTargetSource = "official" | "kirinuki";

export type YouTubeWarmupRunSummary = {
  id: number | null;
  source: YouTubeWarmupSource;
  status: YouTubeWarmupStatus;
  targetCount: number;
  skippedFreshCount: number;
  refreshedCount: number;
  failedCount: number;
  staleFallbackCount: number;
  apiCalls: number;
  quotaUnits: number;
  durationMs: number;
  startedAt: number;
  finishedAt: number;
  error: string | null;
};

export type YouTubeWarmupStatusSummary = {
  settings: {
    enabled: boolean;
    intervalHours: number;
    dailyQuotaUnits: number;
    officialEnabled: boolean;
    kirinukiEnabled: boolean;
    lastRun: number | null;
  };
  quota: {
    limit: number;
    used: number;
    remaining: number;
    windowHours: number;
    since: number;
  };
  targets: {
    total: number;
    official: number;
    kirinuki: number;
  };
  latestRun: YouTubeWarmupRunSummary | null;
  recentRuns: YouTubeWarmupRunSummary[];
};

export type YouTubeCacheStatusResponse = {
  updatedAt: string;
  window: { hours: number; since: number };
  cache: {
    total: number;
    fresh: number;
    stale: number;
    expired: number;
    byType: Array<{
      type: YouTubeCacheType;
      total: number;
      fresh: number;
      stale: number;
      expired: number;
    }>;
  };
  usage: {
    apiCalls: number;
    quotaUnits: number;
    successCount: number;
    failureCount: number;
    rateLimitCount: number;
    quotaErrorCount: number;
    byOperation: Array<{
      operation: YouTubeApiOperation;
      apiCalls: number;
      quotaUnits: number;
      failureCount: number;
    }>;
  };
  warmup?: YouTubeWarmupStatusSummary;
  channels: Array<{
    channelId: string;
    cacheKey: string;
    maxResults: number | null;
    type: YouTubeCacheType;
    status: YouTubeCacheStatus;
    fetchedAt: number;
    expiresAt: number;
    staleUntil: number;
    lastStatus: number | null;
    lastError: string | null;
  }>;
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
    | "reopen_rejection"
    | "reset_processed"
    | "candidate_obsolete"
    | "auto_collected"
    | "auto_updated"
    | "schedule_auto_created"
    | "schedule_auto_updated"
    | "auto_failed";
  title?: string | null;
  previousStatus?: string | null;
};

export type AdminAuditLogPayload = {
  eventType: string;
  resourceType: string;
  resourceId?: string | null;
  action: string;
  status: "success" | "partial" | "failed" | "skipped";
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
  targetCount?: number | null;
  successCount?: number | null;
  failureCount?: number | null;
  detail?: Record<string, unknown> | null;
  error?: string | null;
};

export type NoticePayload = {
  id?: number | string;
  content?: string;
  links?: Array<{ label: string; url: string }>;
  image_urls?: string[];
  related_member_uids?: number[];
  url?: string;
  thumbnail_url?: string | null;
  type?: string;
  publisher_type?: string;
  publisher_member_uid?: number | string | null;
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
  vodId?: string | null;
  candidateKind?:
    | "missing_schedule"
    | "fill_missing_fields"
    | "ambiguous";
  matchReason?: string;
  matchConfidence?: "high" | "medium" | "low";
  sessionStartedAt?: string;
  sessionEndedAt?: string;
  segmentCount?: number;
};

export type NewPendingSchedule = typeof pendingSchedules.$inferInsert;
export type NewUpdateLog = typeof updateLogs.$inferInsert;
