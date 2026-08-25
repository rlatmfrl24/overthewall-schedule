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
  generation: 0,
  version: 0,
  createdAt: 100,
  updatedAt: 100,
  ...overrides,
});

const repository = () => ({
  findEligibleChannel: vi.fn(async (externalChannelId) => ({
    id: "channel-1",
    externalChannelId,
    displayName: "Approved Clips",
  })),
  findByExternalChannel: vi.fn(async () => null),
  get: vi.fn(async () => monitor()),
  list: vi.fn(async () => []),
  listCandidates: vi.fn<ChannelMonitorRepository["listCandidates"]>(
    async () => ({ items: [], hasMore: false }),
  ),
  create: vi.fn(async (input) => monitor({
    id: input.id,
    lastSeenVideoId: input.lastSeenVideoId,
  })),
  updateStatus: vi.fn(async () => monitor()),
  updateTarget: vi.fn(async (input) => monitor({
    channelId: input.channel.id,
    externalChannelId: input.channel.externalChannelId,
    uploadsPlaylistId: input.uploadsPlaylistId,
    lastSeenVideoId: input.lastSeenVideoId,
    version: input.expectedVersion + 1,
  })),
  resetWatermark: vi.fn(async (input) => monitor({
    status: "active",
    lastSeenVideoId: input.lastSeenVideoId,
    lastErrorCode: null,
    version: input.expectedVersion + 1,
  })),
  remove: vi.fn(async ({ id }) => ({ id })),
  listDueIds: vi.fn(async () => []),
  claim: vi.fn(async () => monitor()),
  recordCandidates: vi.fn(async () => 1),
  complete: vi.fn(async (input) => monitor({
    lastSeenVideoId: input.lastSeenVideoId,
    lastSeenPublishedAt: input.lastSeenPublishedAt,
    lastCheckedAt: input.now,
  })),
  markGapSuspected: vi.fn(async (input) => monitor({
    status: "paused",
    lastErrorCode: "gap_suspected",
    version: input.expectedVersion + 1,
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
  it("returns an opaque cursor and restores it for the next candidate page", async () => {
    const repo = repository();
    repo.listCandidates
      .mockResolvedValueOnce({
        items: [{
          candidateId: "youtube:BBBBBBBBBBB",
          candidateVersion: 2,
          videoId: "BBBBBBBBBBB",
          title: "New Singing Clip",
          thumbnailUrl: null,
          publishedAt: 150,
          availabilityStatus: "playable",
          status: "needs_input",
          classification: "scope_review",
          exclusionReason: null,
          discoveredAt: 160,
        }],
        hasMore: true,
      })
      .mockResolvedValueOnce({ items: [], hasMore: false });
    const service = new ChannelMonitorService(repo, youtube());

    const first = await service.listCandidates("monitor-1", 1);
    expect(first.nextCursor).toEqual(expect.any(String));
    await service.listCandidates("monitor-1", 1, first.nextCursor);
    expect(repo.listCandidates).toHaveBeenNthCalledWith(2, "monitor-1", 1, {
      discoveredAt: 160,
      candidateId: "youtube:BBBBBBBBBBB",
    });
  });

  it("seeds the newest upload as a watermark without backfilling old videos", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "monitor-1", () => 100);

    await expect(service.create("UC1234567890123456789012", "admin-1")).resolves.toMatchObject({
      lastSeenVideoId: "AAAAAAAAAAA",
    });
    expect(repo.recordCandidates).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      lastSeenVideoId: "AAAAAAAAAAA",
    }));
  });

  it("repoints a monitor by external channel ID and resets its watermark", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readChannelUploads.mockResolvedValueOnce({
      channelId: "UC2222222222222222222222",
      displayName: "Second Approved Channel",
      uploadsPlaylistId: "UU2222222222222222222222",
    });
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [{ playlistItemId: "item-z", videoId: "ZZZZZZZZZZZ", position: 0 }],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "unused", () => 500);

    await expect(service.updateTarget(
      "monitor-1",
      0,
      "UC2222222222222222222222",
      "admin-1",
    )).resolves.toMatchObject({
      externalChannelId: "UC2222222222222222222222",
      lastSeenVideoId: "ZZZZZZZZZZZ",
    });
    expect(repo.updateTarget).toHaveBeenCalledWith(expect.objectContaining({
      id: "monitor-1",
      expectedVersion: 0,
      uploadsPlaylistId: "UU2222222222222222222222",
      lastSeenVideoId: "ZZZZZZZZZZZ",
      now: 500,
    }));
  });

  it("deletes a monitor with optimistic concurrency", async () => {
    const repo = repository();
    const service = new ChannelMonitorService(repo, youtube());

    await expect(service.remove("monitor-1", 3, "admin-1")).resolves.toEqual({ id: "monitor-1" });
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({
      id: "monitor-1",
      expectedVersion: 3,
      actorUserId: "admin-1",
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
      gapSuspected: false,
      monitor: { lastSeenVideoId: "BBBBBBBBBBB" },
    });
    expect(reader.readVideos).toHaveBeenCalledWith(["BBBBBBBBBBB"]);
    expect(repo.recordCandidates).toHaveBeenCalledWith(expect.objectContaining({
      monitorId: "monitor-1",
      observations: [expect.objectContaining({ videoId: "BBBBBBBBBBB" })],
    }));
  });

  it("pauses without backfilling when the stored watermark is missing", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [
        { playlistItemId: "item-old", videoId: "OOOOOOOOOOO", position: 0 },
      ],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "event-gap", () => 400);

    await expect(service.reconcile("monitor-1")).resolves.toMatchObject({
      discoveredCount: 0,
      checkedVideoCount: 1,
      capped: false,
      gapSuspected: true,
      monitor: { status: "paused", lastErrorCode: "gap_suspected" },
    });
    expect(reader.readVideos).not.toHaveBeenCalled();
    expect(repo.recordCandidates).not.toHaveBeenCalled();
    expect(repo.markGapSuspected).toHaveBeenCalledWith({
      id: "monitor-1",
      expectedVersion: 0,
      monitorGeneration: 0,
      now: 400,
    });
  });

  it("resets a missing watermark to the current newest upload", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [{ playlistItemId: "item-current", videoId: "CCCCCCCCCCC", position: 0 }],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "event-reset", () => 500);

    await service.resetWatermark("monitor-1", 0, "admin-1");
    expect(repo.resetWatermark).toHaveBeenCalledWith({
      id: "monitor-1",
      expectedVersion: 0,
      lastSeenVideoId: "CCCCCCCCCCC",
      actorUserId: "admin-1",
      eventId: "event-reset",
      now: 500,
    });
  });
});
