import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import type { WorkerRouteManifestEntry } from "./route-registry";
import { workerRouteManifest, workerRouteRegistry } from "./routes";

const env = {} as Env;
const ADMIN_GET = {
  method: "GET",
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_POST = {
  method: "POST",
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_POST_ACCEPTED = {
  method: "POST",
  auth: "admin",
  cache: "no-store",
  successStatus: 202,
} as const;
const ADMIN_PUT = {
  method: "PUT",
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_PATCH = {
  method: "PATCH",
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_DELETE = {
  method: "DELETE",
  auth: "admin",
  cache: "no-store",
  successStatus: 200,
} as const;
const PUBLIC_GET = {
  method: "GET",
  auth: "public",
  cache: "no-store",
  successStatus: 200,
} as const;
const LIVE_STATUS_GET = {
  method: "GET",
  auth: "public",
  cache: "public, max-age=0, s-maxage=45, stale-while-revalidate=120",
  successStatus: 200,
} as const;
const PUBLIC_MEDIA_GET = {
  method: "GET",
  auth: "public",
  cache:
    "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  successStatus: 200,
} as const;
const PUBLIC_SHORT_CACHE_GET = {
  method: "GET",
  auth: "public",
  cache: "public, max-age=60",
  successStatus: 200,
} as const;
const OTW_PLAY_CONFIG_GET = {
  method: "GET",
  auth: "public",
  cache: "public, max-age=60, s-maxage=1800; auth/cookie => no-store",
  successStatus: 200,
} as const;
const OTW_PLAY_CATALOG_GET = {
  method: "GET",
  auth: "public",
  cache:
    "public, max-age=60, s-maxage=300; q => private, max-age=30; cursor => private, max-age=60; auth/cookie => no-store",
  successStatus: 200,
} as const;
const OTW_PLAY_DETAIL_GET = {
  method: "GET",
  auth: "public",
  cache: "public, max-age=60, s-maxage=600; auth/cookie => no-store",
  successStatus: 200,
} as const;
const MEMBER_POLICY_GET = {
  method: "GET",
  auth: "member-policy",
  cache: "visibility-dependent",
  successStatus: 200,
} as const;
const MEMBER_POLICY_NO_STORE_GET = {
  method: "GET",
  auth: "member-policy",
  cache: "no-store",
  successStatus: 200,
} as const;
const MEMBER_POLICY_NO_STORE_POST = {
  method: "POST",
  auth: "member-policy",
  cache: "no-store",
  successStatus: 200,
} as const;
const MEMBER_POLICY_NO_STORE_PATCH = {
  ...MEMBER_POLICY_NO_STORE_POST,
  method: "PATCH",
} as const;
const MEMBER_POLICY_NO_STORE_POST_CREATED = {
  ...MEMBER_POLICY_NO_STORE_POST,
  successStatus: 201,
} as const;
const PUBLIC_WRITE_POST = {
  method: "POST",
  auth: "public-write",
  cache: "no-store",
  successStatus: 200,
} as const;
const PUBLIC_WRITE_POST_NO_CONTENT = {
  ...PUBLIC_WRITE_POST,
  successStatus: 204,
} as const;
const PUBLIC_WRITE_POST_CREATED = {
  ...PUBLIC_WRITE_POST,
  successStatus: 201,
} as const;
const PUBLIC_WRITE_PUT = {
  method: "PUT",
  auth: "public-write",
  cache: "no-store",
  successStatus: 200,
} as const;
const PUBLIC_WRITE_DELETE = {
  method: "DELETE",
  auth: "public-write",
  cache: "no-store",
  successStatus: 200,
} as const;
const ADMIN_POST_CREATED = {
  ...ADMIN_POST,
  successStatus: 201,
} as const;

const expectedRouteManifest: readonly WorkerRouteManifestEntry[] = [
  {
    id: "assets.get",
    owner: "assets",
    path: "/r2-assets/*key",
    methods: [
      {
        method: "GET",
        auth: "public",
        cache: "public, max-age=31536000, immutable",
        successStatus: 200,
      },
      {
        method: "HEAD",
        auth: "public",
        cache: "public, max-age=31536000, immutable",
        successStatus: 200,
      },
    ],
  },
  {
    id: "chzzk.live-status",
    owner: "chzzk",
    path: "/api/live-status",
    methods: [LIVE_STATUS_GET],
  },
  {
    id: "chzzk.vods",
    owner: "chzzk",
    path: "/api/vods/chzzk",
    methods: [PUBLIC_MEDIA_GET],
  },
  {
    id: "chzzk.clips",
    owner: "chzzk",
    path: "/api/clips/chzzk",
    methods: [PUBLIC_MEDIA_GET],
  },
  {
    id: "youtube.videos",
    owner: "youtube",
    path: "/api/youtube/videos",
    methods: [PUBLIC_MEDIA_GET],
  },
  {
    id: "youtube.cache-status",
    owner: "youtube",
    path: "/api/youtube/cache/status",
    methods: [ADMIN_GET],
  },
  {
    id: "youtube.cache-refresh",
    owner: "youtube",
    path: "/api/youtube/cache/refresh",
    methods: [ADMIN_POST],
  },
  {
    id: "youtube.cache-warmup",
    owner: "youtube",
    path: "/api/youtube/cache/warmup/run",
    methods: [ADMIN_POST],
  },
  {
    id: "youtube.kirinuki-channels",
    owner: "youtube",
    path: "/api/kirinuki/channels",
    methods: [
      ADMIN_GET,
      ADMIN_POST_CREATED,
      ADMIN_PUT,
      ADMIN_DELETE,
    ],
  },
  {
    id: "youtube.kirinuki-videos",
    owner: "youtube",
    path: "/api/kirinuki/videos",
    methods: [PUBLIC_MEDIA_GET],
  },
  {
    id: "members.list",
    owner: "members",
    path: "/api/members",
    methods: [PUBLIC_MEDIA_GET],
  },
  {
    id: "members.profile",
    owner: "members",
    path: "/api/members/:code",
    methods: [PUBLIC_GET],
  },
  {
    id: "otw-play.config",
    owner: "otw-play",
    path: "/api/play/config",
    methods: [OTW_PLAY_CONFIG_GET],
  },
  {
    id: "otw-play.catalog",
    owner: "otw-play",
    path: "/api/play/catalog",
    methods: [OTW_PLAY_CATALOG_GET],
  },
  {
    id: "otw-play.facets",
    owner: "otw-play",
    path: "/api/play/facets",
    methods: [OTW_PLAY_CONFIG_GET],
  },
  {
    id: "otw-play.song",
    owner: "otw-play",
    path: "/api/play/songs/:slug",
    methods: [OTW_PLAY_DETAIL_GET],
  },
  {
    id: "otw-play.performance",
    owner: "otw-play",
    path: "/api/play/performances/:id",
    methods: [OTW_PLAY_DETAIL_GET],
  },
  {
    id: "otw-play.youtube-webhook",
    owner: "otw-play",
    path: "/api/play/webhooks/youtube/:token",
    methods: [PUBLIC_GET, PUBLIC_WRITE_POST_NO_CONTENT],
  },
  {
    id: "otw-play.submission.preflight",
    owner: "otw-play",
    path: "/api/play/submissions/preflight",
    methods: [MEMBER_POLICY_NO_STORE_POST],
  },
  {
    id: "otw-play.submission.create",
    owner: "otw-play",
    path: "/api/play/submissions",
    methods: [MEMBER_POLICY_NO_STORE_POST_CREATED],
  },
  {
    id: "otw-play.submission.mine",
    owner: "otw-play",
    path: "/api/play/submissions/mine",
    methods: [MEMBER_POLICY_NO_STORE_GET],
  },
  {
    id: "otw-play.submission.detail",
    owner: "otw-play",
    path: "/api/play/submissions/:id",
    methods: [MEMBER_POLICY_NO_STORE_GET, MEMBER_POLICY_NO_STORE_PATCH],
  },
  {
    id: "otw-play.submission.withdraw",
    owner: "otw-play",
    path: "/api/play/submissions/:id/withdraw",
    methods: [MEMBER_POLICY_NO_STORE_POST],
  },
  {
    id: "otw-play.admin.import-jobs.list",
    owner: "otw-play",
    path: "/api/play/admin/imports",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.playlist-import.preflight",
    owner: "otw-play",
    path: "/api/play/admin/imports/playlist/preflight",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.playlist-import.create",
    owner: "otw-play",
    path: "/api/play/admin/imports/playlist",
    methods: [{ ...ADMIN_POST, successStatus: 202 }],
  },
  {
    id: "otw-play.admin.import-job.read",
    owner: "otw-play",
    path: "/api/play/admin/imports/:jobId",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.import-job.items",
    owner: "otw-play",
    path: "/api/play/admin/imports/:jobId/items",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.import-candidate.update",
    owner: "otw-play",
    path: "/api/play/admin/import-candidates/:id",
    methods: [ADMIN_PATCH],
  },
  {
    id: "otw-play.admin.import-candidate.convert",
    owner: "otw-play",
    path: "/api/play/admin/import-candidates/:id/convert",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.import-job.convert",
    owner: "otw-play",
    path: "/api/play/admin/imports/:jobId/convert",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.import-job.ignore",
    owner: "otw-play",
    path: "/api/play/admin/imports/:jobId/ignore",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.import-job.retry",
    owner: "otw-play",
    path: "/api/play/admin/imports/:jobId/retry",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.collection",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors",
    methods: [ADMIN_GET, ADMIN_POST_CREATED],
  },
  {
    id: "otw-play.admin.channel-monitors.item",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id",
    methods: [ADMIN_PATCH, ADMIN_DELETE],
  },
  {
    id: "otw-play.admin.channel-monitors.candidates",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/candidates",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.channel-monitors.reconcile",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/reconcile",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.revoke-approval",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/revoke-approval",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.subscribe",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/subscribe",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.renew",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/renew",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.unsubscribe",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/unsubscribe",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel-monitors.backfill",
    owner: "otw-play",
    path: "/api/play/admin/channel-monitors/:id/backfill",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.catalog",
    owner: "otw-play",
    path: "/api/play/admin/catalog",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.catalog-entry.preflight",
    owner: "otw-play",
    path: "/api/play/admin/catalog-entries/preflight",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.catalog-entry.create",
    owner: "otw-play",
    path: "/api/play/admin/catalog-entries",
    methods: [ADMIN_POST_CREATED],
  },
  {
    id: "otw-play.admin.entities",
    owner: "otw-play",
    path: "/api/play/admin/entities",
    methods: [ADMIN_POST_CREATED, ADMIN_PUT],
  },
  {
    id: "otw-play.admin.entity.delete",
    owner: "otw-play",
    path: "/api/play/admin/entities/:id",
    methods: [ADMIN_DELETE],
  },
  {
    id: "otw-play.admin.songs",
    owner: "otw-play",
    path: "/api/play/admin/songs",
    methods: [ADMIN_POST_CREATED, ADMIN_PUT],
  },
  {
    id: "otw-play.admin.song.delete",
    owner: "otw-play",
    path: "/api/play/admin/songs/:id",
    methods: [ADMIN_DELETE],
  },
  {
    id: "otw-play.admin.performances",
    owner: "otw-play",
    path: "/api/play/admin/performances",
    methods: [ADMIN_POST_CREATED, ADMIN_PUT],
  },
  {
    id: "otw-play.admin.performance.delete",
    owner: "otw-play",
    path: "/api/play/admin/performances/:id",
    methods: [ADMIN_DELETE],
  },
  {
    id: "otw-play.admin.performance.publish",
    owner: "otw-play",
    path: "/api/play/admin/performances/:id/publish",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.performance.withdraw",
    owner: "otw-play",
    path: "/api/play/admin/performances/:id/withdraw",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.submissions",
    owner: "otw-play",
    path: "/api/play/admin/submissions",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.submission.approve",
    owner: "otw-play",
    path: "/api/play/admin/submissions/:id/approve",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.submission.reject",
    owner: "otw-play",
    path: "/api/play/admin/submissions/:id/reject",
    methods: [ADMIN_POST],
  },
  {
    id: "otw-play.admin.channel.lookup",
    owner: "otw-play",
    path: "/api/play/admin/channels/lookup",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.channels",
    owner: "otw-play",
    path: "/api/play/admin/channels",
    methods: [ADMIN_POST_CREATED, ADMIN_PUT, ADMIN_DELETE],
  },
  {
    id: "otw-play.admin.source-health",
    owner: "otw-play",
    path: "/api/play/admin/source-health",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.observability",
    owner: "otw-play",
    path: "/api/play/admin/observability",
    methods: [ADMIN_GET],
  },
  {
    id: "otw-play.admin.release",
    owner: "otw-play",
    path: "/api/play/admin/release",
    methods: [ADMIN_GET, ADMIN_PATCH],
  },
  {
    id: "otw-play.admin.source.recheck",
    owner: "otw-play",
    path: "/api/play/admin/sources/:id/recheck",
    methods: [ADMIN_POST],
  },
  {
    id: "schedule-board.read",
    owner: "schedule-board",
    path: "/api/schedule-board",
    methods: [PUBLIC_GET],
  },
  {
    id: "schedules.collection",
    owner: "schedules",
    path: "/api/schedules",
    methods: [
      PUBLIC_GET,
      PUBLIC_WRITE_POST_CREATED,
      PUBLIC_WRITE_PUT,
      PUBLIC_WRITE_DELETE,
    ],
  },
  {
    id: "schedules.save",
    owner: "schedules",
    path: "/api/schedules/save",
    methods: [PUBLIC_WRITE_POST],
  },
  {
    id: "notices.collection",
    owner: "notices",
    path: "/api/notices",
    methods: [
      PUBLIC_GET,
      ADMIN_POST_CREATED,
      ADMIN_PUT,
      ADMIN_DELETE,
    ],
  },
  {
    id: "notices.featured",
    owner: "notices",
    path: "/api/notices/featured",
    methods: [ADMIN_PUT],
  },
  {
    id: "notices.thumbnail",
    owner: "notices",
    path: "/api/notices/thumbnail",
    methods: [ADMIN_POST_CREATED, ADMIN_DELETE],
  },
  {
    id: "notices.thumbnail-status",
    owner: "notices",
    path: "/api/notices/thumbnails/status",
    methods: [ADMIN_GET],
  },
  {
    id: "notices.thumbnail-cleanup",
    owner: "notices",
    path: "/api/notices/thumbnails/cleanup",
    methods: [ADMIN_POST],
  },
  {
    id: "ddays.collection",
    owner: "ddays",
    path: "/api/ddays",
    methods: [
      {
        method: "GET",
        auth: "public",
        cache:
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600; noCache=1 => no-store",
        successStatus: 200,
      },
      ADMIN_POST_CREATED,
      ADMIN_PUT,
      ADMIN_DELETE,
    ],
  },
  {
    id: "member-posts.read",
    owner: "member-posts",
    path: "/api/member-posts",
    methods: [MEMBER_POLICY_GET],
  },
  {
    id: "x-posts.config",
    owner: "x-posts",
    path: "/api/x/config",
    methods: [PUBLIC_SHORT_CACHE_GET],
  },
  {
    id: "x-posts.read",
    owner: "x-posts",
    path: "/api/x/posts",
    methods: [MEMBER_POLICY_GET],
  },
  {
    id: "x-posts.context",
    owner: "x-posts",
    path: "/api/x/posts/:id/context",
    methods: [MEMBER_POLICY_GET],
  },
  {
    id: "naver-cafe.config",
    owner: "naver-cafe",
    path: "/api/naver-cafe/config",
    methods: [PUBLIC_SHORT_CACHE_GET],
  },
  {
    id: "naver-cafe.sources",
    owner: "naver-cafe",
    path: "/api/naver-cafe/sources",
    methods: [
      ADMIN_GET,
      ADMIN_POST_CREATED,
      ADMIN_PUT,
      ADMIN_DELETE,
    ],
  },
  {
    id: "naver-cafe.posts",
    owner: "naver-cafe",
    path: "/api/naver-cafe/posts",
    methods: [MEMBER_POLICY_GET],
  },
  {
    id: "operations.status",
    owner: "operations",
    path: "/api/operations/status",
    methods: [ADMIN_GET],
  },
  {
    id: "operations.runs",
    owner: "operations",
    path: "/api/operations/runs",
    methods: [ADMIN_GET, ADMIN_POST_ACCEPTED],
  },
  {
    id: "operations.run",
    owner: "operations",
    path: "/api/operations/runs/:runId",
    methods: [ADMIN_GET],
  },
  {
    id: "operations.run-retry",
    owner: "operations",
    path: "/api/operations/runs/:runId/retry",
    methods: [ADMIN_POST_ACCEPTED],
  },
  {
    id: "operations.naver-cafe-check",
    owner: "naver-cafe",
    path: "/api/operations/naver-cafe/check-now",
    methods: [ADMIN_POST_ACCEPTED],
  },
  {
    id: "operations.retention-status",
    owner: "operations",
    path: "/api/operations/data-retention/status",
    methods: [ADMIN_GET],
  },
  {
    id: "operations.retention-prune",
    owner: "operations",
    path: "/api/operations/data-retention/prune",
    methods: [ADMIN_POST_ACCEPTED],
  },
  {
    id: "operations.live-schedule-auto-fill",
    owner: "operations",
    path: "/api/operations/live-schedule/auto-fill",
    methods: [ADMIN_POST],
  },
  {
    id: "settings.root",
    owner: "configuration",
    path: "/api/settings",
    methods: [ADMIN_GET, ADMIN_PUT],
  },
  {
    id: "settings.audit-logs",
    owner: "audit",
    path: "/api/settings/audit-logs",
    methods: [ADMIN_GET],
  },
  {
    id: "settings.logs",
    owner: "schedules",
    path: "/api/settings/logs",
    methods: [ADMIN_GET],
  },
  {
    id: "settings.log-delete",
    owner: "schedules",
    path: "/api/settings/logs/:id",
    methods: [ADMIN_DELETE],
    numericParams: ["id"],
  },
  {
    id: "settings.run-now",
    owner: "schedules",
    path: "/api/settings/run-now",
    methods: [ADMIN_POST_ACCEPTED],
  },
  {
    id: "settings.x-collection-run",
    owner: "x-posts",
    path: "/api/settings/x-collection/run-now",
    methods: [ADMIN_POST_ACCEPTED],
  },
  {
    id: "settings.pending-list",
    owner: "schedules",
    path: "/api/settings/pending",
    methods: [ADMIN_GET],
  },
  {
    id: "settings.pending-rejections",
    owner: "schedules",
    path: "/api/settings/pending/rejections",
    methods: [ADMIN_GET],
  },
  {
    id: "settings.pending-rejection-reopen",
    owner: "schedules",
    path: "/api/settings/pending/rejections/:id/reopen",
    methods: [ADMIN_POST],
    numericParams: ["id"],
  },
  ...[
    "reset-processed",
    "apply-empty-target",
    "approve",
    "reject",
  ].map((action) => ({
    id: `settings.pending-${action}`,
    owner: "schedules",
    path: `/api/settings/pending/:id/${action}`,
    methods: [ADMIN_POST],
    numericParams: ["id"],
  })),
  ...[
    "actions",
    "approve-selected",
    "reject-selected",
    "approve-all",
    "reject-all",
  ].map((action) => ({
    id: `settings.pending-${action}`,
    owner: "schedules",
    path: `/api/settings/pending/${action}`,
    methods: [ADMIN_POST],
  })),
];

describe("OTW Worker route manifest", () => {
  it("locks the complete handler-excluded route manifest", () => {
    expect(workerRouteManifest).toEqual(expectedRouteManifest);
  });

  it("contains unique ids and method/path signatures", () => {
    const uniqueRouteIds = new Set(workerRouteManifest.map(({ id }) => id));
    const signatures = workerRouteManifest.flatMap(({ path, methods }) =>
      methods.map(({ method }) => `${method} ${path}`),
    );

    expect(uniqueRouteIds.size).toBe(workerRouteManifest.length);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("requires valid owner, auth, cache, status, and numeric metadata", () => {
    const owners = new Set([
      "assets",
      "audit",
      "chzzk",
      "configuration",
      "ddays",
      "member-posts",
      "members",
      "naver-cafe",
      "notices",
      "operations",
      "otw-play",
      "schedule-board",
      "schedules",
      "x-posts",
      "youtube",
    ]);
    const authPolicies = new Set([
      "public",
      "public-write",
      "optional",
      "member-policy",
      "admin",
    ]);

    for (const route of workerRouteManifest) {
      expect(owners.has(route.owner), route.id).toBe(true);
      expect(route.path.startsWith("/"), route.id).toBe(true);
      expect(route.methods.length, route.id).toBeGreaterThan(0);
      for (const contract of route.methods) {
        expect(authPolicies.has(contract.auth), route.id).toBe(true);
        expect(contract.cache.trim().length, route.id).toBeGreaterThan(0);
        expect(Number.isInteger(contract.successStatus), route.id).toBe(true);
        expect(contract.successStatus, route.id).toBeGreaterThanOrEqual(200);
        expect(contract.successStatus, route.id).toBeLessThan(300);
      }
      for (const numericParam of route.numericParams ?? []) {
        expect(route.path, route.id).toContain(`:${numericParam}`);
      }
    }
  });

  it("returns 404 for typo paths instead of prefix dispatching", async () => {
    const response = await workerRouteRegistry.dispatch(
      new Request("https://example.com/api/live-status-typo"),
      env,
    );
    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Not Found");
  });

  it.each([
    ["/api/live-status", "POST", "GET"],
    ["/api/play/catalog", "POST", "GET"],
    ["/api/settings", "POST", "GET, PUT"],
    ["/api/settings/pending/actions", "PUT", "POST"],
    ["/api/settings/pending/approve-all", "GET", "POST"],
  ])(
    "returns 405 and Allow for %s %s before invoking a handler",
    async (path, method, allow) => {
      const response = await workerRouteRegistry.dispatch(
        new Request(`https://example.com${path}`, { method }),
        env,
      );
      expect(response?.status).toBe(405);
      expect(await response?.text()).toBe("Method Not Allowed");
      expect(response?.headers.get("Allow")).toBe(allow);
    },
  );

  it("keeps the empty R2 path inside the asset route namespace", async () => {
    const get = vi.fn(async () => null);
    const assetEnv = {
      ASSET_BUCKET: { get } as unknown as R2Bucket,
    } as Env;

    const missingAsset = await workerRouteRegistry.dispatch(
      new Request("https://example.com/r2-assets/"),
      assetEnv,
    );
    expect(missingAsset?.status).toBe(404);
    expect(await missingAsset?.text()).toBe("Not found");
    expect(get).not.toHaveBeenCalled();

    const invalidMethod = await workerRouteRegistry.dispatch(
      new Request("https://example.com/r2-assets/", { method: "POST" }),
      assetEnv,
    );
    expect(invalidMethod?.status).toBe(405);
    expect(invalidMethod?.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("returns exact 404 for unregistered pending aliases", async () => {
    const response = await workerRouteRegistry.dispatch(
      new Request(
        "https://example.com/api/settings/pending/12/approve-extra",
        { method: "POST" },
      ),
      env,
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe("Not Found");
  });

  it.each([
    ["/api/settings/logs/12abc", "DELETE"],
    ["/api/settings/pending/0/approve", "POST"],
    ["/api/settings/pending/-1/reject", "POST"],
    ["/api/settings/pending/1.5/reset-processed", "POST"],
    [
      "/api/settings/pending/9007199254740992/apply-empty-target",
      "POST",
    ],
  ])(
    "validates numeric compatibility route %s before its handler",
    async (path, method) => {
      const response = await workerRouteRegistry.dispatch(
        new Request(`https://example.com${path}`, { method }),
        env,
      );
      expect(response?.status).toBe(400);
      expect(await response?.text()).toBe("Invalid id");
    },
  );

});
