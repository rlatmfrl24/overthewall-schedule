import { describe, expect, it, vi } from "vitest";
import { AiReviewBroadcastMetadataReader } from "./ai-review-broadcast-reader";

describe("broadcast source metadata", () => {
  it("rejects arbitrary hosts without fetching and verifies CHZZK replay identity", async () => {
    const youtube = { readVideo: vi.fn(), readChannel: vi.fn() };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ content: { videoNo: 123, videoType: "REPLAY", channel: { channelId: "member-channel" } } }));
    const reader = new AiReviewBroadcastMetadataReader(youtube, fetcher);
    expect(await reader.read("https://evil.test/123")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await reader.read("https://chzzk.naver.com/video/123")).toEqual({ platform: "chzzk", channelId: "member-channel", isBroadcast: true });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.chzzk.naver.com/service/v3/videos/123");
    fetcher.mockResolvedValue(Response.json({ content: { videoNo: 999, videoType: "REPLAY", channel: { channelId: "member-channel" } } }));
    expect(await reader.read("https://chzzk.naver.com/video/123")).toBeNull();
  });
  it("does not mistake a public original MV for a broadcast", async () => {
    const readVideo = vi.fn().mockResolvedValue({ privacyStatus: "public", channelId: "artist", actualStartTime: null });
    const reader = new AiReviewBroadcastMetadataReader({ readVideo, readChannel: vi.fn() });
    expect(await reader.read("https://youtu.be/AAAAAAAAAAA")).toMatchObject({ isBroadcast: false });
  });
});
