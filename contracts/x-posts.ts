export type XPostsVisibility = "public" | "members" | "private";

export interface XPostMediaDto {
  mediaKey: string;
  type: string;
  url: string | null;
  previewImageUrl: string | null;
  width: number | null;
  height: number | null;
  altText: string | null;
}

export interface XLinkedPostPreviewDto {
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
  media: XPostMediaDto[];
}

export interface XPostLinkDto {
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
  linkedPost?: XLinkedPostPreviewDto | null;
}

export interface XPostDto {
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
  media: XPostMediaDto[];
  links?: XPostLinkDto[];
  quote?: {
    postId: string;
    post: XLinkedPostPreviewDto | null;
  } | null;
  reply?: {
    postId: string;
    conversationId: string | null;
    post: XLinkedPostPreviewDto | null;
  } | null;
}

export interface XPostContextResponseDto {
  sourcePostId: string;
  replyTo: XLinkedPostPreviewDto;
}

export interface XReferenceHydrationResultDto {
  status: "complete" | "deferred" | "failed";
  scanned: number;
  hydrated: number;
  authorsResolved: number;
  deferred: number;
  failed: number;
  terminal: number;
  coalesced: number;
  retryAt: number | null;
  errorCode: string | null;
}

export interface XPostsByHandleDto {
  handle: string;
  userId: string | null;
  posts: XPostDto[];
  error: string | null;
  errorStatus?: number | null;
  errorDetail?: string | null;
  stale: boolean;
}

export interface XPostsResponseDto {
  posts: XPostDto[];
  updatedAt: string;
  clientStale?: boolean;
  byHandle: XPostsByHandleDto[];
}

export interface XPostsConfigResponseDto {
  visibility: XPostsVisibility;
}

export type XHistoryPostStatus = "visible" | "redacted";

export interface XHistoryPostDto {
  postId: string;
  memberUid: number;
  memberName: string;
  postType: "post" | "reply" | "quote";
  createdAt: number;
  firstSeenAt: number;
  mediaCount: number;
  linkCount: number;
  status: XHistoryPostStatus;
  hiddenAt: number | null;
  hiddenReason: string | null;
  post: XPostDto | null;
}

export interface XHistoryPostsResponseDto {
  posts: XHistoryPostDto[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface XHistoryHealthResponseDto {
  referenceHydration?: {
    pendingPosts: number; pendingAuthors: number; terminal: number; oldestPendingAt: number | null;
    nextAttemptAt: number | null; errors: number; budgetDay: string;
    budgetLimitMicros: number; budgetUsedMicros: number; budgetReservedMicros: number;
  };
  lastCollectionSuccessAt: number | null;
  budgetUsedMicros: number;
  optimizer: {
    enabled: boolean;
    configuredIntervalMinutes: number;
    effectiveIntervalMinutes: number;
    fallbackReason: string | null;
    referencePreviewMode: "cached_author" | "post_only" | "link_only";
    previewBacklog: number;
    authorCacheHitsToday: number;
    authorCacheMissesToday: number;
    coalescedHandlesToday: number;
  };
  utcCost: {
    day: string;
    uniquePosts: number;
    uniqueUsers: number;
    uniqueMedia: number;
    listedCostMicros: number;
    conservativeCostMicros: number;
  };
}
