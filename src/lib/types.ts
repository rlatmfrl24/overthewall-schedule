import type {
  Member as DbMember,
  Schedule as DbSchedule,
  DDay as DbDDay,
} from "@/db/schema";

export type ScheduleStatus = "방송" | "휴방" | "게릴라" | "미정";

export type Member = Omit<DbMember, "is_deprecated"> & {
  // D1 numeric is returned as string/number; allow boolean for defensive checks
  is_deprecated?: string | number | boolean | null;
};

export type ScheduleItem = Omit<DbSchedule, "status"> & {
  status: ScheduleStatus;
  start_time?: string | null;
};

export type DDayItem = DbDDay & {
  // UI-only field for gradient support
  colors?: string[] | null;
};

export interface ChzzkLiveStatus {
  code: number;
  message: string;
  content: {
    status: "OPEN" | "CLOSE";
    liveTitle: string;
    liveCategory: string;
    liveImageUrl: string;
    defaultThumbnailImageUrl: string;
    concurrentUserCount: number;
    accumulateCount: number;
    openDate: string;
    adult: boolean;
    chatChannelId: string;
    categoryType: string;
    liveId: number;
    livePollingStatusJson: string;
    channelId: string;
    channelName: string;
    channelImageUrl: string;
    verifiedMark: boolean;
    channelType: string;
  } | null;
}

export type ChzzkLiveStatusMap = Record<
  number,
  ChzzkLiveStatus["content"] | null
>;

// Chzzk VOD Types
export interface ChzzkVideo {
  videoNo: number;
  videoId: string;
  videoTitle: string;
  videoType: string;
  publishDate: string;
  thumbnailImageUrl: string | null;
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
}

export interface ChzzkVideosResponse {
  page: number;
  size: number;
  totalCount: number;
  totalPages: number;
  data: ChzzkVideo[];
}

// YouTube Video Types
export interface YouTubeVideo {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  duration: number; // 초 단위
  viewCount: number;
  channelId: string;
  channelTitle: string;
  isShort: boolean;
  memberUid?: number; // 멤버 uid 매핑용
}

export interface YouTubeVideosResponse {
  videos: YouTubeVideo[];
  shorts: YouTubeVideo[];
  updatedAt: string;
}

// Chzzk Clip Types
export interface ChzzkClip {
  clipUID: string;
  videoId: string;
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
  // 프론트엔드에서 추가할 필드
  memberUid?: number;
}

export interface ChzzkClipsResponse {
  size: number;
  page: {
    next: { clipUID: string } | null;
    prev: { clipUID: string } | null;
  };
  data: ChzzkClip[];
  hasStreamerClips: boolean;
}
