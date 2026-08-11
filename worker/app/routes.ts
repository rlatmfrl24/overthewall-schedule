import { apiRoutes } from "@contracts/api-routes";
import {
  createHandleR2Asset,
  R2AssetReader,
} from "../features/assets";
import {
  createHandleAdminAuditLogs,
  D1AdminAuditLogReader,
} from "../features/audit";
import {
  buildChzzkApplication,
  createChzzkMediaHandler,
  createLiveScheduleAutoFillHandler,
  createLiveStatusHandler,
} from "../features/chzzk";
import {
  createHandleDDays,
  D1DDayRepository,
} from "../features/ddays";
import {
  createD1MemberPostsApplication,
  createMemberPostsHandler,
} from "../features/member-posts";
import {
  createHandleMembers,
  D1MemberReader,
} from "../features/members";
import {
  CloudflarePublicCatalogCache,
  createPublicCatalogEtag,
  createPublicCatalogHandler,
  D1PublicCatalogReader,
  PublicCatalogService,
} from "../features/otw-play";
import {
  collectNaverCafePostsForSources,
  createD1NaverCafeApplication,
  createNaverCafeHandler,
  readStoredNaverCafePostsForSources,
} from "../features/naver-cafe";
import {
  createHandleNotices,
  D1NoticeGateway,
  NoticeUseCases,
} from "../features/notices";
import {
  createD1OperationsApplication,
  createOperationsHandler,
} from "../features/operations";
import {
  createManualAutoUpdateHandler,
  createPendingScheduleCommandHandler,
  createPendingScheduleQueryHandler,
  createScheduleRequestHandler,
  createUpdateLogHandler,
  createLiveScheduleAutoFillService,
  D1ManualAutoUpdateAdapter,
  D1PendingBulkAudit,
  D1PendingScheduleQuery,
  D1PendingScheduleRepository,
  D1ScheduleQueryRepository,
  D1ScheduleWriteRepository,
  DrizzleUpdateLogRepository,
  ManualAutoUpdateService,
  PendingScheduleQueryService,
  PendingScheduleService,
  PublicScheduleWritePolicy,
  ScheduleService,
  UpdateLogService,
} from "../features/schedules";
import {
  buildXPostsApplication,
  createManualXCollectionHandler,
  createXPostsHandler,
  xPostFeedService,
} from "../features/x-posts";
import {
  buildYouTubeApplication,
  createKirinukiHandler,
  createYouTubeHandler,
} from "../features/youtube";
import {
  createHandleScheduleBoard,
  D1ScheduleBoardReader,
} from "../features/schedule-board";
import {
  createAdminSettingsHandler,
  DrizzleSettingsAudit,
  DrizzleSettingsRepository,
  SettingsService,
} from "../features/configuration";
import { getDb } from "../platform/db";
import { insertAdminAuditLog } from "../platform/http-helpers";
import {
  createRouteRegistry,
  type WorkerRouteDefinition,
  type WorkerRouteMethodContract,
} from "./route-registry";

const PUBLIC_NO_STORE = {
  auth: "public",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_NO_STORE = {
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const PUBLIC_MEDIA_CACHE =
  "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

const handleScheduleRequest = createScheduleRequestHandler(
  (env) =>
    new ScheduleService(
      new D1ScheduleQueryRepository(env.otw_db),
      new D1ScheduleWriteRepository(env.otw_db),
      new PublicScheduleWritePolicy(),
    ),
);
const handlePendingScheduleCommand = createPendingScheduleCommandHandler(
  (env) =>
    new PendingScheduleService(
      new D1PendingScheduleRepository(env.otw_db),
      new D1PendingBulkAudit(env.otw_db),
    ),
);
const handlePendingScheduleQuery = createPendingScheduleQueryHandler(
  (env) =>
    new PendingScheduleQueryService(
      new D1PendingScheduleQuery(env.otw_db),
    ),
);
const handleManualAutoUpdate = createManualAutoUpdateHandler(
  (env) =>
    new ManualAutoUpdateService(
      new D1ManualAutoUpdateAdapter(getDb(env), env.otw_db),
    ),
);
const handleUpdateLogs = createUpdateLogHandler(
  (env) =>
    new UpdateLogService(new DrizzleUpdateLogRepository(getDb(env))),
);
const handleAdminSettings = createAdminSettingsHandler(
  (env) =>
    new SettingsService(
      new DrizzleSettingsRepository(getDb(env)),
      new DrizzleSettingsAudit(getDb(env)),
    ),
);
const handleR2Asset = createHandleR2Asset((env) =>
  env.ASSET_BUCKET ? new R2AssetReader(env.ASSET_BUCKET) : null,
);
const handleAdminAuditLogs = createHandleAdminAuditLogs(
  (env) => new D1AdminAuditLogReader(getDb(env)),
);
const handleDDays = createHandleDDays(
  (env) => new D1DDayRepository(getDb(env)),
);
const handleMembers = createHandleMembers(
  (env) => new D1MemberReader(getDb(env), env.ASSET_BUCKET),
);
const publicCatalogCache = new CloudflarePublicCatalogCache();
const handleOtwPlayPublicCatalog = createPublicCatalogHandler(
  (env) =>
    new PublicCatalogService(
      new D1PublicCatalogReader(env.otw_db),
      publicCatalogCache,
    ),
  createPublicCatalogEtag,
);
const handleNotices = createHandleNotices(
  (env) =>
    new NoticeUseCases(
      new D1NoticeGateway(getDb(env), env.ASSET_BUCKET),
    ),
);
const handleScheduleBoard = createHandleScheduleBoard(
  (env) => new D1ScheduleBoardReader(getDb(env)),
);
const handleNaverCafe = createNaverCafeHandler({
  getApplication: createD1NaverCafeApplication,
});
const handleOperations = createOperationsHandler({
  getApplication: (env) =>
    createD1OperationsApplication(
      env,
      collectNaverCafePostsForSources,
    ),
});
const handleXPosts = createXPostsHandler(buildXPostsApplication);
const handleManualXCollection = createManualXCollectionHandler(
  buildXPostsApplication,
);
const handleMemberPosts = createMemberPostsHandler({
  getMemberPosts: (env) =>
    createD1MemberPostsApplication(
      env,
      xPostFeedService,
      readStoredNaverCafePostsForSources,
    ),
});
const buildChzzkRouteApplication = (env: Parameters<
  typeof buildChzzkApplication
>[0]) => {
  const database = getDb(env);
  const liveScheduleAutoFill =
    createLiveScheduleAutoFillService(database);
  return buildChzzkApplication(env, {
    autoFillLiveSchedules: (items) =>
      liveScheduleAutoFill.run(items),
    writeAutoFillAudit: (input) =>
      insertAdminAuditLog(database, {
        eventType: "live_schedule.auto_fill",
        resourceType: "schedule",
        action: "auto_fill",
        status: "success",
        actorId: input.actorId,
        actorName: input.actorName,
        actorIp: input.actorIp,
        targetCount: input.channelIds.length,
        successCount: input.updated,
        failureCount: 0,
        detail: { channelIds: input.channelIds },
      }),
  });
};
const handleLiveStatus = createLiveStatusHandler(
  buildChzzkRouteApplication,
);
const handleLiveScheduleAutoFill =
  createLiveScheduleAutoFillHandler(buildChzzkRouteApplication);
const handleVods = createChzzkMediaHandler(buildChzzkRouteApplication);
const handleYouTube = createYouTubeHandler(buildYouTubeApplication);
const handleKirinuki = createKirinukiHandler(buildYouTubeApplication);

const methods = (
  ...contracts: WorkerRouteMethodContract[]
): readonly WorkerRouteMethodContract[] => contracts;

const get = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "GET", ...contract });
const post = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "POST", ...contract });
const put = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "PUT", ...contract });
const del = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "DELETE", ...contract });
const head = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "HEAD", ...contract });

const routeDefinitions: readonly WorkerRouteDefinition[] = [
  {
    id: "assets.get",
    owner: "assets",
    path: apiRoutes.assets.object.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=31536000, immutable",
        successStatus: 200,
      }),
      head({
        auth: "public",
        cache: "public, max-age=31536000, immutable",
        successStatus: 200,
      }),
    ),
    handler: handleR2Asset,
  },
  {
    id: "chzzk.live-status",
    owner: "chzzk",
    path: apiRoutes.chzzk.liveStatus.pattern,
    methods: methods(get(PUBLIC_NO_STORE)),
    handler: handleLiveStatus,
  },
  {
    id: "chzzk.vods",
    owner: "chzzk",
    path: apiRoutes.chzzk.vods.pattern,
    methods: methods(
      get({ auth: "public", cache: PUBLIC_MEDIA_CACHE, successStatus: 200 }),
    ),
    handler: handleVods,
  },
  {
    id: "chzzk.clips",
    owner: "chzzk",
    path: apiRoutes.chzzk.clips.pattern,
    methods: methods(
      get({ auth: "public", cache: PUBLIC_MEDIA_CACHE, successStatus: 200 }),
    ),
    handler: handleVods,
  },
  {
    id: "youtube.videos",
    owner: "youtube",
    path: apiRoutes.youtube.videos.pattern,
    methods: methods(
      get({ auth: "public", cache: PUBLIC_MEDIA_CACHE, successStatus: 200 }),
    ),
    handler: handleYouTube,
  },
  {
    id: "youtube.cache-status",
    owner: "youtube",
    path: apiRoutes.youtube.cacheStatus.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleYouTube,
  },
  {
    id: "youtube.cache-warmup",
    owner: "youtube",
    path: apiRoutes.youtube.cacheWarmup.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleYouTube,
  },
  {
    id: "youtube.kirinuki-channels",
    owner: "youtube",
    path: apiRoutes.youtube.kirinukiChannels.pattern,
    methods: methods(
      get(ADMIN_NO_STORE),
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
      del(ADMIN_NO_STORE),
    ),
    handler: handleKirinuki,
  },
  {
    id: "youtube.kirinuki-videos",
    owner: "youtube",
    path: apiRoutes.youtube.kirinukiVideos.pattern,
    methods: methods(
      get({ auth: "public", cache: PUBLIC_MEDIA_CACHE, successStatus: 200 }),
    ),
    handler: handleKirinuki,
  },
  {
    id: "members.list",
    owner: "members",
    path: apiRoutes.members.collection.pattern,
    methods: methods(
      get({
        auth: "public",
        cache:
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        successStatus: 200,
      }),
    ),
    handler: handleMembers,
  },
  {
    id: "members.profile",
    owner: "members",
    path: apiRoutes.members.profile.pattern,
    methods: methods(get(PUBLIC_NO_STORE)),
    handler: handleMembers,
  },
  {
    id: "otw-play.config",
    owner: "otw-play",
    path: apiRoutes.otwPlay.config.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60, s-maxage=1800; auth/cookie => no-store",
        successStatus: 200,
      }),
    ),
    handler: handleOtwPlayPublicCatalog,
  },
  {
    id: "otw-play.catalog",
    owner: "otw-play",
    path: apiRoutes.otwPlay.catalog.pattern,
    methods: methods(
      get({
        auth: "public",
        cache:
          "public, max-age=60, s-maxage=300; q => private, max-age=30; cursor => private, max-age=60; auth/cookie => no-store",
        successStatus: 200,
      }),
    ),
    handler: handleOtwPlayPublicCatalog,
  },
  {
    id: "otw-play.facets",
    owner: "otw-play",
    path: apiRoutes.otwPlay.facets.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60, s-maxage=1800; auth/cookie => no-store",
        successStatus: 200,
      }),
    ),
    handler: handleOtwPlayPublicCatalog,
  },
  {
    id: "otw-play.song",
    owner: "otw-play",
    path: apiRoutes.otwPlay.song.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60, s-maxage=600; auth/cookie => no-store",
        successStatus: 200,
      }),
    ),
    handler: handleOtwPlayPublicCatalog,
  },
  {
    id: "otw-play.performance",
    owner: "otw-play",
    path: apiRoutes.otwPlay.performance.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60, s-maxage=600; auth/cookie => no-store",
        successStatus: 200,
      }),
    ),
    handler: handleOtwPlayPublicCatalog,
  },
  {
    id: "schedule-board.read",
    owner: "schedule-board",
    path: apiRoutes.scheduleBoard.read.pattern,
    methods: methods(get(PUBLIC_NO_STORE)),
    handler: handleScheduleBoard,
  },
  {
    id: "schedules.collection",
    owner: "schedules",
    path: apiRoutes.schedules.collection.pattern,
    methods: methods(
      get(PUBLIC_NO_STORE),
      post({
        auth: "public-write",
        cache: "no-store",
        successStatus: 201,
      }),
      put({
        auth: "public-write",
        cache: "no-store",
        successStatus: 200,
      }),
      del({
        auth: "public-write",
        cache: "no-store",
        successStatus: 200,
      }),
    ),
    handler: handleScheduleRequest,
  },
  {
    id: "schedules.save",
    owner: "schedules",
    path: apiRoutes.schedules.save.pattern,
    methods: methods(
      post({
        auth: "public-write",
        cache: "no-store",
        successStatus: 200,
      }),
    ),
    handler: handleScheduleRequest,
  },
  {
    id: "notices.collection",
    owner: "notices",
    path: apiRoutes.notices.collection.pattern,
    methods: methods(
      get(PUBLIC_NO_STORE),
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
      del(ADMIN_NO_STORE),
    ),
    handler: handleNotices,
  },
  {
    id: "notices.featured",
    owner: "notices",
    path: apiRoutes.notices.featured.pattern,
    methods: methods(put(ADMIN_NO_STORE)),
    handler: handleNotices,
  },
  {
    id: "notices.thumbnail",
    owner: "notices",
    path: apiRoutes.notices.thumbnail.pattern,
    methods: methods(
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      del(ADMIN_NO_STORE),
    ),
    handler: handleNotices,
  },
  {
    id: "notices.thumbnail-status",
    owner: "notices",
    path: apiRoutes.notices.thumbnailStatus.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleNotices,
  },
  {
    id: "notices.thumbnail-cleanup",
    owner: "notices",
    path: apiRoutes.notices.thumbnailCleanup.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleNotices,
  },
  {
    id: "ddays.collection",
    owner: "ddays",
    path: apiRoutes.ddays.collection.pattern,
    methods: methods(
      get({
        auth: "public",
        cache:
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600; noCache=1 => no-store",
        successStatus: 200,
      }),
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
      del(ADMIN_NO_STORE),
    ),
    handler: handleDDays,
  },
  {
    id: "member-posts.read",
    owner: "member-posts",
    path: apiRoutes.memberPosts.read.pattern,
    methods: methods(
      get({
        auth: "member-policy",
        cache: "visibility-dependent",
        successStatus: 200,
      }),
    ),
    handler: handleMemberPosts,
  },
  {
    id: "x-posts.config",
    owner: "x-posts",
    path: apiRoutes.xPosts.config.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60",
        successStatus: 200,
      }),
    ),
    handler: handleXPosts,
  },
  {
    id: "x-posts.read",
    owner: "x-posts",
    path: apiRoutes.xPosts.read.pattern,
    methods: methods(
      get({
        auth: "member-policy",
        cache: "visibility-dependent",
        successStatus: 200,
      }),
    ),
    handler: handleXPosts,
  },
  {
    id: "x-posts.context",
    owner: "x-posts",
    path: apiRoutes.xPosts.context.pattern,
    methods: methods(
      get({
        auth: "member-policy",
        cache: "visibility-dependent",
        successStatus: 200,
      }),
    ),
    handler: handleXPosts,
  },
  {
    id: "naver-cafe.config",
    owner: "naver-cafe",
    path: apiRoutes.naverCafe.config.pattern,
    methods: methods(
      get({
        auth: "public",
        cache: "public, max-age=60",
        successStatus: 200,
      }),
    ),
    handler: handleNaverCafe,
  },
  {
    id: "naver-cafe.sources",
    owner: "naver-cafe",
    path: apiRoutes.naverCafe.sources.pattern,
    methods: methods(
      get(ADMIN_NO_STORE),
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
      del(ADMIN_NO_STORE),
    ),
    handler: handleNaverCafe,
  },
  {
    id: "naver-cafe.posts",
    owner: "naver-cafe",
    path: apiRoutes.naverCafe.posts.pattern,
    methods: methods(
      get({
        auth: "member-policy",
        cache: "visibility-dependent",
        successStatus: 200,
      }),
    ),
    handler: handleNaverCafe,
  },
  {
    id: "operations.status",
    owner: "operations",
    path: apiRoutes.operations.status.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOperations,
  },
  {
    id: "operations.naver-cafe-check",
    owner: "naver-cafe",
    path: apiRoutes.naverCafe.checkNow.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOperations,
  },
  {
    id: "operations.retention-status",
    owner: "operations",
    path: apiRoutes.operations.retentionStatus.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOperations,
  },
  {
    id: "operations.retention-prune",
    owner: "operations",
    path: apiRoutes.operations.retentionPrune.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOperations,
  },
  {
    id: "operations.live-schedule-auto-fill",
    owner: "operations",
    path: apiRoutes.operations.liveScheduleAutoFill.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleLiveScheduleAutoFill,
  },
  {
    id: "settings.root",
    owner: "configuration",
    path: apiRoutes.configuration.settings.pattern,
    methods: methods(get(ADMIN_NO_STORE), put(ADMIN_NO_STORE)),
    handler: handleAdminSettings,
  },
  {
    id: "settings.audit-logs",
    owner: "audit",
    path: apiRoutes.audit.adminLogs.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleAdminAuditLogs,
  },
  {
    id: "settings.logs",
    owner: "schedules",
    path: apiRoutes.schedules.updateLogs.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleUpdateLogs,
  },
  {
    id: "settings.log-delete",
    owner: "schedules",
    path: apiRoutes.schedules.updateLog.pattern,
    numericParams: ["id"],
    methods: methods(del(ADMIN_NO_STORE)),
    handler: handleUpdateLogs,
  },
  {
    id: "settings.run-now",
    owner: "schedules",
    path: apiRoutes.schedules.runNow.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleManualAutoUpdate,
  },
  {
    id: "settings.x-collection-run",
    owner: "x-posts",
    path: apiRoutes.xPosts.runCollectionNow.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleManualXCollection,
  },
  {
    id: "settings.pending-list",
    owner: "schedules",
    path: apiRoutes.schedules.pending.list.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handlePendingScheduleQuery,
  },
  {
    id: "settings.pending-rejections",
    owner: "schedules",
    path: apiRoutes.schedules.pending.rejections.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handlePendingScheduleQuery,
  },
  {
    id: "settings.pending-rejection-reopen",
    owner: "schedules",
    path: apiRoutes.schedules.pending.reopenRejection.pattern,
    numericParams: ["id"],
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handlePendingScheduleCommand,
  },
  ...[
    {
      action: "reset-processed",
      path: apiRoutes.schedules.pending.resetProcessed.pattern,
    },
    {
      action: "apply-empty-target",
      path: apiRoutes.schedules.pending.applyEmptyTarget.pattern,
    },
    {
      action: "approve",
      path: apiRoutes.schedules.pending.approve.pattern,
    },
    {
      action: "reject",
      path: apiRoutes.schedules.pending.reject.pattern,
    },
  ].map(
    ({ action, path }): WorkerRouteDefinition => ({
      id: `settings.pending-${action}`,
      owner: "schedules",
      path,
      numericParams: ["id"],
      methods: methods(post(ADMIN_NO_STORE)),
      handler: handlePendingScheduleCommand,
    }),
  ),
  ...[
    {
      action: "actions",
      path: apiRoutes.schedules.pending.actions.pattern,
    },
    {
      action: "approve-selected",
      path: apiRoutes.schedules.pending.approveSelected.pattern,
    },
    {
      action: "reject-selected",
      path: apiRoutes.schedules.pending.rejectSelected.pattern,
    },
    {
      action: "approve-all",
      path: apiRoutes.schedules.pending.approveAll.pattern,
    },
    {
      action: "reject-all",
      path: apiRoutes.schedules.pending.rejectAll.pattern,
    },
  ].map(
    ({ action, path }): WorkerRouteDefinition => ({
      id: `settings.pending-${action}`,
      owner: "schedules",
      path,
      methods: methods(post(ADMIN_NO_STORE)),
      handler: handlePendingScheduleCommand,
    }),
  ),
];

export const workerRouteRegistry = createRouteRegistry(routeDefinitions);
export const workerRouteManifest = workerRouteRegistry.manifest;
