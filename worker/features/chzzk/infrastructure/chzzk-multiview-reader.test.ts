import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChzzkMultiviewReader } from "./chzzk-multiview-reader";
import { clearChzzkServiceCachesForTests, fetchChzzkLiveStatusWithDebug } from "./chzzk-api";
const id = "a".repeat(32), other = "b".repeat(32);
const metadata = { channelId: id, channelName: "A channel", channelImageUrl: "https://cdn.example/image.png", openLive: false };
const live = (channelId: string) => ({ channelId, channelName: "A channel", channelImageUrl: "", status: "OPEN", liveTitle: "Live", concurrentUserCount: 10, liveImageUrl: "", defaultThumbnailImageUrl: "" });
const reader = new ChzzkMultiviewReader();
beforeEach(() => { clearChzzkServiceCachesForTests(); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("existing public CHZZK channel reader for personal channels", () => {
  it.each([{ unexpected: "value" }, "", "   ", 15, null])("omits an invalid optional name while keeping healthy status and the saved-name fallback", async channelName => {
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: { ...live(id), channelName } }));
    const { channelName: unusedName, ...safeContent } = live(id);
    void unusedName;
    expect(await reader.readLiveStatuses([id])).toEqual([{ channelId: id, content: safeContent }]);
  });
  it("drops malformed optional image and date fields at the provider boundary", async () => {
    const core = { channelId: id, status: "OPEN", liveTitle: "Live", concurrentUserCount: 10 };
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: { ...core, channelImageUrl: {}, liveImageUrl: 1, defaultThumbnailImageUrl: [], openDate: {} } }));
    expect(await reader.readLiveStatuses([id])).toEqual([{ channelId: id, content: core }]);
  });
  it("accepts the actual polling response without channel metadata fields", async () => {
    const actual = { status: "CLOSE", channelId: id, liveTitle: "Last stream", concurrentUserCount: 235, openDate: "2026-10-21 20:00:00" };
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: actual }));
    expect(await reader.readLiveStatuses([id])).toEqual([{ channelId: id, content: actual }]);
  });
  it("resolves a real channel shape directly without Client credentials or a polling error", async () => {
    vi.stubGlobal("fetch", async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe(`https://api.chzzk.naver.com/service/v1/channels/${id}`);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(new Headers(init?.headers).get("Client-Secret")).toBeNull();
      return Response.json({ code: 200, content: metadata });
    });
    expect(await reader.resolveChannel(id)).toEqual({ channelId: id, channelName: "A channel", channelImageUrl: "https://cdn.example/image.png" });
  });
  it("returns null only for explicit channel absence", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: 404, content: null }, { status: 404 }));
    expect(await reader.resolveChannel(id)).toBeNull();
  });
  it.each([{ code: 200 }, { code: 200, content: { ...metadata, channelId: other } }, { code: 200, content: { ...metadata, channelName: "" } }, { code: 429 }, { code: 9004 }])("rejects unavailable or malformed metadata instead of inventing a channel", async payload => {
    vi.stubGlobal("fetch", async () => Response.json(payload));
    await expect(reader.resolveChannel(id)).rejects.toThrow();
  });
  it("does not display a non-HTTPS provider image", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: { ...metadata, channelImageUrl: "javascript:alert(1)" } }));
    expect((await reader.resolveChannel(id))?.channelImageUrl).toBeNull();
  });
  it("keeps healthy status beside a restricted channel and never treats failure as offline", async () => {
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => String(url).includes(other) ? Response.json({ code: 9004 }) : Response.json({ code: 200, content: live(id) }));
    expect(await reader.readLiveStatuses([id, other])).toEqual([{ channelId: id, content: live(id) }, { channelId: other, content: null }]);
  });
  it("rejects a mismatched live channel identity", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: live(other) }));
    expect(await reader.readLiveStatuses([id])).toEqual([{ channelId: id, content: null }]);
  });
  it("does not label cached stale OPEN content live after a failed refresh", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000);
    vi.stubGlobal("fetch", async () => Response.json({ code: 200, content: live(id) }));
    await reader.readLiveStatuses([id]);
    clock.mockReturnValue(62_000);
    vi.stubGlobal("fetch", async () => Response.json({ code: 9004 }));
    expect(await reader.readLiveStatuses([id])).toEqual([{ channelId: id, content: null }]);
  });
  it("limits live upstream concurrency to four", async () => {
    let active = 0, peak = 0;
    vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 1)); active--;
      const channelId = String(url).split("/channels/")[1]!.split("/")[0]!;
      return Response.json({ code: 200, content: live(channelId) });
    });
    expect(await reader.readLiveStatuses(Array.from({ length: 9 }, (_, i) => i.toString(16).padStart(32, "0")))).toHaveLength(9);
    expect(peak).toBe(4);
  });
  it("evicts live cache entries beyond 512 without changing its sixty-second TTL", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return Response.json({ code: 200, content: live(id) }); });
    for (let i = 0; i < 513; i++) await fetchChzzkLiveStatusWithDebug(i.toString(16).padStart(32, "0"));
    await fetchChzzkLiveStatusWithDebug("0".repeat(32));
    expect(calls).toBe(514);
  });
});
