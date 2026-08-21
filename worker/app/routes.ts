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
  CloudflarePlayObservabilityReader,
  CloudflarePlayTelemetryWriter,
  createAdminCatalogHandler,
  createPublicCatalogEtag,
  createPublicCatalogHandler,
  createPlayObservabilityHandler,
  D1SourceHealthRepository,
  D1PublicCatalogReader,
  D1ReleaseRepository,
  PublicCatalogService,
  ReleaseService,
  SourceHealthService,
  YouTubeOtwPlayMetadataReader,
  withPlayOperationsTelemetry,
  MemberSubmissionService,
  D1MemberSubmissionRepository,
  createMemberSubmissionHandler,
  createIngestionHandler,
  createReleaseHandler,
} from "../features/otw-play";
import { createOtwPlayIngestionService } from "./ingestion";
import { createOtwPlayAdminCatalogService } from "./admin-catalog";
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
const resolvePlayTelemetry = (env: Parameters<typeof getDb>[0]) =>
  new CloudflarePlayTelemetryWriter(env.OTW_PLAY_ANALYTICS);
const handleOtwPlayPublicCatalog = createPublicCatalogHandler(
  (env) => {
    const reader = new D1PublicCatalogReader(env.otw_db);
    return {
      service: new PublicCatalogService(reader, publicCatalogCache),
      beginReadObservation: () => reader.beginReadObservation(),
      readDiagnostics: () => reader.getReadObservation(),
    };
  },
  createPublicCatalogEtag,
  resolvePlayTelemetry,
);
const handleOtwPlayObservability = withPlayOperationsTelemetry(
  createPlayObservabilityHandler(
    (env) =>
      new CloudflarePlayObservabilityReader(
        env.CLOUDFLARE_ACCOUNT_ID,
        env.OTW_PLAY_ANALYTICS_READ_TOKEN,
      ),
  ),
  resolvePlayTelemetry,
);
const handleOtwPlayRelease = createReleaseHandler(
  (env) => new ReleaseService(new D1ReleaseRepository(env.otw_db)),
  resolvePlayTelemetry,
);
const handleOtwPlayAdminCatalogCore = createAdminCatalogHandler(
  createOtwPlayAdminCatalogService,
  (env) =>
    new SourceHealthService(
      new D1SourceHealthRepository(env.otw_db),
      new YouTubeOtwPlayMetadataReader(env.YOUTUBE_API_KEY),
    ),
);
const handleOtwPlayAdminCatalog = withPlayOperationsTelemetry(
  handleOtwPlayAdminCatalogCore,
  resolvePlayTelemetry,
);
const handleOtwPlayMemberSubmissionsCore = createMemberSubmissionHandler(
  (env) =>
    new MemberSubmissionService(
      new D1MemberSubmissionRepository(env.otw_db),
      () => crypto.randomUUID(),
    ),
);
const handleOtwPlayMemberSubmissions = withPlayOperationsTelemetry(
  handleOtwPlayMemberSubmissionsCore,
  resolvePlayTelemetry,
);
const handleOtwPlayIngestion = withPlayOperationsTelemetry(
  createIngestionHandler(createOtwPlayIngestionService),
  resolvePlayTelemetry,
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
const patch = (
  contract: Omit<WorkerRouteMethodContract, "method">,
): WorkerRouteMethodContract => ({ method: "PATCH", ...contract });
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
    id: "otw-play.submission.preflight",
    owner: "otw-play",
    path: apiRoutes.otwPlay.submissions.preflight.pattern,
    methods: methods(
      post({ auth: "member-policy", cache: "no-store", successStatus: 200 }),
    ),
    handler: handleOtwPlayMemberSubmissions,
  },
  {
    id: "otw-play.submission.create",
    owner: "otw-play",
    path: apiRoutes.otwPlay.submissions.create.pattern,
    methods: methods(
      post({ auth: "member-policy", cache: "no-store", successStatus: 201 }),
    ),
    handler: handleOtwPlayMemberSubmissions,
  },
  {
    id: "otw-play.submission.mine",
    owner: "otw-play",
    path: apiRoutes.otwPlay.submissions.mine.pattern,
    methods: methods(
      get({ auth: "member-policy", cache: "no-store", successStatus: 200 }),
    ),
    handler: handleOtwPlayMemberSubmissions,
  },
  {
    id: "otw-play.submission.detail",
    owner: "otw-play",
    path: apiRoutes.otwPlay.submissions.detail.pattern,
    methods: methods(
      get({ auth: "member-policy", cache: "no-store", successStatus: 200 }),
    ),
    handler: handleOtwPlayMemberSubmissions,
  },
  {
    id: "otw-play.admin.playlist-import.preflight",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.playlistImportPreflight.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.playlist-import.create",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.playlistImports.pattern,
    methods: methods(post({ ...ADMIN_NO_STORE, successStatus: 202 })),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.import-job.read",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.importJob.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.import-job.items",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.importJobItems.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.import-candidate.update",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.importCandidate.pattern,
    methods: methods(patch(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.import-job.convert",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.convertImportJob.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.import-job.retry",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.retryImportJob.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayIngestion,
  },
  {
    id: "otw-play.admin.catalog",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.catalog.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.catalog-entry.preflight",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.catalogEntryPreflight.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.catalog-entry.create",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.catalogEntries.pattern,
    methods: methods(post({ ...ADMIN_NO_STORE, successStatus: 201 })),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.entities",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.entities.pattern,
    methods: methods(
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
    ),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.songs",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.songs.pattern,
    methods: methods(
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
    ),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.song.delete",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.deleteSong.pattern,
    methods: methods(del(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.performances",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.performances.pattern,
    methods: methods(
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
    ),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.performance.delete",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.deletePerformance.pattern,
    methods: methods(del(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.performance.publish",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.publishPerformance.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.performance.withdraw",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.withdrawPerformance.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.submissions",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.submissions.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.submission.approve",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.approveSubmission.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.submission.reject",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.rejectSubmission.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.channels",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.channels.pattern,
    methods: methods(
      post({ ...ADMIN_NO_STORE, successStatus: 201 }),
      put(ADMIN_NO_STORE),
      del(ADMIN_NO_STORE),
    ),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.source-health",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.sourceHealth.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
  },
  {
    id: "otw-play.admin.observability",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.observability.pattern,
    methods: methods(get(ADMIN_NO_STORE)),
    handler: handleOtwPlayObservability,
  },
  {
    id: "otw-play.admin.release",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.release.pattern,
    methods: methods(get(ADMIN_NO_STORE), patch(ADMIN_NO_STORE)),
    handler: handleOtwPlayRelease,
  },
  {
    id: "otw-play.admin.source.recheck",
    owner: "otw-play",
    path: apiRoutes.otwPlay.admin.recheckSource.pattern,
    methods: methods(post(ADMIN_NO_STORE)),
    handler: handleOtwPlayAdminCatalog,
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
