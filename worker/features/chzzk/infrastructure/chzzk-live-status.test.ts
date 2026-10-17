import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chzzkVideoCatalog } from "./chzzk-adapters";
import { clearChzzkServiceCachesForTests, fetchChzzkLiveStatusWithDebug } from "./chzzk-api";

const channelId = "0a2020b09b8cc7f2285b7ae5de2ce4d3";
const pollingUrl = `https://api.chzzk.naver.com/polling/v2/channels/${channelId}/live-status`;
const channelUrl = `https://api.chzzk.naver.com/service/v1/channels/${channelId}`;
const restricted = () => Response.json({ code: 9004, message: "해외 시청 불가능한 컨텐츠 입니다." }, { status: 500 });

describe("scheduled CHZZK live evidence", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    clearChzzkServiceCachesForTests();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses confirmed public channel status after the recorded 500/9004 response", async () => {
    fetchMock.mockImplementation(async input => {
      if (String(input) === pollingUrl) return restricted();
      if (String(input) === channelUrl) return Response.json({ code: 200, content: { channelId, openLive: false } });
      throw new Error(`Unexpected request: ${String(input)}`);
    });

    expect(await chzzkVideoCatalog.fetchLiveStatus!(channelId)).toMatchObject({
      content: { status: "CLOSE" }, debug: { error: null, staleCacheUsed: false },
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([pollingUrl, channelUrl]);
    const request = fetchMock.mock.calls[1]![1];
    expect(new Headers(request?.headers).get("Authorization")).toBeNull();
    expect(new Headers(request?.headers).get("Cookie")).toBeNull();
  });

  it("handles a 9004 envelope without an HTTP error and never invents an opening time", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ code: 9004 }))
      .mockResolvedValueOnce(Response.json({ code: 200, content: { channelId, openLive: true } }));
    expect(await chzzkVideoCatalog.fetchLiveStatus!(channelId)).toMatchObject({
      content: { status: "OPEN", openDate: null }, debug: { error: null, staleCacheUsed: false },
    });
  });

  it("keeps channel-only metadata out of the public polling result", async () => {
    fetchMock.mockImplementation(async () => restricted());
    expect(await fetchChzzkLiveStatusWithDebug(channelId)).toMatchObject({
      content: null, debug: { error: "region_restricted", staleCacheUsed: false },
    });
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([pollingUrl]);
  });

  it.each([
    ["missing content", { code: 200 }],
    ["null content", { code: 200, content: null }],
    ["wrong channel", { code: 200, content: { channelId: "a".repeat(32), openLive: false } }],
    ["missing channel", { code: 200, content: { openLive: false } }],
    ["missing state", { code: 200, content: { channelId } }],
    ["string state", { code: 200, content: { channelId, openLive: "false" } }],
    ["failed envelope", { code: 500, content: { channelId, openLive: false } }],
  ])("preserves unknown status for %s metadata", async (_name, metadata) => {
    fetchMock.mockImplementation(async input => String(input) === pollingUrl ? restricted() : Response.json(metadata));
    const result = await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect(result.content).toBeNull();
    expect(result.debug.error).not.toBeNull();
  });

  it.each(["http", "json", "network"])("preserves a %s metadata failure", async failure => {
    fetchMock.mockImplementation(async input => {
      if (String(input) === pollingUrl) return restricted();
      if (failure === "network") throw new Error("offline");
      return failure === "json" ? new Response("invalid JSON")
        : Response.json({ code: 200, content: { channelId, openLive: false } }, { status: 503 });
    });
    const result = await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect(result.content).toBeNull();
    expect(result.debug.error).not.toBeNull();
  });

  it.each([500, 502, 503, 504])("keeps normal HTTP %s retries without consulting channel metadata", async status => {
    fetchMock.mockImplementation(async () => Response.json({ code: 500, message: "temporary failure" }, { status }));
    const result = await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect(result.content).toBeNull();
    expect(result.debug.error).toBe("http_error");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([pollingUrl, pollingUrl]);
  });

  it("keeps ordinary network retries without consulting channel metadata", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const result = await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect(result.content).toBeNull();
    expect(result.debug.error).toBe("network_error");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([pollingUrl, pollingUrl]);
  });

  it("does not reinterpret an ordinary forbidden response as channel evidence", async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 403 }, { status: 403 }));
    expect((await chzzkVideoCatalog.fetchLiveStatus!(channelId)).debug.error).toBe("http_error");
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([pollingUrl]);
  });

  it("refreshes scan evidence without changing public polling or caching partial metadata", async () => {
    const cached = { status: "CLOSE", openDate: "2026-10-15 23:00:00" };
    fetchMock.mockResolvedValueOnce(Response.json({ code: 200, content: cached }));
    await fetchChzzkLiveStatusWithDebug(channelId);
    fetchMock.mockImplementation(async input => String(input) === pollingUrl ? restricted()
      : Response.json({ code: 200, content: { channelId, openLive: true } }));
    expect(await chzzkVideoCatalog.fetchLiveStatus!(channelId)).toMatchObject({
      content: { status: "OPEN", openDate: null }, debug: { cacheHit: false, staleCacheUsed: false },
    });
    expect(await fetchChzzkLiveStatusWithDebug(channelId)).toMatchObject({
      content: cached, debug: { cacheHit: true },
    });
  });

  it("keeps a failed metadata check unknown even with expired CLOSE cache", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    fetchMock.mockResolvedValueOnce(Response.json({ code: 200, content: { status: "CLOSE" } }));
    await fetchChzzkLiveStatusWithDebug(channelId);
    clock.mockReturnValue(1_060_001);
    fetchMock.mockImplementation(async input => String(input) === pollingUrl ? restricted() : Response.json({ code: 200, content: null }));
    const result = await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect(result.content).toBeNull();
    expect(result.debug.error).not.toBeNull();
  });

  it("keeps normal live details and isolates another channel", async () => {
    const other = "a".repeat(32);
    const content = { status: "OPEN", openDate: "2026-10-16 08:00:00", liveTitle: "Current stream" };
    fetchMock.mockResolvedValueOnce(restricted())
      .mockResolvedValueOnce(Response.json({ code: 200, content: { channelId, openLive: false } }))
      .mockResolvedValueOnce(Response.json({ code: 200, content }));
    await chzzkVideoCatalog.fetchLiveStatus!(channelId);
    expect((await chzzkVideoCatalog.fetchLiveStatus!(other)).content).toEqual(content);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain(`/channels/${other}/live-status`);
  });
});
