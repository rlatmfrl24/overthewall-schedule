import type { UpdateLogQuery } from "@/lib/api/settings";

export const queryKeys = {
  members: {
    all: ["members"] as const,
    active: () => [...queryKeys.members.all, "active"] as const,
    profile: (code: string) =>
      [...queryKeys.members.all, "profile", code] as const,
  },
  ddays: {
    all: ["ddays"] as const,
    list: () => [...queryKeys.ddays.all, "list"] as const,
  },
  notices: {
    all: ["notices"] as const,
    public: () => [...queryKeys.notices.all, "public"] as const,
    admin: () => [...queryKeys.notices.all, "admin"] as const,
  },
  schedules: {
    all: ["schedules"] as const,
    board: (startDate: string, endDate: string) =>
      [...queryKeys.schedules.all, "board", startDate, endDate] as const,
    byDate: (date: string) =>
      [...queryKeys.schedules.all, "by-date", date] as const,
    range: (startDate: string, endDate: string) =>
      [...queryKeys.schedules.all, "range", startDate, endDate] as const,
  },
  liveStatus: {
    all: ["live-status"] as const,
    statuses: (channelIdsKey: string, schedulesKey: string) =>
      [...queryKeys.liveStatus.all, "statuses", channelIdsKey, schedulesKey] as const,
    diagnostics: (channelIdsKey: string, schedulesKey: string) =>
      [
        ...queryKeys.liveStatus.all,
        "diagnostics",
        channelIdsKey,
        schedulesKey,
      ] as const,
  },
  media: {
    all: ["media"] as const,
    youtube: (channelIdsKey: string, maxResults: number) =>
      [...queryKeys.media.all, "youtube", channelIdsKey, maxResults] as const,
    chzzkVods: (channelIdsKey: string, videosPerMember: number) =>
      [...queryKeys.media.all, "chzzk-vods", channelIdsKey, videosPerMember] as const,
    chzzkLatestVods: (channelIdsKey: string) =>
      [...queryKeys.media.all, "chzzk-latest-vods", channelIdsKey] as const,
    chzzkClips: (channelIdsKey: string, clipsPerMember: number) =>
      [...queryKeys.media.all, "chzzk-clips", channelIdsKey, clipsPerMember] as const,
    kirinuki: (maxResults: number) =>
      [...queryKeys.media.all, "kirinuki", maxResults] as const,
  },
  memberPosts: {
    all: ["member-posts"] as const,
    xConfig: () => [...queryKeys.memberPosts.all, "x-config"] as const,
    naverCafeConfig: () =>
      [...queryKeys.memberPosts.all, "naver-cafe-config"] as const,
    x: (handlesKey: string, maxResults: number, admin: boolean) =>
      [...queryKeys.memberPosts.all, "x", handlesKey, maxResults, admin] as const,
    naverCafe: (size: number, admin: boolean) =>
      [...queryKeys.memberPosts.all, "naver-cafe", size, admin] as const,
    aggregate: (
      includeX: boolean,
      includeNaverCafe: boolean,
      maxResults: number,
      size: number,
      admin: boolean,
    ) =>
      [
        ...queryKeys.memberPosts.all,
        "aggregate",
        includeX,
        includeNaverCafe,
        maxResults,
        size,
        admin,
      ] as const,
  },
  settings: {
    all: ["settings"] as const,
    detail: () => [...queryKeys.settings.all, "detail"] as const,
    pending: () => [...queryKeys.settings.all, "pending"] as const,
    logs: (options: UpdateLogQuery) =>
      [...queryKeys.settings.all, "logs", options] as const,
  },
};
