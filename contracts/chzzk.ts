export interface ChzzkLiveContentDto {
  status: "OPEN" | "CLOSE";
  liveTitle: string;
  concurrentUserCount: number;
  liveImageUrl: string;
  defaultThumbnailImageUrl: string;
  openDate?: string | null;
  channelId: string;
  channelName: string;
  channelImageUrl: string;
}

export interface ChzzkLiveStatusItemDto {
  channelId: string;
  content: ChzzkLiveContentDto | null;
}

export interface ChzzkLiveStatusDebugDto {
  cacheHit?: boolean;
  cacheAgeMs?: number | null;
  fetchedAt?: number | null;
  httpStatus?: number | null;
  error?: string | null;
  staleCacheUsed?: boolean | null;
  errorBody?: string | null;
}

export interface ChzzkLiveStatusDebugItemDto extends ChzzkLiveStatusItemDto {
  debug?: ChzzkLiveStatusDebugDto;
}

export interface ChzzkLiveStatusResponseDto {
  updatedAt?: string;
  snapshotVersion?: string;
  items?: ChzzkLiveStatusItemDto[];
  scheduleAutoFill?: {
    updated: number;
  };
}

export interface LiveScheduleAutoFillRequestDto {
  channelIds: string[];
  snapshotVersion: string;
}

export interface LiveScheduleAutoFillResponseDto {
  updatedAt: string;
  checkedChannelCount: number;
  scheduleAutoFill: {
    updated: number;
  };
}

export type ChzzkLiveStatusMap = Record<
  number,
  ChzzkLiveContentDto | null
>;

export interface ChzzkVideoDto {
  videoNo: number;
  videoId: string;
  videoTitle: string;
  videoType: string;
  publishDate: string;
  thumbnailImageUrl: string | null;
  trailerUrl?: string;
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
  channelId?: string;
  channelName?: string;
  channelImageUrl?: string;
}

export interface ChzzkVideosResponseDto {
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  data: ChzzkVideoDto[];
}

export interface ChzzkClipDto {
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
}

export interface ChzzkClipsResponseDto {
  size: number;
  page: {
    next: { clipUID: string } | null;
    prev: { clipUID: string } | null;
  };
  data: ChzzkClipDto[];
}

export interface ChzzkVideosBatchResponseDto {
  updatedAt: string;
  items: Array<{
    channelId: string;
    content: ChzzkVideosResponseDto | null;
  }>;
}

export interface ChzzkClipsBatchResponseDto {
  updatedAt: string;
  items: Array<{
    channelId: string;
    content: ChzzkClipsResponseDto | null;
  }>;
}
