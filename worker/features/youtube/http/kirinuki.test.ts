import { describe, expect, it, vi } from "vitest";
import { createYouTubeApplication, type YouTubeApplicationPorts } from "../application/youtube-service";
import { createKirinukiHandler } from "./kirinuki";
import type { Env } from "../../../platform/types";
const channel = `UC${"A".repeat(22)}`;
function setup() {
  const readStoredFeed = vi.fn(async () => ({ videos: [{ videoId: "one", title: "One", publishedAt: "", thumbnailUrl: "", duration: 120, viewCount: 1, channelId: channel, channelTitle: "One", isShort: false }], shorts: [], oldestRetainedAt: new Date().toISOString() }));
  const listKirinukiChannels = vi.fn(async () => [{ id: 1, channel_name: "Clip", youtube_channel_id: channel, channel_url: "", created_at: null }]);
  const ports = { readStoredFeed, listKirinukiChannels } as unknown as YouTubeApplicationPorts;
  const handle = createKirinukiHandler(() => createYouTubeApplication(ports));
  return { request: (query = "") => handle(new Request(`https://otw.test/api/kirinuki/videos${query}`), {} as Env), readStoredFeed, listKirinukiChannels };
}
describe("kirinuki stored feed", () => {
  it("retains names and public caching, without an external API key", async () => {
    const { request, readStoredFeed } = setup();
    const response = await request("?maxResults=40");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(await response.json()).toMatchObject({ videos: [{ videoId: "one" }], byChannel: [{ channelName: "Clip" }], cache: { state: "fresh" } });
    expect(readStoredFeed).toHaveBeenCalledWith([channel], 40, "kirinuki");
  });
  it("rejects oversized requests before reading channels or storage", async () => {
    const { request, readStoredFeed, listKirinukiChannels } = setup();
    expect((await request("?maxResults=41")).status).toBe(400);
    expect(readStoredFeed).not.toHaveBeenCalled();
    expect(listKirinukiChannels).not.toHaveBeenCalled();
  });
});
