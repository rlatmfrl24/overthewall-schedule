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
  checkIntervalMinutes: 60,
  lastCheckedAt: null,
  nextCheckAt: 100,
  lastSeenVideoId: "AAAAAAAAAAA",
  lastSeenPublishedAt: 50,
  lastRecentReconciledAt: null,
  lastErrorCode: null,
  syncPageToken: null,
  syncBaseVideoId: null,
  syncNewestVideoId: null,
  syncStartedAt: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
  automationApproval: null,

  candidateCount: 0,
  pendingCandidateCount: 0,
  previousGenerationPendingCount: 0,

  generation: 0,
  version: 0,
  createdAt: 100,
  updatedAt: 100,
  ...overrides,
});

const repository = () => ({
  findApprovableChannel: vi.fn(async (externalChannelId) => ({
    id: "channel-1",
    externalChannelId,
    displayName: "Approved Clips",
  })),
  findEligibleChannel: vi.fn(async (externalChannelId) => ({
    id: "channel-1",
    externalChannelId,
    displayName: "Approved Clips",
  })),
  findByExternalChannel: vi.fn<ChannelMonitorRepository["findByExternalChannel"]>(
    async () => null,
  ),
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
  listDueIds: vi.fn<ChannelMonitorRepository["listDueIds"]>(async () => []),
  claim: vi.fn(async () => monitor()),
  recordCandidates: vi.fn(async () => 1),
  saveContinuation: vi.fn(async (input) => monitor({
    syncPageToken: input.pageToken,
    syncBaseVideoId: input.baseVideoId,
    syncNewestVideoId: input.newestVideoId,
    syncStartedAt: input.now,
    version: input.expectedVersion + 1,
  })),
  complete: vi.fn(async (input) => monitor({
    lastSeenVideoId: input.lastSeenVideoId,
    lastSeenPublishedAt: input.lastSeenPublishedAt,
    lastCheckedAt: input.now,
  })),
  completeSupplemental: vi.fn(async (input) => monitor({
    lastRecentReconciledAt: input.now,
    version: input.expectedVersion + 1,
  })),
  revokeApproval: vi.fn(async (input) => monitor({
    status: "paused",
    automationApproval: {
      scope: "candidate_collection",
      status: "revoked",
      operatorReference: "operator-proof",
      approvalReference: "rights-ticket",
      revocationProcedure: "pause and unsubscribe",
      approvedByUserId: "admin-1",
      approvedAt: 90,
      revokedByUserId: input.actorUserId,
      revokedAt: input.now,
      version: input.expectedApprovalVersion + 1,
    },
    version: input.expectedVersion + 1,
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
  it("blocks new monitoring and reactivation while preserving pause and candidate readback", async () => {
    const repo = repository();
    const reader = youtube();
    const service = new ChannelMonitorService(repo, reader, () => "id", () => 100, async () => true);
    await expect(service.create("UC1234567890123456789012", "admin"))
      .rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.updateStatus("monitor-1", 0, "active", "admin"))
      .rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.reconcile("monitor-1")).rejects.toMatchObject({ code: "validation_failed" });
    expect(reader.readPlaylistPage).not.toHaveBeenCalled();
    await service.updateStatus("monitor-1", 0, "paused", "admin");
    await service.listCandidates("monitor-1");
    expect(repo.updateStatus).toHaveBeenCalledWith(expect.objectContaining({ status: "paused" }));
    expect(repo.listCandidates).toHaveBeenCalled();
  });
  it("returns an opaque cursor and restores it for the next candidate page", async () => {
    const repo = repository();
    repo.listCandidates
      .mockResolvedValueOnce({
        items: [{
          candidateId: "youtube:BBBBBBBBBBB",
          candidateVersion: 2,
          videoId: "BBBBBBBBBBB",
          title: "New Singing Clip",
          channelTitle: "Approved Clips",
          thumbnailUrl: null,
          durationSeconds: 180,
          publishedAt: 150,
          availabilityStatus: "playable",
          status: "needs_input",
          classification: "scope_review",
          exclusionReason: null,
          catalogChannelId: "channel-1",
          reviewInput: null,
          linkedPerformanceId: null,
          discoveredAt: 160,
          monitorGeneration: 0,
          retentionExpiresAt: 2_592_000_160,
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
    }, "current");
  });

  it("seeds the newest upload as a watermark without backfilling old videos", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [{ playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 0 }],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "monitor-1", () => 100);

    await expect(service.create(
      "UC1234567890123456789012",
      "admin-1",
    )).resolves.toMatchObject({
      lastSeenVideoId: "AAAAAAAAAAA",
    });
    expect(repo.recordCandidates).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      lastSeenVideoId: "AAAAAAAAAAA",
      approval: {
        scope: "candidate_collection",
        operatorReference: "approved_kirinuki channel registration",
        approvalReference: "written email consent confirmed before monitor creation",
        revocationProcedure: "pause collection, then remove the monitor",
        confirmed: true,
      },
    }));
  });

  it("does not treat an existing monitor without active rights as an approved create", async () => {
    const repo = repository();
    repo.findByExternalChannel.mockResolvedValueOnce(monitor({
      automationApproval: null,
    }));
    const service = new ChannelMonitorService(repo, youtube());

    await expect(service.create(
      "UC1234567890123456789012",
      "admin-1",
    )).rejects.toMatchObject({ code: "validation_failed" });
    expect(repo.create).not.toHaveBeenCalled();
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
    repo.get.mockResolvedValueOnce(monitor({ version: 3 }));
    const service = new ChannelMonitorService(repo, youtube());

    await expect(service.remove("monitor-1", 3, "admin-1")).resolves.toEqual({ id: "monitor-1" });
    expect(repo.remove).toHaveBeenCalledWith(expect.objectContaining({
      id: "monitor-1",
      expectedVersion: 3,
      actorUserId: "admin-1",
    }));
  });

  it("reports expected and actual versions before a stale monitor mutation", async () => {
    const repo = repository();
    repo.get.mockResolvedValueOnce(monitor({ version: 4 }));
    const service = new ChannelMonitorService(repo, youtube());

    await expect(service.remove("monitor-1", 3, "admin-1")).rejects.toMatchObject({
      code: "stale_write",
      fields: { expectedVersion: "3", actualVersion: "4" },
    });
    expect(repo.remove).not.toHaveBeenCalled();
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

  it("backfills only an explicit recent 1 to 20 item window", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [
        { playlistItemId: "item-c", videoId: "CCCCCCCCCCC", position: 0 },
        { playlistItemId: "item-b", videoId: "BBBBBBBBBBB", position: 1 },
        { playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 2 },
      ],
      nextPageToken: "next",
    });
    const service = new ChannelMonitorService(repo, reader, () => "unused", () => 600);

    await expect(service.backfill("monitor-1", 2)).resolves.toMatchObject({
      discoveredCount: 1,
      checkedVideoCount: 2,
      capped: true,
    });
    expect(reader.readVideos).toHaveBeenCalledWith(["CCCCCCCCCCC", "BBBBBBBBBBB"]);
    await expect(service.backfill("monitor-1", 0)).rejects.toMatchObject({
      code: "validation_failed",
    });
    await expect(service.backfill("monitor-1", 21)).rejects.toMatchObject({
      code: "validation_failed",
    });
  });

  it("revokes collection authority and pauses immediately without a Hub dependency", async () => {
    const repo = repository();
    const reader = youtube();
    const service = new ChannelMonitorService(repo, reader);
    await service.revokeApproval("monitor-1", 0, 1, "admin-2");
    expect(repo.revokeApproval).toHaveBeenCalledWith(expect.objectContaining({
      id: "monitor-1", expectedVersion: 0, expectedApprovalVersion: 1, actorUserId: "admin-2",
    }));
    expect(reader.readPlaylistPage).not.toHaveBeenCalled();
  });

  it("allows deletion after retirement while retaining monitor version checks", async () => {
    const repo = repository();
    const service = new ChannelMonitorService(repo, youtube());
    await expect(service.remove("monitor-1", 0, "admin-1")).resolves.toEqual({ id: "monitor-1" });
    await expect(service.remove("monitor-1", 99, "admin-1")).rejects.toMatchObject({ code: "stale_write" });
    expect(repo.remove).toHaveBeenCalledOnce();
  });

  it("keeps a paused monitor paused when the resume watermark lookup fails", async () => {
    const repo = repository();
    repo.get.mockResolvedValue(monitor({ status: "paused" }));
    const reader = youtube();
    reader.readPlaylistPage.mockRejectedValueOnce(new Error("YouTube unavailable"));
    const service = new ChannelMonitorService(repo, reader);
    await expect(service.updateStatus("monitor-1", 0, "active", "admin-1")).rejects.toThrow("YouTube unavailable");
    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(repo.resetWatermark).not.toHaveBeenCalled();
  });

  it("does not advance the watermark after a video metadata failure", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({ items: [
      { playlistItemId: "new", videoId: "BBBBBBBBBBB", position: 0 },
      { playlistItemId: "base", videoId: "AAAAAAAAAAA", position: 1 },
    ], nextPageToken: null });
    reader.readVideos.mockRejectedValueOnce(new Error("metadata failed"));
    await expect(new ChannelMonitorService(repo, reader).reconcile("monitor-1")).rejects.toThrow("metadata failed");
    expect(repo.complete).not.toHaveBeenCalled();
    expect(repo.recordCandidates).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledOnce();
  });

  it("saves a continuation at 250 uploads without advancing the committed watermark", async () => {
    const repo = repository();
    const reader = youtube();
    for (let page = 0; page < 5; page += 1) {
      reader.readPlaylistPage.mockResolvedValueOnce({
        items: Array.from({ length: 50 }, (_, index) => ({
          playlistItemId: `item-${page}-${index}`,
          videoId: String(page * 50 + index).padStart(11, "0"), position: page * 50 + index,
        })),
        nextPageToken: `page-${page + 1}`,
      });
    }
    const result = await new ChannelMonitorService(repo, reader).reconcile("monitor-1");
    expect(result).toMatchObject({ capped: true, continuationSaved: true, checkedVideoCount: 250 });
    expect(reader.readVideos).toHaveBeenCalledTimes(5);
    expect(repo.saveContinuation).toHaveBeenCalledWith(expect.objectContaining({
      pageToken: "page-5", baseVideoId: "AAAAAAAAAAA", newestVideoId: "00000000000",
    }));
    expect(repo.complete).not.toHaveBeenCalled();
  });

  it("reports a missing watermark as a failed check requiring operator action", async () => {
    const repo = repository();
    repo.listDueIds.mockResolvedValueOnce(["monitor-1"]);
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({ items: [], nextPageToken: null });
    expect(await new ChannelMonitorService(repo, reader).runDue()).toEqual([
      { id: "monitor-1", ok: false, discoveredCount: 0, errorCode: "gap_suspected" },
    ]);
    expect(repo.complete).not.toHaveBeenCalled();
  });
});
