import { beforeEach, describe, expect, it, vi } from "vitest";
import type { YouTubeApplicationPorts } from "../application/youtube-service";
import { createYouTubeApplication } from "../application/youtube-service";
import { createYouTubeHandler } from "./youtube";
import type { Env } from "../../../platform/types";

const admin = vi.hoisted(() => vi.fn());
vi.mock("../../../platform/auth", () => ({ requireAdminUser: admin }));
const channel = `UC${"A".repeat(22)}`;
const video = { videoId: "one", title: "One", publishedAt: new Date().toISOString(), thumbnailUrl: "", duration: 120, viewCount: 1, channelId: channel, channelTitle: "One", isShort: false };
function setup() {
  const readStoredFeed = vi.fn(async () => ({ videos: [video], shorts: [], oldestRetainedAt: new Date().toISOString() }));
  const readFeedStatus = vi.fn(async () => ({ updatedAt: 1 }));
  const readShorts = vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false, updatedAt: "", collection: { state: "exhausted", baselineTarget: 20, requested: 20, returned: 0, revalidateAfterMs: null } }));
  const ports = { readStoredFeed, readFeedStatus, readShorts, readAllowedChannelIds: vi.fn(async () => new Set([channel])) } as unknown as YouTubeApplicationPorts;
  const handle = createYouTubeHandler(() => createYouTubeApplication(ports));
  const request = (path: string, method = "GET") => handle(new Request(`https://otw.test/api/youtube/${path}`, { method }), {} as Env);
  return { request, ports, readStoredFeed, readFeedStatus, readShorts };
}
describe("YouTube storage-only routes", () => {
  beforeEach(() => admin.mockResolvedValue({ ok: true, user: { id: "admin" } }));
  it("serves stored videos without an API key, and marks old retained metadata stale", async () => {
    const { request, readStoredFeed } = setup();
    const fresh = await request(`videos?channelIds=${channel}`);
    expect(fresh.status).toBe(200);
    expect(fresh.headers.get("Cache-Control")).toContain("public");
    expect(await fresh.json()).toMatchObject({ videos: [video], cache: { state: "fresh", revalidateAfterMs: null } });
    readStoredFeed.mockResolvedValueOnce({ videos: [video], shorts: [], oldestRetainedAt: new Date(Date.now() - 86_400_001).toISOString() });
    const stale = await request(`videos?channelIds=${channel}`);
    expect(stale.headers.get("Cache-Control")).toBe("no-store");
    expect(await stale.json()).toMatchObject({ videos: [video], cache: { state: "stale" } });
    expect(readStoredFeed).toHaveBeenCalledWith([channel], 20, "official");
  });
  it("empty storage is a known empty response, never a legacy fallback", async () => {
    const { request, readStoredFeed } = setup();
    readStoredFeed.mockResolvedValueOnce({ videos: [], shorts: [], oldestRetainedAt: null as unknown as string });
    const response = await request(`videos?channelIds=${channel}`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ videos: [], cache: { state: "empty", pendingCount: 0 } });
  });
  it("requires admin authentication and accepts only 24/168 hour status windows", async () => {
    const { request, readFeedStatus } = setup();
    admin.mockResolvedValueOnce({ ok: false, response: new Response("Unauthorized", { status: 401 }) });
    expect((await request("feed/status")).status).toBe(401);
    expect(readFeedStatus).not.toHaveBeenCalled();
    for (const value of ["12", "0", "999", "NaN"]) expect((await request(`feed/status?windowHours=${value}`)).status).toBe(400);
    const response = await request("feed/status?windowHours=168");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toBe("Authorization");
    expect(readFeedStatus).toHaveBeenCalledWith(168);
    readFeedStatus.mockRejectedValueOnce(new Error("D1 unavailable"));
    const failed = await request("feed/status");
    expect(failed.status).toBe(503);
    expect(failed.headers.get("Cache-Control")).toBe("no-store");
    expect(await failed.json()).toEqual({ error: "youtube_feed_status_unavailable" });
  });
  it.each(["cache/status", "cache/refresh", "cache/warmup/run"])("retired %s is 404", async (path) => {
    const { request } = setup();
    expect((await request(path)).status).toBe(404);
    expect((await request(path, "POST")).status).toBe(404);
  });
  it("rejects invalid or unapproved channels and failed allowlist before storage reads", async () => {
    const { request, ports, readStoredFeed } = setup();
    expect((await request("videos?channelIds=bad")).status).toBe(400);
    expect((await request(`videos?channelIds=${channel}&maxResults=21`)).status).toBe(400);
    expect((await request(`shorts?channelIds=${channel}&limit=21`)).status).toBe(400);
    expect((await request(`videos?channelIds=UC${"B".repeat(22)}`)).status).toBe(400);
    vi.mocked(ports.readAllowedChannelIds).mockRejectedValueOnce(new Error("unavailable"));
    expect((await request(`videos?channelIds=${channel}`)).status).toBe(503);
    expect(readStoredFeed).not.toHaveBeenCalled();
  });
  it("preserves the Shorts cursor and stable public caching", async () => {
    const { request, readShorts } = setup();
    const response = await request(`shorts?channelIds=${channel}&cursor=next&limit=5`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(readShorts).toHaveBeenCalledWith([channel], 5, "next", undefined);
  });
});
