import { describe, expect, it, vi } from "vitest";
import type { OtwPlayChannelMonitorDto } from "@contracts/otw-play";
import { ChannelMonitorService } from "./channel-monitor-service";
import type { ChannelMonitorRepository } from "./ports/channel-monitor-repository";
import type { OtwPlayYouTubeIngestionReader } from "./ports/youtube-metadata";

const monitor = (overrides: Partial<OtwPlayChannelMonitorDto> = {}): OtwPlayChannelMonitorDto => ({
  id: "monitor-1",
  channelId: "channel-1",
  channelDisplayName: "Approved Clips",
  externalChannelId: "UC1234567890123456789012",
  uploadsPlaylistId: "UU1234567890123456789012",
  status: "active",
  checkIntervalMinutes: 360,
  lastCheckedAt: null,
  nextCheckAt: 100,
  lastSeenVideoId: "AAAAAAAAAAA",
  lastSeenPublishedAt: 50,
  lastErrorCode: null,
  candidateCount: 0,
  pendingCandidateCount: 0,
  version: 0,
  createdAt: 100,
  updatedAt: 100,
  ...overrides,
});

const repository = () => ({
  findEligibleChannel: vi.fn(async () => ({
    id: "channel-1",
    externalChannelId: "UC1234567890123456789012",
    displayName: "Approved Clips",
  })),
  findByChannel: vi.fn(async () => null),
  get: vi.fn(async () => monitor()),
  list: vi.fn(async () => []),
  listCandidates: vi.fn(async () => []),
  create: vi.fn(async (input) => monitor({
    id: input.id,
    lastSeenVideoId: input.lastSeenVideoId,
  })),
  updateStatus: vi.fn(async () => monitor()),
  listDueIds: vi.fn(async () => []),
  claim: vi.fn(async () => monitor()),
  recordCandidates: vi.fn(async () => 1),
  complete: vi.fn(async (input) => monitor({
    lastSeenVideoId: input.lastSeenVideoId,
    lastSeenPublishedAt: input.lastSeenPublishedAt,
    lastCheckedAt: input.now,
  })),
  fail: vi.fn(async () => undefined),
}) satisfies ChannelMonitorRepository;

const youtube = () => ({
  readChannel: vi.fn(async () => null),
  readChannelUploads: vi.fn(async () => ({
    channelId: "UC1234567890123456789012",
    displayName: "Approved Clips",
    uploadsPlaylistId: "UU1234567890123456789012",
  })),
  readVideo: vi.fn(async () => null),
  readVideos: vi.fn<OtwPlayYouTubeIngestionReader["readVideos"]>(async (ids) =>
    ids.map((videoId) => ({
      videoId,
      availabilityStatus: "playable" as const,
      video: {
        videoId,
        channelId: "UC1234567890123456789012",
        channelTitle: "Approved Clips",
        title: `Video ${videoId}`,
        thumbnailUrl: null,
        durationSeconds: 120,
        publishedAt: videoId === "BBBBBBBBBBB" ? 200 : 100,
        availabilityStatus: "playable" as const,
      },
    }))),
  readPlaylistSummary: vi.fn(async () => null),
  readPlaylistPage: vi.fn<OtwPlayYouTubeIngestionReader["readPlaylistPage"]>(async () => ({
    items: [],
    nextPageToken: null,
  })),
}) satisfies OtwPlayYouTubeIngestionReader;

describe("ChannelMonitorService", () => {
  it("seeds the newest upload as a watermark without backfilling old videos", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "monitor-1", () => 100);

    await expect(service.create("channel-1", "admin-1")).resolves.toMatchObject({
      lastSeenVideoId: "AAAAAAAAAAA",
    });
    expect(repo.recordCandidates).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      lastSeenVideoId: "AAAAAAAAAAA",
    }));
  });

  it("adds only uploads newer than the stored watermark to review candidates", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [
        { playlistItemId: "item-b", videoId: "BBBBBBBBBBB", position: 0 },
        { playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 1 },
      ],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "unused", () => 300);

    await expect(service.reconcile("monitor-1")).resolves.toMatchObject({
      discoveredCount: 1,
      checkedVideoCount: 1,
      capped: false,
      monitor: { lastSeenVideoId: "BBBBBBBBBBB" },
    });
    expect(reader.readVideos).toHaveBeenCalledWith(["BBBBBBBBBBB"]);
    expect(repo.recordCandidates).toHaveBeenCalledWith(expect.objectContaining({
      monitorId: "monitor-1",
      observations: [expect.objectContaining({ videoId: "BBBBBBBBBBB" })],
    }));
  });
});
