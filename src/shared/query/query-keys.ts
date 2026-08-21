import type { UpdateLogQuery } from "@contracts/audit";

export const queryKeys = {
  otwPlay: {
    all: ["otw-play"] as const,
    config: (audience: "public" | "admin-preview" = "public") =>
      [...queryKeys.otwPlay.all, audience, "config"] as const,
    catalog: (
      canonicalQuery: string,
      audience: "public" | "admin-preview" = "public",
    ) =>
      [...queryKeys.otwPlay.all, audience, "catalog", canonicalQuery] as const,
    facets: (audience: "public" | "admin-preview" = "public") =>
      [...queryKeys.otwPlay.all, audience, "facets"] as const,
    song: (slug: string, audience: "public" | "admin-preview" = "public") =>
      [...queryKeys.otwPlay.all, audience, "song", slug] as const,
    performance: (
      id: string,
      audience: "public" | "admin-preview" = "public",
    ) =>
      [...queryKeys.otwPlay.all, audience, "performance", id] as const,
    adminCatalog: () => [...queryKeys.otwPlay.all, "admin", "catalog"] as const,
    adminSourceHealth: () =>
      [...queryKeys.otwPlay.all, "admin", "source-health"] as const,
    adminObservability: () =>
      [...queryKeys.otwPlay.all, "admin", "observability"] as const,
    adminRelease: () =>
      [...queryKeys.otwPlay.all, "admin", "release"] as const,
      adminProposals: (status: string) =>
        [...queryKeys.otwPlay.all, "admin", "proposals", status] as const,
      importJob: (jobId: string) =>
        [...queryKeys.otwPlay.all, "admin", "imports", jobId] as const,
      importJobItems: (jobId: string) =>
        [...queryKeys.otwPlay.all, "admin", "imports", jobId, "items"] as const,
    memberSubmissions: (userId: string) =>
      [...queryKeys.otwPlay.all, "member", userId, "submissions"] as const,
    memberSubmission: (userId: string, id: string) =>
      [...queryKeys.otwPlay.all, "member", userId, "submission", id] as const,
  },
  members: {
    all: ["members"] as const,
    active: () => [...queryKeys.members.all, "active"] as const,
    profile: (code: string) =>
      [...queryKeys.members.all, "profile", code] as const,
    noticePublisherProfiles: (uidsKey: string) =>
      [...queryKeys.members.all, "notice-publisher-profiles", uidsKey] as const,
  },
  ddays: {
    all: ["ddays"] as const,
    list: () => [...queryKeys.ddays.all, "list"] as const,
    admin: () => [...queryKeys.ddays.all, "admin"] as const,
  },
  notices: {
    all: ["notices"] as const,
    public: () => [...queryKeys.notices.all, "public"] as const,
    admin: () => [...queryKeys.notices.all, "admin"] as const,
    thumbnailStatus: () =>
      [...queryKeys.notices.all, "thumbnail-status"] as const,
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
  youtubeCache: {
    all: ["youtube-cache"] as const,
    status: (windowHours: number) =>
      [...queryKeys.youtubeCache.all, "status", windowHours] as const,
  },
  memberPosts: {
    all: ["member-posts"] as const,
    xConfig: () => [...queryKeys.memberPosts.all, "x-config"] as const,
    naverCafeConfig: () =>
      [...queryKeys.memberPosts.all, "naver-cafe-config"] as const,
    x: (handlesKey: string, maxResults: number, admin: boolean) =>
      [...queryKeys.memberPosts.all, "x", handlesKey, maxResults, admin] as const,
    xContext: (postId: string) =>
      [...queryKeys.memberPosts.all, "x-context", postId] as const,
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
    pendingRejections: (options: {
      search?: string;
      reasonCode?: string;
      rejectedFrom?: string;
      rejectedTo?: string;
      page: number;
      pageSize: number;
    }) =>
      [...queryKeys.settings.all, "pending-rejections", options] as const,
    logs: (options: UpdateLogQuery) =>
      [...queryKeys.settings.all, "logs", options] as const,
    auditLogs: (options: { page: number; pageSize: number }) =>
      [...queryKeys.settings.all, "audit-logs", options] as const,
  },
  operations: {
    all: ["operations"] as const,
    status: (windowHours: number) =>
      [...queryKeys.operations.all, "status", windowHours] as const,
    dataRetention: () =>
      [...queryKeys.operations.all, "data-retention"] as const,
  },
};
