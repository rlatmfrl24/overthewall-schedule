import { describe, expect, it, vi } from "vitest";
import type {
  YouTubePublicCacheMetadataDto,
  YouTubeVideoDto,
} from "@contracts/youtube";
import type { Env } from "../../../platform/types";
import {
  createYouTubeApplication,
  type YouTubeApplicationPorts,
} from "../application/youtube-service";
import { createKirinukiHandler } from "./kirinuki";

const youtubeChannelA = `UC${"A".repeat(22)}`;
const youtubeChannelB = `UC${"B".repeat(22)}`;

const makeVideo = (channelId: string): YouTubeVideoDto => ({
  videoId: `${channelId}-video`,
  title: "Video",
  publishedAt: "2026-07-09T12:00:00Z",
  thumbnailUrl: "",
  duration: 120,
  viewCount: 0,
  channelId,
  channelTitle: channelId,
  isShort: false,
});

const makeCache = (
  state: YouTubePublicCacheMetadataDto["state"],
  overrides: Partial<YouTubePublicCacheMetadataDto> = {},
): YouTubePublicCacheMetadataDto => ({
  state,
  oldestFetchedAt: "2026-07-09T00:00:00.000Z",
  refreshScheduledCount: 0,
  pendingCount: state === "fresh" ? 0 : 1,
  revalidateAfterMs: state === "fresh" ? null : 15000,
  ...overrides,
});

const makeExecutionContext = () =>
  ({
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  }) as unknown as ExecutionContext;

const createHarness = (
  channelIds: string[] = [youtubeChannelA],
) => {
  const listKirinukiChannels = vi.fn(async () =>
    channelIds.map((channelId, index) => ({
      id: index + 1,
      channel_name: `키리누키 채널 ${index + 1}`,
      channel_url: `https://www.youtube.com/@kirinuki${index + 1}`,
      youtube_channel_id: channelId,
      created_at: null,
    })),
  );
  const emptyBatch: Awaited<
    ReturnType<YouTubeApplicationPorts["readChannelsWithSWR"]>
  > = {
    byChannel: [],
    cache: makeCache("empty", {
      oldestFetchedAt: null,
      pendingCount: 0,
      revalidateAfterMs: null,
    }),
  };
  const readChannelsWithSWR = vi.fn(async () => emptyBatch);
  const ports = {
    isApiConfigured: () => false,
    readAllowedChannelIds: vi.fn(async () => new Set<string>()),
    readChannelsWithSWR,
    readCacheTargets: vi.fn(async () => []),
    readCacheStatus: vi.fn(),
    readWarmupStatus: vi.fn(),
    runCacheRefresh: vi.fn(),
    writeWarmupAudit: vi.fn(),
    listKirinukiChannels,
    createKirinukiChannel: vi.fn(async () => true),
    updateKirinukiChannel: vi.fn(async () => true),
    deleteKirinukiChannel: vi.fn(async () => true),
  } as unknown as YouTubeApplicationPorts;
  const application = createYouTubeApplication(ports);

  return {
    handleKirinuki: createKirinukiHandler(() => application),
    listKirinukiChannels,
    readChannelsWithSWR,
  };
};

describe("kirinuki worker route", () => {
  it("40개 요청은 canonical SWR 조회를 사용하고 fresh metadata와 ExecutionContext를 전달한다", async () => {
    const { handleKirinuki, readChannelsWithSWR } = createHarness();
    const cache = makeCache("fresh");
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "kirinuki",
          content: { videos: [makeVideo(youtubeChannelA)], shorts: [] },
        },
      ],
      cache,
    });
    const ctx = makeExecutionContext();

    const response = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/videos?maxResults=40"),
      {} as Env,
      ctx,
    );
    const body = (await response.json()) as {
      videos: YouTubeVideoDto[];
      byChannel: Array<{ channelName: string }>;
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(body.videos).toHaveLength(1);
    expect(body.byChannel[0]?.channelName).toBe("키리누키 채널 1");
    expect(body.cache).toEqual(cache);
    expect(readChannelsWithSWR).toHaveBeenCalledWith(
      [{ channelId: youtubeChannelA, source: "kirinuki" }],
      ctx,
    );
  });

  it("일부 채널만 사용 가능하면 200 partial과 no-store를 반환한다", async () => {
    const { handleKirinuki, readChannelsWithSWR } = createHarness([
      youtubeChannelA,
      youtubeChannelB,
    ]);
    const cache = makeCache("partial", {
      refreshScheduledCount: 1,
      pendingCount: 1,
    });
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "kirinuki",
          content: { videos: [makeVideo(youtubeChannelA)], shorts: [] },
        },
        {
          channelId: youtubeChannelB,
          source: "kirinuki",
          content: null,
        },
      ],
      cache,
    });

    const response = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/videos?maxResults=40"),
      {} as Env,
    );
    const body = (await response.json()) as {
      byChannel: Array<{ content: unknown | null }>;
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBeNull();
    expect(body.byChannel.map((channel) => channel.content !== null)).toEqual([
      true,
      false,
    ]);
    expect(body.cache).toEqual(cache);
  });

  it("등록 채널이 모두 비어 있으면 503 empty, Retry-After 15, no-store를 반환한다", async () => {
    const { handleKirinuki, readChannelsWithSWR } = createHarness();
    const cache = makeCache("empty", {
      oldestFetchedAt: null,
      pendingCount: 1,
    });
    readChannelsWithSWR.mockResolvedValueOnce({
      byChannel: [
        {
          channelId: youtubeChannelA,
          source: "kirinuki",
          content: null,
        },
      ],
      cache,
    });

    const response = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/videos?maxResults=40"),
      {} as Env,
    );
    const body = (await response.json()) as {
      cache: YouTubePublicCacheMetadataDto;
    };

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(body.cache).toEqual(cache);
  });

  it("지원 캐시 프로필을 넘는 요청은 채널 조회 전에 거부한다", async () => {
    const { handleKirinuki, listKirinukiChannels, readChannelsWithSWR } =
      createHarness();

    const response = await handleKirinuki(
      new Request("https://example.com/api/kirinuki/videos?maxResults=41"),
      {} as Env,
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toBe(
      "maxResults must be an integer between 1 and 40",
    );
    expect(listKirinukiChannels).not.toHaveBeenCalled();
    expect(readChannelsWithSWR).not.toHaveBeenCalled();
  });
});
