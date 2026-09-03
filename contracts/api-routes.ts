export type ExactRoutePattern = `/${string}`;
export type ExactRoutePath = `/${string}`;

const staticRoute = <const TPattern extends ExactRoutePattern>(
  pattern: TPattern,
) =>
  ({
    pattern,
    build: () => pattern,
  }) as const;

const dynamicRoute = <
  const TPattern extends ExactRoutePattern,
  TArgs extends readonly unknown[],
  const TPath extends ExactRoutePath,
>(
  pattern: TPattern,
  build: (...args: TArgs) => TPath,
) =>
  ({
    pattern,
    build,
  }) as const;

const encodeAssetKey = (key: string) =>
  key
    .replace(/^\/+/, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

export const apiRoutes = {
  auth: {
    adminStatus: staticRoute("/api/auth/admin-status"),
  },
  assets: {
    object: dynamicRoute(
      "/r2-assets/*key",
      (key: string) => `/r2-assets/${encodeAssetKey(key)}` as const,
    ),
  },
  audit: {
    adminLogs: staticRoute("/api/settings/audit-logs"),
  },
  chzzk: {
    liveStatus: staticRoute("/api/live-status"),
    vods: staticRoute("/api/vods/chzzk"),
    clips: staticRoute("/api/clips/chzzk"),
  },
  configuration: {
    settings: staticRoute("/api/settings"),
  },
  ddays: {
    collection: staticRoute("/api/ddays"),
  },
  memberPosts: {
    read: staticRoute("/api/member-posts"),
  },
  members: {
    collection: staticRoute("/api/members"),
    profile: dynamicRoute(
      "/api/members/:code",
      (code: string) => `/api/members/${encodeURIComponent(code)}` as const,
    ),
  },
  naverCafe: {
    config: staticRoute("/api/naver-cafe/config"),
    sources: staticRoute("/api/naver-cafe/sources"),
    posts: staticRoute("/api/naver-cafe/posts"),
    checkNow: staticRoute("/api/operations/naver-cafe/check-now"),
  },
  notices: {
    collection: staticRoute("/api/notices"),
    featured: staticRoute("/api/notices/featured"),
    thumbnail: staticRoute("/api/notices/thumbnail"),
    thumbnailStatus: staticRoute("/api/notices/thumbnails/status"),
    thumbnailCleanup: staticRoute("/api/notices/thumbnails/cleanup"),
  },
  operations: {
    status: staticRoute("/api/operations/status"),
    d1Observability: staticRoute("/api/operations/d1-observability"),
    jobSummaries: staticRoute("/api/operations/job-summaries"),
    runs: staticRoute("/api/operations/runs"),
    run: dynamicRoute(
      "/api/operations/runs/:runId",
      (runId: string) =>
        `/api/operations/runs/${encodeURIComponent(runId)}` as const,
    ),
    retryRun: dynamicRoute(
      "/api/operations/runs/:runId/retry",
      (runId: string) =>
        `/api/operations/runs/${encodeURIComponent(runId)}/retry` as const,
    ),
    retentionStatus: staticRoute("/api/operations/data-retention/status"),
    retentionPrune: staticRoute("/api/operations/data-retention/prune"),
    liveScheduleAutoFill: staticRoute(
      "/api/operations/live-schedule/auto-fill",
    ),
  },
  otwPlay: {
    config: staticRoute("/api/play/config"),
    catalog: staticRoute("/api/play/catalog"),
    facets: staticRoute("/api/play/facets"),
    song: dynamicRoute(
      "/api/play/songs/:slug",
      (slug: string) =>
        `/api/play/songs/${encodeURIComponent(slug)}` as const,
    ),
    performance: dynamicRoute(
      "/api/play/performances/:id",
      (id: string) =>
        `/api/play/performances/${encodeURIComponent(id)}` as const,
    ),
    youtubeWebhook: dynamicRoute(
      "/api/play/webhooks/youtube/:token",
      (token: string) =>
        `/api/play/webhooks/youtube/${encodeURIComponent(token)}` as const,
    ),
    submissions: {
      preflight: staticRoute("/api/play/submissions/preflight"),
      create: staticRoute("/api/play/submissions"),
      mine: staticRoute("/api/play/submissions/mine"),
      detail: dynamicRoute(
        "/api/play/submissions/:id",
        (id: string) =>
          `/api/play/submissions/${encodeURIComponent(id)}` as const,
      ),
      withdraw: dynamicRoute(
        "/api/play/submissions/:id/withdraw",
        (id: string) =>
          `/api/play/submissions/${encodeURIComponent(id)}/withdraw` as const,
      ),
    },
    admin: {
      playlistImportPreflight: staticRoute(
        "/api/play/admin/imports/playlist/preflight",
      ),
      playlistImports: staticRoute("/api/play/admin/imports/playlist"),
      importJobs: staticRoute("/api/play/admin/imports"),
      importJob: dynamicRoute(
        "/api/play/admin/imports/:jobId",
        (jobId: string) =>
          `/api/play/admin/imports/${encodeURIComponent(jobId)}` as const,
      ),
        importJobItems: dynamicRoute(
        "/api/play/admin/imports/:jobId/items",
        (jobId: string) =>
          `/api/play/admin/imports/${encodeURIComponent(jobId)}/items` as const,
        ),
        importCandidate: dynamicRoute(
          "/api/play/admin/import-candidates/:id",
          (id: string) =>
            `/api/play/admin/import-candidates/${encodeURIComponent(id)}` as const,
        ),
        convertImportCandidate: dynamicRoute(
          "/api/play/admin/import-candidates/:id/convert",
          (id: string) =>
            `/api/play/admin/import-candidates/${encodeURIComponent(id)}/convert` as const,
        ),
        convertImportJob: dynamicRoute(
          "/api/play/admin/imports/:jobId/convert",
          (jobId: string) =>
            `/api/play/admin/imports/${encodeURIComponent(jobId)}/convert` as const,
        ),
        ignoreImportJobCandidates: dynamicRoute(
          "/api/play/admin/imports/:jobId/ignore",
          (jobId: string) =>
            `/api/play/admin/imports/${encodeURIComponent(jobId)}/ignore` as const,
        ),
        retryImportJob: dynamicRoute(
          "/api/play/admin/imports/:jobId/retry",
          (jobId: string) =>
            `/api/play/admin/imports/${encodeURIComponent(jobId)}/retry` as const,
        ),
      channelMonitors: staticRoute("/api/play/admin/channel-monitors"),
      channelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}` as const,
      ),
      channelMonitorCandidates: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/candidates",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/candidates` as const,
      ),
      reconcileChannelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/reconcile",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/reconcile` as const,
      ),
      subscribeChannelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/subscribe",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/subscribe` as const,
      ),
      renewChannelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/renew",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/renew` as const,
      ),
      unsubscribeChannelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/unsubscribe",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/unsubscribe` as const,
      ),
      revokeChannelMonitorApproval: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/revoke-approval",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/revoke-approval` as const,
      ),
      backfillChannelMonitor: dynamicRoute(
        "/api/play/admin/channel-monitors/:id/backfill",
        (id: string) =>
          `/api/play/admin/channel-monitors/${encodeURIComponent(id)}/backfill` as const,
      ),
      catalog: staticRoute("/api/play/admin/catalog"),
      catalogEntryPreflight: staticRoute(
        "/api/play/admin/catalog-entries/preflight",
      ),
      catalogEntries: staticRoute("/api/play/admin/catalog-entries"),
      entities: staticRoute("/api/play/admin/entities"),
      deleteEntity: dynamicRoute(
        "/api/play/admin/entities/:id",
        (id: string) =>
          `/api/play/admin/entities/${encodeURIComponent(id)}` as const,
      ),
      songs: staticRoute("/api/play/admin/songs"),
      deleteSong: dynamicRoute(
        "/api/play/admin/songs/:id",
        (id: string) =>
          `/api/play/admin/songs/${encodeURIComponent(id)}` as const,
      ),
      performances: staticRoute("/api/play/admin/performances"),
      deletePerformance: dynamicRoute(
        "/api/play/admin/performances/:id",
        (id: string) =>
          `/api/play/admin/performances/${encodeURIComponent(id)}` as const,
      ),
      publishPerformance: dynamicRoute(
        "/api/play/admin/performances/:id/publish",
        (id: string) =>
          `/api/play/admin/performances/${encodeURIComponent(id)}/publish` as const,
      ),
      withdrawPerformance: dynamicRoute(
        "/api/play/admin/performances/:id/withdraw",
        (id: string) =>
          `/api/play/admin/performances/${encodeURIComponent(id)}/withdraw` as const,
      ),
      submissions: staticRoute("/api/play/admin/submissions"),
      approveSubmission: dynamicRoute(
        "/api/play/admin/submissions/:id/approve",
        (id: string) =>
          `/api/play/admin/submissions/${encodeURIComponent(id)}/approve` as const,
      ),
      rejectSubmission: dynamicRoute(
        "/api/play/admin/submissions/:id/reject",
        (id: string) =>
          `/api/play/admin/submissions/${encodeURIComponent(id)}/reject` as const,
      ),
      channelLookup: staticRoute("/api/play/admin/channels/lookup"),
      channels: staticRoute("/api/play/admin/channels"),
      sourceHealth: staticRoute("/api/play/admin/source-health"),
      observability: staticRoute("/api/play/admin/observability"),
      release: staticRoute("/api/play/admin/release"),
      recheckSource: dynamicRoute(
        "/api/play/admin/sources/:id/recheck",
        (id: string) =>
          `/api/play/admin/sources/${encodeURIComponent(id)}/recheck` as const,
      ),
    },
  },
  scheduleBoard: {
    read: staticRoute("/api/schedule-board"),
  },
  schedules: {
    collection: staticRoute("/api/schedules"),
    save: staticRoute("/api/schedules/save"),
    updateLogs: staticRoute("/api/settings/logs"),
    updateLog: dynamicRoute(
      "/api/settings/logs/:id",
      (id: number) => `/api/settings/logs/${id}` as const,
    ),
    runNow: staticRoute("/api/settings/run-now"),
    pending: {
      list: staticRoute("/api/settings/pending"),
      resetProcessed: dynamicRoute(
        "/api/settings/pending/:id/reset-processed",
        (id: number) =>
          `/api/settings/pending/${id}/reset-processed` as const,
      ),
      applyEmptyTarget: dynamicRoute(
        "/api/settings/pending/:id/apply-empty-target",
        (id: number) =>
          `/api/settings/pending/${id}/apply-empty-target` as const,
      ),
      approve: dynamicRoute(
        "/api/settings/pending/:id/approve",
        (id: number) => `/api/settings/pending/${id}/approve` as const,
      ),
      reject: dynamicRoute(
        "/api/settings/pending/:id/reject",
        (id: number) => `/api/settings/pending/${id}/reject` as const,
      ),
      rejections: staticRoute("/api/settings/pending/rejections"),
      reopenRejection: dynamicRoute(
        "/api/settings/pending/rejections/:id/reopen",
        (id: number) =>
          `/api/settings/pending/rejections/${id}/reopen` as const,
      ),
      actions: staticRoute("/api/settings/pending/actions"),
      approveSelected: staticRoute(
        "/api/settings/pending/approve-selected",
      ),
      rejectSelected: staticRoute("/api/settings/pending/reject-selected"),
      approveAll: staticRoute("/api/settings/pending/approve-all"),
      rejectAll: staticRoute("/api/settings/pending/reject-all"),
    },
  },
  xPosts: {
    config: staticRoute("/api/x/config"),
    read: staticRoute("/api/x/posts"),
    redact: dynamicRoute(
      "/api/x/posts/:id",
      (id: string) => `/api/x/posts/${encodeURIComponent(id)}` as const,
    ),
    context: dynamicRoute(
      "/api/x/posts/:id/context",
      (id: string) =>
        `/api/x/posts/${encodeURIComponent(id)}/context` as const,
    ),
    historyPosts: staticRoute("/api/x/history/posts"),
    historyHealth: staticRoute("/api/x/history/health"),
    runCollectionNow: staticRoute("/api/settings/x-collection/run-now"),
  },
  youtube: {
    videos: staticRoute("/api/youtube/videos"),
    shorts: staticRoute("/api/youtube/shorts"),
    cacheStatus: staticRoute("/api/youtube/cache/status"),
    cacheRefresh: staticRoute("/api/youtube/cache/refresh"),
    cacheWarmup: staticRoute("/api/youtube/cache/warmup/run"),
    kirinukiChannels: staticRoute("/api/kirinuki/channels"),
    kirinukiVideos: staticRoute("/api/kirinuki/videos"),
  },
} as const;

export const withRouteSearch = (
  path: ExactRoutePath,
  search: string | URLSearchParams,
) => {
  const query = search.toString();
  return query ? `${path}?${query}` : path;
};
