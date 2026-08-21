import { describe, expect, it, vi } from "vitest";
import type {
  OtwPlayIngestionJobDto,
  OtwPlayIngestionReviewInput,
} from "@contracts/otw-play";
import {
  AdminCatalogServiceError,
  type AdminCatalogService,
} from "./admin-catalog-service";
import {
  IngestionProcessingError,
  IngestionService,
  IngestionServiceError,
} from "./ingestion-service";
import type {
  IngestionRepository,
  IngestionReviewCandidate,
  OtwPlayIngestionQueueMessage,
} from "./ports/ingestion-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeIngestionReader,
} from "./ports/youtube-metadata";

const job = (overrides: Partial<OtwPlayIngestionJobDto> = {}): OtwPlayIngestionJobDto => ({
  id: "job-1",
  playlistId: "PL1234567890",
  playlistTitle: "Playlist",
  playlistOwnerChannelId: "UC123",
  playlistOwnerChannelTitle: "Official",
  mode: "all_new",
  requestedItemCount: 51,
  status: "queued",
  counts: {
    discovered: 0,
    metadataChecked: 0,
    eligible: 0,
    existingCatalog: 0,
    existingProposal: 0,
    existingCandidate: 0,
    channelReview: 0,
    unavailable: 0,
    policyBlocked: 0,
    playlistDuplicate: 0,
    retryPending: 0,
    permanentError: 0,
  },
  lastErrorCode: null,
  nextRetryAt: null,
  createdAt: 100,
  startedAt: null,
  completedAt: null,
  updatedAt: 100,
  ...overrides,
});

const repository = () => ({
  findPreviousImport: vi.fn(async () => null),
  createJob: vi.fn(async () => ({
    job: job(),
    message: { schemaVersion: 1 as const, jobId: "job-1", idempotencyKey: "message-1" },
  })),
  getJob: vi.fn(async () => job()),
  listItems: vi.fn(async () => ({ page: { items: [], nextCursor: null }, hasMore: false })),
  readMessage: vi.fn(async () => ({
    jobId: "job-1",
    idempotencyKey: "message-1",
    kind: "playlist_page" as const,
    pageToken: null,
    videoIds: [],
    status: "pending" as const,
    attempts: 0,
  })),
  recordPlaylistPage: vi.fn(
    async (): Promise<OtwPlayIngestionQueueMessage[]> => [],
  ),
  recordVideoBatch: vi.fn(async () => undefined),
  recordMessageFailure: vi.fn(async () => undefined),
  markMessageDeadLetter: vi.fn(async () => undefined),
  listPendingMessages: vi.fn(async () => []),
  clearExpiredApiData: vi.fn(async () => 0),
  readReviewCandidate: vi.fn(async (
    _jobId: string | null,
    _candidateId: string,
  ): Promise<IngestionReviewCandidate> => {
    void _jobId;
    void _candidateId;
    return ({
    id: "youtube:AAAAAAAAAAA",
    version: 1,
    videoId: "AAAAAAAAAAA",
    status: "ready" as const,
    classification: "eligible" as const,
    catalogChannelId: "channel-1",
    reviewInput: null as OtwPlayIngestionReviewInput | null,
    linkedPerformanceId: null,
    });
  }),
  saveCandidateReview: vi.fn(async () => ({
    id: "youtube:AAAAAAAAAAA",
    version: 2,
    videoId: "AAAAAAAAAAA",
    status: "ready" as const,
    classification: "eligible" as const,
    catalogChannelId: "channel-1",
    reviewInput: null,
    linkedPerformanceId: null,
  })),
  ignoreCandidate: vi.fn(async () => ({
    id: "youtube:AAAAAAAAAAA",
    version: 2,
    videoId: "AAAAAAAAAAA",
    status: "ignored" as const,
    classification: "eligible" as const,
    catalogChannelId: "channel-1",
    reviewInput: null,
    linkedPerformanceId: null,
  })),
  refreshCandidateMetadata: vi.fn(async () => ({
    id: "youtube:AAAAAAAAAAA",
    version: 2,
    videoId: "AAAAAAAAAAA",
    status: "needs_input" as const,
    classification: "eligible" as const,
    catalogChannelId: "channel-1",
    reviewInput: null,
    linkedPerformanceId: null,
  })),
  recordConversionOutcome: vi.fn(async () => undefined),
  retryJob: vi.fn(async () => []),
}) satisfies IngestionRepository;

const youtube = (itemCount = 51) => ({
  readPlaylistSummary: vi.fn(async () => ({
    playlistId: "PL1234567890",
    title: "Playlist",
    ownerChannelId: "UC123",
    ownerChannelTitle: "Official",
    itemCount,
    privacyStatus: "public" as const,
  })),
  readPlaylistPage: vi.fn(async () => ({ items: [], nextPageToken: null })),
  readVideos: vi.fn(async () => []),
  readVideo: vi.fn(async () => null),
  readChannel: vi.fn(async () => null),
}) satisfies OtwPlayYouTubeIngestionReader;

describe("IngestionService", () => {
  it("preflights bounded 50-item pages and rejects an implicit 5,001-item truncation", async () => {
    const repo = repository();
    const service = new IngestionService(
      repo,
      youtube(5_001),
      { send: vi.fn(async () => undefined) },
      () => "job-1",
      () => 100,
    );
    await expect(service.preflight({
      playlistUrl: "PL1234567890",
      mode: "all_new",
    })).resolves.toMatchObject({
      itemCount: 5_001,
      requestedItemCount: 5_000,
      estimatedPageCount: 100,
      estimatedVideoBatchCount: 100,
      requiresSplit: true,
    });
    await expect(service.createJob("admin-1", {
      playlistUrl: "PL1234567890",
      mode: "all_new",
      idempotencyKey: "request-1",
    })).rejects.toBeInstanceOf(IngestionServiceError);
    expect(repo.createJob).not.toHaveBeenCalled();
  });

  it("persists the job before enqueue and returns authoritative readback", async () => {
    const repo = repository();
    const send = vi.fn(async () => undefined);
    const service = new IngestionService(
      repo,
      youtube(),
      { send },
      () => "job-1",
      () => 100,
    );
    await expect(service.createJob("admin-1", {
      playlistUrl: "PL1234567890",
      mode: "recent",
      recentLimit: 51,
      idempotencyKey: "request-1",
    })).resolves.toMatchObject({ id: "job-1" });
    expect(repo.createJob).toHaveBeenCalledBefore(send);
    expect(repo.getJob).toHaveBeenCalledWith("job-1");
  });

  it("creates child outbox messages before enqueueing them", async () => {
    const repo = repository();
    const child = {
      schemaVersion: 1 as const,
      jobId: "job-1",
      idempotencyKey: "batch-1",
    };
    repo.recordPlaylistPage.mockResolvedValueOnce([child]);
    const send = vi.fn(async () => undefined);
    const service = new IngestionService(
      repo,
      youtube(),
      { send },
      () => "job-1",
      () => 100,
    );
    await service.process({
      schemaVersion: 1,
      jobId: "job-1",
      idempotencyKey: "message-1",
    });
    expect(repo.recordPlaylistPage).toHaveBeenCalledBefore(send);
    expect(send).toHaveBeenCalledWith(child);
  });

  it("records safe retry state for a retryable YouTube failure", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readPlaylistPage.mockRejectedValueOnce(
      new OtwPlayYouTubeMetadataError(
        "secret upstream detail",
        "quota_exceeded",
        true,
        120_000,
      ),
    );
    const service = new IngestionService(
      repo,
      reader,
      { send: vi.fn(async () => undefined) },
      () => "job-1",
      () => 1_000,
    );
    await expect(service.process({
      schemaVersion: 1,
      jobId: "job-1",
      idempotencyKey: "message-1",
    })).rejects.toBeInstanceOf(IngestionProcessingError);
    expect(repo.recordMessageFailure).toHaveBeenCalledWith(
      "message-1",
      "quota_exceeded",
      121_000,
      1_000,
    );
  });

  it("converts ready rows independently as drafts and records only failed rows for retry", async () => {
    const repo = repository();
    const reviewInput = {
      song: { kind: "existing" as const, songId: "song-1" },
      participants: [{
        subject: { kind: "entity" as const, entityId: "entity-1" },
        participantRole: "vocal" as const,
        creditOrder: 0,
      }],
      relationType: "cover" as const,
      releaseType: "official_video" as const,
      participationType: "solo" as const,
      internalNote: null,
    };
    repo.readReviewCandidate.mockImplementation(async (
      _jobId: string | null,
      candidateId: string,
    ) => ({
      id: candidateId,
      version: 1,
      videoId: candidateId === "candidate-1" ? "AAAAAAAAAAA" : "BBBBBBBBBBB",
      status: "ready" as const,
      classification: "eligible" as const,
      catalogChannelId: "channel-1",
      reviewInput,
      linkedPerformanceId: null,
    }));
    const preflightCatalogEntry = vi.fn()
      .mockResolvedValueOnce({
        catalogRevision: 3,
        channel: {
          state: "approved",
          catalogChannelId: "channel-1",
        },
        duplicate: null,
      })
      .mockRejectedValueOnce(
        new AdminCatalogServiceError(
          "external_service_unavailable",
          "upstream unavailable",
        ),
      );
    const createCatalogEntry = vi.fn(async () => ({
      data: { performance: { id: "performance-1" } },
      catalogRevision: 4,
    }));
    const catalog = {
      preflightCatalogEntry,
      createCatalogEntry,
    } as unknown as AdminCatalogService;
    const service = new IngestionService(
      repo,
      youtube(),
      { send: vi.fn(async () => undefined) },
      () => `event-${Math.random()}`,
      () => 100,
      catalog,
    );
    await expect(service.convertCandidates("job-1", {
      candidates: [
        { id: "candidate-1", expectedVersion: 1 },
        { id: "candidate-2", expectedVersion: 1 },
      ],
    }, {
      userId: "admin-1",
      displayName: "Admin",
      ipAddress: null,
    })).resolves.toEqual({
      results: [
        {
          candidateId: "candidate-1",
          outcome: "created",
          performanceId: "performance-1",
          errorCode: null,
        },
        {
          candidateId: "candidate-2",
          outcome: "retryable_failed",
          performanceId: null,
          errorCode: "external_service_unavailable",
        },
      ],
    });
    expect(createCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationTarget: "draft",
        channel: { kind: "existing", channelId: "channel-1" },
      }),
      expect.objectContaining({ userId: "admin-1" }),
      expect.objectContaining({
        jobId: "job-1",
        candidateId: "candidate-1",
        expectedVersion: 1,
      }),
    );
    expect(repo.recordConversionOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateId: "candidate-2",
        outcome: "retryable_failed",
      }),
    );
  });
});
