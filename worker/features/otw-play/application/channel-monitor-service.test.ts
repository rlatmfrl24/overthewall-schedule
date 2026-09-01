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
  lastRecentReconciledAt: null,
  lastErrorCode: null,
  syncPageToken: null,
  syncBaseVideoId: null,
  syncNewestVideoId: null,
  syncStartedAt: null,
  lastSuccessAt: null,
  consecutiveFailures: 0,
  automationApproval: null,
  subscription: null,
  candidateCount: 0,
  pendingCandidateCount: 0,
  previousGenerationPendingCount: 0,
  deliveryHealth: {
    pendingCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
    lastReceivedAt: null,
    lastProcessedAt: null,
    lastFailedAt: null,
    lastErrorCode: null,
  },
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
  listRecentDueIds: vi.fn<ChannelMonitorRepository["listRecentDueIds"]>(async () => []),
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
        revocationProcedure: "pause collection, unsubscribe WebSub, then remove the monitor",
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

  it("reconciles only uploads newer than the watermark in the daily recent window", async () => {
    const repo = repository();
    repo.listRecentDueIds.mockResolvedValueOnce(["monitor-1"]);
    const reader = youtube();
    reader.readPlaylistPage.mockResolvedValueOnce({
      items: [
        { playlistItemId: "item-c", videoId: "CCCCCCCCCCC", position: 0 },
        { playlistItemId: "item-b", videoId: "BBBBBBBBBBB", position: 1 },
        { playlistItemId: "item-a", videoId: "AAAAAAAAAAA", position: 2 },
        { playlistItemId: "item-old", videoId: "OOOOOOOOOOO", position: 3 },
      ],
      nextPageToken: null,
    });
    const service = new ChannelMonitorService(repo, reader, () => "unused", () => 700);

    await expect(service.runRecentDue()).resolves.toEqual([{
      id: "monitor-1",
      ok: true,
      discoveredCount: 1,
    }]);
    expect(reader.readVideos).toHaveBeenCalledWith(["CCCCCCCCCCC", "BBBBBBBBBBB"]);
    expect(repo.completeSupplemental).toHaveBeenCalledWith({
      id: "monitor-1",
      expectedVersion: 0,
      monitorGeneration: 0,
      now: 700,
    });
  });

  it("revokes collection authority, pauses the monitor, and requests unsubscribe", async () => {
    const repo = repository();
    const approved = monitor({
      status: "paused",
      version: 3,
      automationApproval: {
        scope: "candidate_collection",
        status: "revoked",
        operatorReference: "operator-proof",
        approvalReference: "rights-ticket",
        revocationProcedure: "pause and unsubscribe",
        approvedByUserId: "admin-1",
        approvedAt: 100,
        revokedByUserId: "admin-2",
        revokedAt: 800,
        version: 2,
      },
      subscription: {
        id: "subscription-1",
        status: "active",
        pendingMode: null,
        secretVersion: 1,
        requestedAt: 100,
        verifiedAt: 110,
        leaseExpiresAt: 1_000,
        lastNotificationAt: null,
        lastErrorCode: null,
        effectiveActive: true,
        recoveryReason: null,
        version: 1,
      },
    });
    repo.revokeApproval.mockResolvedValueOnce(approved);
    repo.get
      .mockResolvedValueOnce(monitor({
        version: 2,
        automationApproval: {
          scope: "candidate_collection",
          status: "approved",
          operatorReference: "operator-proof",
          approvalReference: "rights-ticket",
          revocationProcedure: "pause and unsubscribe",
          approvedByUserId: "admin-1",
          approvedAt: 100,
          revokedByUserId: null,
          revokedAt: null,
          version: 1,
        },
      }))
      .mockResolvedValueOnce(approved);
    const unsubscribe = vi.fn(async () => undefined);
    const service = new ChannelMonitorService(
      repo,
      youtube(),
      () => "event-revoke",
      () => 800,
      unsubscribe,
    );

    await service.revokeApproval("monitor-1", 2, 1, "admin-2");

    expect(repo.revokeApproval).toHaveBeenCalledWith({
      id: "monitor-1",
      expectedVersion: 2,
      expectedApprovalVersion: 1,
      actorUserId: "admin-2",
      approvalEventId: "event-revoke",
      monitorEventId: "event-revoke",
      now: 800,
    });
    expect(unsubscribe).toHaveBeenCalledWith("monitor-1", "admin-2");
  });

  it("blocks deletion and target changes until the current lease is released", async () => {
    const repo = repository();
    repo.get.mockResolvedValue(monitor({
      subscription: {
        id: "subscription-1",
        status: "active",
        pendingMode: null,
        secretVersion: 1,
        requestedAt: 100,
        verifiedAt: 110,
        leaseExpiresAt: 1_000,
        lastNotificationAt: null,
        lastErrorCode: null,
        effectiveActive: true,
        recoveryReason: null,
        version: 1,
      },
    }));
    const service = new ChannelMonitorService(repo, youtube());

    await expect(service.remove("monitor-1", 0, "admin-1"))
      .rejects.toMatchObject({ code: "validation_failed" });
    await expect(service.updateTarget(
      "monitor-1",
      0,
      "UC2222222222222222222222",
      "admin-1",
    )).rejects.toMatchObject({ code: "validation_failed" });
    expect(repo.remove).not.toHaveBeenCalled();
    expect(repo.updateTarget).not.toHaveBeenCalled();

    repo.get.mockResolvedValue(monitor({
      subscription: {
        id: "subscription-1",
        status: "failed",
        pendingMode: null,
        secretVersion: 1,
        requestedAt: 100,
        verifiedAt: null,
        leaseExpiresAt: null,
        lastNotificationAt: null,
        lastErrorCode: "hub_request_failed",
        effectiveActive: false,
        recoveryReason: "status_failed",
        version: 2,
      },
    }));
    await expect(service.remove("monitor-1", 0, "admin-1"))
      .rejects.toMatchObject({ code: "validation_failed" });
  });
});
