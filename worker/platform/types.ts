import {
  type NewSchedule,
  updateLogs,
  pendingSchedules,
} from "@db/schema";
import type { ScheduledOperationsWorkflowParams } from "@contracts/scheduled-operations";

export interface Env {
  YOUTUBE_API_KEY: string;
  GEMINI_API_KEY?: string;
  OTW_PLAY_AI_REVIEW_ENABLED?: string;
  OTW_PLAY_AI_REVIEW_MODEL?: string;
  OTW_PLAY_AI_REVIEW_DAILY_LIMIT?: string;
  OTW_PLAY_D1_READ_DAILY_TARGET?: string;
  OTW_PLAY_AI_REVIEW_QUEUE?: Queue<unknown>;
  X_BEARER_TOKEN?: string;
  VITE_CLERK_PUBLISHABLE_KEY?: string;
  CLERK_JWKS_URL?: string;
  CLERK_ISSUER?: string;
  CLERK_JWT_AUDIENCE?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  CLERK_ADMIN_IDS?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_D1_DATABASE_ID?: string;
  CLOUDFLARE_D1_TOKEN?: string;
  OTW_PLAY_ANALYTICS_READ_TOKEN?: string;
  OTW_PLAY_ANALYTICS?: AnalyticsEngineDataset;
  OTW_PLAY_SUBMISSION_RATE_LIMITER?: RateLimit;
  OTW_PLAY_INGESTION_QUEUE?: Queue<unknown>;
  OTW_OPS_CONTROL_QUEUE?: Queue<unknown>;
  OTW_OPS_CRITICAL_QUEUE?: Queue<unknown>;
  OTW_OPS_BACKGROUND_QUEUE?: Queue<unknown>;
  SCHEDULED_OPERATIONS_WORKFLOW?: Workflow<ScheduledOperationsWorkflowParams>;
  OTW_PLAY_PUBLIC_ORIGIN?: string;
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
  quote?: {
    postId: string;
    post: XLinkedPostPreviewItem | null;
  } | null;
  reply?: {
    postId: string;
    conversationId: string | null;
    post: XLinkedPostPreviewItem | null;
  } | null;
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
    | "holiday_suggestion"
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
