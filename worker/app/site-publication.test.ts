import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readSitePublicationAccess } from "./site-publication";
import type { Env } from "../platform/types";
import { siteEnv } from "../test-support/site-env";
import { authenticateOptionalRequest } from "../platform/auth";

vi.mock("../platform/auth", () => ({
  authenticateOptionalRequest: vi.fn(async () => null),
  isAdminUser: (env: Env, id: string) => env.CLERK_ADMIN_IDS === id,
}));
const request = (path: string, method = "GET") => new Request(`https://luvdia-schedule.info${path}`, { method });
const env = () => ({ ...siteEnv("luvdia"), CLERK_ADMIN_IDS: "admin", otw_db: { prepare: vi.fn(() => { throw Error("Must not query D1"); }) } }) as unknown as Env;
beforeEach(() => { vi.mocked(authenticateOptionalRequest).mockReset().mockResolvedValue(null); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-18T14:59:59Z")); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it("returns public clock metadata without D1 or authentication", async () => {
  const response = await readSitePublicationAccess(request("/api/publication-status"), env());
  expect(response?.status).toBe(200);
  expect(await response!.json()).toMatchObject({ phase: "countdown", opensAt: "2026-10-18T15:00:00Z" });
  expect(authenticateOptionalRequest).not.toHaveBeenCalled();
});

it("renders the public countdown without waiting for Clerk, app assets or D1", async () => {
  const response = await readSitePublicationAccess(request("/"), env());
  expect(response?.status).toBe(200);
  expect(await response!.text()).toContain("2026년 10월 19일 오전 0시 공개");
});

it.each(["/launch/countdown.css", "/launch/luvdia-members-silhouette.webp", "/launch/outfit-latin.woff2"])("serves only explicitly public launch assets before opening: %s", async path => {
  const fetch = vi.fn(async () => new Response("launch asset"));
  const response = await readSitePublicationAccess(request(path), { ...env(), ASSETS: { fetch } } as unknown as Env);
  expect(await response!.text()).toBe("launch asset");
  expect(fetch).toHaveBeenCalledOnce();
  expect(authenticateOptionalRequest).not.toHaveBeenCalled();
});

it.each(["/launch/private.webp", "/launch/private.json", "/launch/../profile/bing_hayu.webp", "/launch/luvdia-heart.webp", "/launch/luvdia-opening.ics"])("does not widen the launch asset exception: %s", async path => {
  expect((await readSitePublicationAccess(request(path), env()))?.status).toBe(403);
});


it.each(["/api/members", "/api/play/config", "/api/settings", "/r2-assets/members/a.webp", "/profile/bing_hayu.webp", "/%61pi/members"])("blocks anonymous content without D1: %s", async path => {
  const response = await readSitePublicationAccess(request(path), env());
  expect(response?.status).toBe(403);
  expect(response?.headers.get("Cache-Control")).toContain("no-store");
});

it("serves an empty app shell for countdown and admin sign-in without content reads", async () => {
  const bindings = { ...env(), ASSETS: { fetch: vi.fn(async () => new Response("<html><div id='root'></div></html>")) } } as unknown as Env;
  for (const path of ["/", "/profile/bing_hayu", "/admin/operations", "/unknown-route"]) {
    const response = await readSitePublicationAccess(request(path), bindings);
    expect(response?.status).toBe(200);
    expect(response?.headers.get("X-Robots-Tag")).toContain("noindex");
  }
});

it("allows current admins while rejecting ordinary signed-in users", async () => {
  vi.mocked(authenticateOptionalRequest).mockResolvedValueOnce({ id: "member" } as never);
  expect((await readSitePublicationAccess(request("/api/members"), env()))?.status).toBe(403);
  vi.mocked(authenticateOptionalRequest).mockResolvedValueOnce({ id: "admin" } as never);
  expect(await readSitePublicationAccess(request("/api/members"), env())).toBeNull();
});

it("opens on server time and makes protected HEAD responses body-free", async () => {
  const closed = await readSitePublicationAccess(request("/api/members", "HEAD"), env());
  expect(await closed!.text()).toBe("");
  vi.setSystemTime(new Date("2026-10-18T15:00:00Z"));
  expect(await readSitePublicationAccess(request("/api/members"), env())).toBeNull();
});

it("keeps an explicit publication hold closed after the opening time", async () => {
  vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
  const response = await readSitePublicationAccess(request("/api/members"), { ...env(), SITE_PUBLICATION_HOLD: "true" });
  expect(response?.status).toBe(403);
  expect(response?.headers.get("Cache-Control")).toContain("no-store");
  expect(await response!.json()).toMatchObject({ error: { code: "SITE_NOT_OPEN" } });
});
