import type {
  Member as DbMember,
  Schedule as DbSchedule,
  Notice as DbNotice,
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

export type NoticeItem = DbNotice;

export type DDayItem = DbDDay & {
  // UI-only field for gradient support
  colors?: string[] | null;
};

export type DDayType = DDayItem["type"];

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

export type MemberVodMap = Record<number, ChzzkVideo | null>;
