import { describe, expect, it, vi } from "vitest";
import type { Env } from "../../../platform/types";
import { createYouTubeApplication } from "../application/youtube-service";
import { createKirinukiHandler } from "./kirinuki";

const youtubeChannelId = `UC${"A".repeat(22)}`;

describe("kirinuki worker route", () => {
  it("accepts the 40-item request used by the public kirinuki section", async () => {
    const fetchChannelVideos = vi.fn(async () => ({
      videos: [],
      shorts: [],
    }));
    const application = createYouTubeApplication({
      isApiConfigured: () => true,
      readAllowedChannelIds: async () => new Set<string>(),
      fetchChannelVideos,
      readCacheStatus: vi.fn(),
      readWarmupStatus: vi.fn(),
      runWarmup: vi.fn(),
      writeWarmupAudit: vi.fn(),
      listKirinukiChannels: async () => [
        {
          id: 1,
          channel_name: "키리누키 채널",
          channel_url: "https://www.youtube.com/@kirinuki",
          youtube_channel_id: youtubeChannelId,
          created_at: null,
        },
      ],
      createKirinukiChannel: vi.fn(),
      updateKirinukiChannel: vi.fn(),
      deleteKirinukiChannel: vi.fn(),
    });
    const handleKirinuki = createKirinukiHandler(() => application);

    const response = await handleKirinuki(
      new Request(
        "https://example.com/api/kirinuki/videos?maxResults=40",
      ),
      {} as Env,
    );

    expect(response.status).toBe(200);
    expect(fetchChannelVideos).toHaveBeenCalledWith(youtubeChannelId, 40);
  });

  it("rejects kirinuki requests above the supported cache profile", async () => {
    const listKirinukiChannels = vi.fn();
    const application = createYouTubeApplication({
      isApiConfigured: () => true,
      readAllowedChannelIds: async () => new Set<string>(),
      fetchChannelVideos: vi.fn(),
      readCacheStatus: vi.fn(),
      readWarmupStatus: vi.fn(),
      runWarmup: vi.fn(),
      writeWarmupAudit: vi.fn(),
      listKirinukiChannels,
      createKirinukiChannel: vi.fn(),
      updateKirinukiChannel: vi.fn(),
      deleteKirinukiChannel: vi.fn(),
    });
    const handleKirinuki = createKirinukiHandler(() => application);

    const response = await handleKirinuki(
      new Request(
        "https://example.com/api/kirinuki/videos?maxResults=41",
      ),
      {} as Env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "maxResults must be an integer between 1 and 40",
    );
    expect(listKirinukiChannels).not.toHaveBeenCalled();
  });
});
