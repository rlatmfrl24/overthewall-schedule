import { describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import { workerRouteManifest, workerRouteRegistry } from "./routes";

const env = {} as Env;
// Independent security/cache contracts, grouped to avoid a second route registry.
const expectedPolicies = [
  { method: "GET", auth: "public", successStatus: 200,
    cache: "route-policy", paths: ["/api/site-content"] },
  { method: "GET", auth: "optional", successStatus: 200,
    cache: "no-store", paths: [
    "/api/auth/admin-status",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=31536000, immutable", paths: [
    "/r2-assets/*key",
  ] },
  { method: "HEAD", auth: "public", successStatus: 200,
    cache: "public, max-age=31536000, immutable", paths: [
    "/r2-assets/*key",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=0, s-maxage=45, must-revalidate", paths: [
    "/api/live-status",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=60, s-maxage=300, stale-while-revalidate=600", paths: [
    "/api/vods/chzzk",
    "/api/clips/chzzk",
    "/api/youtube/videos",
    "/api/youtube/shorts",
    "/api/kirinuki/videos",
    "/api/members",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "no-store", paths: [
    "/api/youtube/vods",
    "/api/members/:code",
    "/api/play/webhooks/youtube/:token",
    "/api/schedule-board",
    "/api/schedules",
    "/api/notices",
  ] },
  { method: "GET", auth: "admin", successStatus: 200,
    cache: "no-store", paths: [
    "/api/youtube/cache/status",
    "/api/kirinuki/channels",
    "/api/play/admin/playlists/defaults",
    "/api/play/admin/playlists/defaults/:playlistKey",
    "/api/play/admin/review-items",
    "/api/play/admin/ai-reviews",
    "/api/play/admin/ai-reviews/:id",
    "/api/play/admin/imports",
    "/api/play/admin/imports/:jobId",
    "/api/play/admin/imports/:jobId/items",
    "/api/play/admin/channel-monitors",
    "/api/play/admin/channel-monitors/:id/candidates",
    "/api/play/admin/catalog",
    "/api/play/admin/submissions",
    "/api/play/admin/channels/lookup",
    "/api/play/admin/source-health",
    "/api/play/admin/observability",
    "/api/play/admin/release",
    "/api/notices/thumbnails/status",
    "/api/x/history/posts",
    "/api/x/history/health",
    "/api/naver-cafe/sources",
    "/api/operations/status",
    "/api/operations/d1-observability",
    "/api/operations/job-summaries",
    "/api/operations/runs",
    "/api/operations/runs/:runId",
    "/api/operations/data-retention/status",
    "/api/settings",
    "/api/settings/audit-logs",
    "/api/settings/logs",
    "/api/settings/pending",
    "/api/settings/pending/rejections",
  ] },
  { method: "POST", auth: "admin", successStatus: 200,
    cache: "no-store", paths: [
    "/api/youtube/cache/refresh",
    "/api/youtube/cache/warmup/run",
    "/api/play/admin/imports/playlist/preflight",
    "/api/play/admin/import-candidates/:id/convert",
    "/api/play/admin/imports/:jobId/convert",
    "/api/play/admin/imports/:jobId/ignore",
    "/api/play/admin/imports/:jobId/retry",
    "/api/play/admin/channel-monitors/:id/reconcile",
    "/api/play/admin/channel-monitors/:id/revoke-approval",
    "/api/play/admin/channel-monitors/:id/subscribe",
    "/api/play/admin/channel-monitors/:id/renew",
    "/api/play/admin/channel-monitors/:id/unsubscribe",
    "/api/play/admin/channel-monitors/:id/backfill",
    "/api/play/admin/catalog-entries/preflight",
    "/api/play/admin/performances/:id/publish",
    "/api/play/admin/performances/:id/withdraw",
    "/api/play/admin/submissions/:id/approve",
    "/api/play/admin/submissions/:id/reject",
    "/api/play/admin/sources/:id/recheck",
    "/api/notices/thumbnails/cleanup",
    "/api/operations/live-schedule/auto-fill",
    "/api/settings/pending/rejections/:id/reopen",
    "/api/settings/pending/:id/reset-processed",
    "/api/settings/pending/:id/apply-empty-target",
    "/api/settings/pending/:id/approve",
    "/api/settings/pending/:id/reject",
    "/api/settings/pending/actions",
    "/api/settings/pending/approve-selected",
    "/api/settings/pending/reject-selected",
    "/api/settings/pending/approve-all",
    "/api/settings/pending/reject-all",
  ] },
  { method: "POST", auth: "admin", successStatus: 201,
    cache: "no-store", paths: [
    "/api/kirinuki/channels",
    "/api/play/admin/channel-monitors",
    "/api/play/admin/catalog-entries",
    "/api/play/admin/entities",
    "/api/play/admin/songs",
    "/api/play/admin/performances",
    "/api/play/admin/channels",
    "/api/notices",
    "/api/notices/thumbnail",
    "/api/ddays",
    "/api/naver-cafe/sources",
  ] },
  { method: "PUT", auth: "admin", successStatus: 200,
    cache: "no-store", paths: [
    "/api/kirinuki/channels",
    "/api/play/admin/playlists/defaults/:playlistKey",
    "/api/play/admin/entities",
    "/api/play/admin/songs",
    "/api/play/admin/performances",
    "/api/play/admin/channels",
    "/api/notices",
    "/api/notices/featured",
    "/api/ddays",
    "/api/naver-cafe/sources",
    "/api/settings",
  ] },
  { method: "DELETE", auth: "admin", successStatus: 200,
    cache: "no-store", paths: [
    "/api/kirinuki/channels",
    "/api/play/admin/imports/:jobId",
    "/api/play/admin/channel-monitors/:id",
    "/api/play/admin/entities/:id",
    "/api/play/admin/songs/:id",
    "/api/play/admin/performances/:id",
    "/api/play/admin/channels",
    "/api/notices",
    "/api/notices/thumbnail",
    "/api/ddays",
    "/api/x/posts/:id",
    "/api/naver-cafe/sources",
    "/api/naver-cafe/posts",
    "/api/settings/logs/:id",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=60, s-maxage=1800; auth/cookie => no-store", paths: [
    "/api/play/config",
  ] },
  { method: "GET", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/catalog",
  ] },
  { method: "GET", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/songs/:slug",
    "/api/play/performances/:id",
  ] },
  { method: "POST", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/performances/resolve",
  ] },
  { method: "GET", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/members",
    "/api/play/members/:code/songbook",
    "/api/play/playlists/defaults",
    "/api/play/performances",
    "/api/play/facets",
    "/api/play/me/playlists",
    "/api/play/me/playlists/:id",
    "/api/play/submissions/mine",
    "/api/play/submissions/artists",
    "/api/play/submissions/:id",
  ] },
  { method: "POST", auth: "member-policy", successStatus: 201,
    cache: "no-store", paths: [
    "/api/play/me/playlists",
    "/api/play/submissions",
  ] },
  { method: "PUT", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/me/playlists/:id",
  ] },
  { method: "DELETE", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/me/playlists/:id",
  ] },
  { method: "POST", auth: "public-write", successStatus: 204,
    cache: "no-store", paths: [
    "/api/play/webhooks/youtube/:token",
  ] },
  { method: "POST", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/submissions/preflight",
    "/api/play/submissions/:id/withdraw",
  ] },
  { method: "PATCH", auth: "member-policy", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/submissions/:id",
  ] },
  { method: "POST", auth: "admin", successStatus: 202,
    cache: "no-store", paths: [
    "/api/play/admin/ai-reviews",
    "/api/play/admin/imports/playlist",
    "/api/operations/runs",
    "/api/operations/runs/:runId/retry",
    "/api/operations/naver-cafe/check-now",
    "/api/operations/data-retention/prune",
    "/api/settings/run-now",
    "/api/settings/x-collection/run-now",
  ] },
  { method: "PATCH", auth: "admin", successStatus: 200,
    cache: "no-store", paths: [
    "/api/play/admin/import-candidates/:id",
    "/api/play/admin/channel-monitors/:id",
    "/api/play/admin/release",
  ] },
  { method: "POST", auth: "public-write", successStatus: 201,
    cache: "no-store", paths: [
    "/api/schedules",
  ] },
  { method: "PUT", auth: "public-write", successStatus: 200,
    cache: "no-store", paths: [
    "/api/schedules",
  ] },
  { method: "DELETE", auth: "public-write", successStatus: 200,
    cache: "no-store", paths: [
    "/api/schedules",
  ] },
  { method: "POST", auth: "public-write", successStatus: 200,
    cache: "no-store", paths: [
    "/api/schedules/save",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=60, s-maxage=300, stale-while-revalidate=600; noCache=1 => no-store", paths: [
    "/api/ddays",
  ] },
  { method: "GET", auth: "member-policy", successStatus: 200,
    cache: "visibility-dependent", paths: [
    "/api/member-posts",
    "/api/x/posts",
    "/api/x/posts/:id/context",
    "/api/naver-cafe/posts",
  ] },
  { method: "GET", auth: "public", successStatus: 200,
    cache: "public, max-age=60", paths: [
    "/api/x/config",
    "/api/naver-cafe/config",
  ] },
] as const;

describe("OTW Worker route manifest", () => {
  it("keeps every endpoint's method, authorization, cache and response policy", () => {
    const expected = expectedPolicies.flatMap(({ paths, ...policy }) =>
      paths.map(path => ({ path, ...policy })),
    );
    const actual = workerRouteManifest.flatMap(({ path, methods }) =>
      methods.map(policy => ({ path, ...policy })),
    );
    const signature = (value: { path: string; method: string }) => value.path + value.method;
    expect(actual.sort((a, b) => signature(a).localeCompare(signature(b))))
      .toEqual(expected.sort((a, b) => signature(a).localeCompare(signature(b))));
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
      "auth",
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
      "seo",
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
