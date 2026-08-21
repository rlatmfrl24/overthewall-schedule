import type {
  OtwPlayConvertIngestionCandidatesRequest,
  OtwPlayIngestionConversionOutcome,
  OtwPlayIngestionConversionResultDto,
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayPlaylistPreflightRequest,
  OtwPlayUpdateIngestionCandidateRequest,
} from "@contracts/otw-play";
import { AdminCatalogServiceError } from "./admin-catalog-service";
import type { AdminCatalogService } from "./admin-catalog-service";
import {
  AdminCatalogRepositoryError,
  type AdminCatalogActor,
} from "./ports/admin-catalog-repository";
import {
  decodeIngestionItemCursor,
  encodeIngestionItemCursor,
} from "../domain/ingestion-cursor";
import {
  canonicalYouTubePlaylistUrl,
  extractYouTubePlaylistId,
} from "../domain/youtube-playlist-id";
import {
  IngestionRepositoryError,
  type IngestionRepository,
  type OtwPlayIngestionQueueMessage,
} from "./ports/ingestion-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeIngestionReader,
} from "./ports/youtube-metadata";

const PLAYLIST_HARD_CAP = 5_000;
const PAGE_SIZE = 50;

export class IngestionServiceError extends Error {
  readonly code:
    | "invalid_request"
    | "not_found"
    | "limit_exceeded"
    | "unavailable";

  constructor(
    code: IngestionServiceError["code"],
    message: string,
  ) {
    super(message);
    this.name = "IngestionServiceError";
    this.code = code;
  }
}

export class IngestionProcessingError extends Error {
  readonly errorCode: string;
  readonly retryable: boolean;
  readonly nextRetryAt: number | null;

  constructor(
    errorCode: string,
    retryable: boolean,
    nextRetryAt: number | null,
  ) {
    super(`Ingestion processing failed: ${errorCode}`);
    this.name = "IngestionProcessingError";
    this.errorCode = errorCode;
    this.retryable = retryable;
    this.nextRetryAt = nextRetryAt;
  }
}

export interface IngestionQueueSender {
  send(message: OtwPlayIngestionQueueMessage): Promise<void>;
}

const requestedCount = (
  itemCount: number,
  input: OtwPlayPlaylistPreflightRequest,
) => input.mode === "recent"
  ? Math.min(itemCount, input.recentLimit ?? PAGE_SIZE)
  : Math.min(itemCount, PLAYLIST_HARD_CAP);

export class IngestionService {
  private readonly repository: IngestionRepository;
  private readonly youtube: OtwPlayYouTubeIngestionReader;
  private readonly queue: IngestionQueueSender;
  private readonly createId: () => string;
  private readonly clock: () => number;
  private readonly catalog: AdminCatalogService | null;

  constructor(
    repository: IngestionRepository,
    youtube: OtwPlayYouTubeIngestionReader,
    queue: IngestionQueueSender,
    createId: () => string,
    clock: () => number = Date.now,
    catalog: AdminCatalogService | null = null,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.queue = queue;
    this.createId = createId;
    this.clock = clock;
    this.catalog = catalog;
  }

  async preflight(input: OtwPlayPlaylistPreflightRequest) {
    const playlistId = extractYouTubePlaylistId(input.playlistUrl);
    if (!playlistId) {
      throw new IngestionServiceError(
        "invalid_request",
        "A valid YouTube playlist URL or ID is required",
      );
    }
    const summary = await this.youtube.readPlaylistSummary(playlistId);
    if (!summary) {
      throw new IngestionServiceError(
        "not_found",
        "The playlist is private, unavailable, or does not exist",
      );
    }
    const count = requestedCount(summary.itemCount, input);
    return {
      playlistId,
      canonicalUrl: canonicalYouTubePlaylistUrl(playlistId),
      title: summary.title,
      ownerChannelId: summary.ownerChannelId,
      ownerChannelTitle: summary.ownerChannelTitle,
      itemCount: summary.itemCount,
      privacyStatus: summary.privacyStatus,
      requestedItemCount: count,
      estimatedPageCount: Math.ceil(count / PAGE_SIZE),
      estimatedVideoBatchCount: Math.ceil(count / PAGE_SIZE),
      hardCap: 5_000 as const,
      requiresSplit:
        input.mode === "all_new" && summary.itemCount > PLAYLIST_HARD_CAP,
      previousImport: await this.repository.findPreviousImport(playlistId),
    };
  }

  async createJob(
    actorUserId: string,
    input: OtwPlayCreatePlaylistImportRequest,
  ) {
    const preflight = await this.preflight(input);
    if (preflight.requiresSplit) {
      throw new IngestionServiceError(
        "limit_exceeded",
        "The playlist exceeds 5,000 items and must be imported in an explicit range",
      );
    }
    const created = await this.repository.createJob({
      jobId: this.createId(),
      actorUserId,
      input,
      preflight,
      now: this.clock(),
    });
    try {
      await this.queue.send(created.message);
    } catch {
      const now = this.clock();
      await this.repository.recordMessageFailure(
        created.message.idempotencyKey,
        "queue_enqueue_failed",
        now + 60_000,
        now,
      );
    }
    return this.repository.getJob(created.job.id);
  }

  getJob(jobId: string) {
    return this.repository.getJob(jobId);
  }

  async listItems(jobId: string, limit: number, cursorValue: string | null) {
    const result = await this.repository.listItems(
      jobId,
      limit,
      cursorValue ? decodeIngestionItemCursor(cursorValue) : null,
    );
    const last = result.page.items.at(-1);
    const page: OtwPlayIngestionCandidatePageDto = {
      ...result.page,
      nextCursor:
        result.hasMore && last
          ? encodeIngestionItemCursor({
              position: last.playlistPosition,
              id: last.originId,
            })
          : null,
    };
    return page;
  }

  async process(message: OtwPlayIngestionQueueMessage) {
    if (message.schemaVersion !== 1) {
      throw new IngestionProcessingError("invalid_message", false, null);
    }
    const stored = await this.repository.readMessage(message.idempotencyKey);
    if (stored.jobId !== message.jobId) {
      throw new IngestionProcessingError("invalid_message", false, null);
    }
    if (stored.status !== "pending") return;
    try {
      if (stored.kind === "playlist_page") {
        const job = await this.repository.getJob(stored.jobId);
        const page = await this.youtube.readPlaylistPage(
          job.playlistId,
          stored.pageToken,
        );
        const children = await this.repository.recordPlaylistPage(
          stored,
          page,
          this.clock(),
        );
        for (const child of children) {
          try {
            await this.queue.send(child);
          } catch {
            const now = this.clock();
            await this.repository.recordMessageFailure(
              child.idempotencyKey,
              "queue_enqueue_failed",
              now + 60_000,
              now,
            );
          }
        }
        return;
      }
      const observations = await this.youtube.readVideos(stored.videoIds);
      await this.repository.recordVideoBatch(stored, observations, this.clock());
    } catch (error) {
      const now = this.clock();
      const youtubeError = error instanceof OtwPlayYouTubeMetadataError
        ? error
        : null;
      const errorCode = youtubeError?.code ?? "ingestion_internal";
      const retryable = youtubeError?.retryable ?? true;
      const nextRetryAt = retryable
        ? now + (youtubeError?.retryAfterMs ?? 60_000)
        : null;
      await this.repository.recordMessageFailure(
        stored.idempotencyKey,
        errorCode,
        nextRetryAt,
        now,
      );
      throw new IngestionProcessingError(errorCode, retryable, nextRetryAt);
    }
  }

  markDeadLetter(message: OtwPlayIngestionQueueMessage, errorCode: string) {
    return this.repository.markMessageDeadLetter(
      message.idempotencyKey,
      errorCode,
      this.clock(),
    );
  }

  async requeuePending(limit = 100) {
    const pending = await this.repository.listPendingMessages(this.clock(), limit);
    let enqueued = 0;
    for (const message of pending) {
      try {
        await this.queue.send(message);
        enqueued += 1;
      } catch {
        break;
      }
    }
    return enqueued;
  }

  clearExpiredApiData(limit = 100) {
    return this.repository.clearExpiredApiData(this.clock(), limit);
  }

  updateCandidate(
    candidateId: string,
    input: OtwPlayUpdateIngestionCandidateRequest,
    actor: AdminCatalogActor,
  ) {
    const command = {
      candidateId,
      expectedVersion: input.expectedVersion,
      actorUserId: actor.userId,
      eventId: this.createId(),
      now: this.clock(),
    };
    if (input.action === "save") {
      return this.repository.saveCandidateReview({ ...command, input: input.input });
    }
    if (input.action === "ignore") {
      return this.repository.ignoreCandidate(command);
    }
    return this.refreshCandidate(candidateId, input.expectedVersion, actor);
  }

  private async refreshCandidate(
    candidateId: string,
    expectedVersion: number,
    actor: AdminCatalogActor,
  ) {
    const candidate = await this.repository.readReviewCandidate(null, candidateId);
    if (candidate.version !== expectedVersion) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Ingestion candidate changed during metadata refresh",
      );
    }
    const observation = (await this.youtube.readVideos([candidate.videoId]))[0];
    if (!observation || observation.videoId !== candidate.videoId) {
      throw new IngestionServiceError(
        "unavailable",
        "YouTube candidate metadata is unavailable",
      );
    }
    return this.repository.refreshCandidateMetadata({
      candidateId,
      expectedVersion,
      observation,
      actorUserId: actor.userId,
      eventId: this.createId(),
      now: this.clock(),
    });
  }

  private conversionOutcome(error: unknown): {
    outcome: Exclude<OtwPlayIngestionConversionOutcome, "created" | "duplicate">;
    errorCode: string;
  } {
    if (
      (error instanceof IngestionRepositoryError && error.code === "stale_message") ||
      (error instanceof AdminCatalogRepositoryError && error.code === "stale_write") ||
      (error instanceof AdminCatalogServiceError && error.code === "stale_write")
    ) {
      return { outcome: "stale", errorCode: "stale_write" };
    }
    if (
      error instanceof OtwPlayYouTubeMetadataError && error.retryable ||
      error instanceof AdminCatalogServiceError &&
        error.code === "external_service_unavailable" ||
      error instanceof AdminCatalogRepositoryError && error.code === "unavailable"
    ) {
      return { outcome: "retryable_failed", errorCode: "external_service_unavailable" };
    }
    return { outcome: "validation_failed", errorCode: "validation_failed" };
  }

  async convertCandidates(
    jobId: string,
    input: OtwPlayConvertIngestionCandidatesRequest,
    actor: AdminCatalogActor,
  ) {
    if (!this.catalog) {
      throw new IngestionServiceError(
        "unavailable",
        "Catalog draft conversion is unavailable",
      );
    }
    await this.repository.getJob(jobId);
    const results: OtwPlayIngestionConversionResultDto[] = [];
    for (const selection of input.candidates) {
      try {
        const candidate = await this.repository.readReviewCandidate(
          jobId,
          selection.id,
        );
        if (
          candidate.version !== selection.expectedVersion ||
          candidate.status !== "ready" ||
          candidate.classification !== "eligible" ||
          !candidate.reviewInput
        ) {
          throw new IngestionRepositoryError(
            candidate.version !== selection.expectedVersion
              ? "stale_message"
              : "validation_failed",
            "Candidate is not ready for draft conversion",
          );
        }
        const youtubeUrl = `https://www.youtube.com/watch?v=${candidate.videoId}`;
        const preflight = await this.catalog.preflightCatalogEntry({
          youtubeUrl,
          startSeconds: 0,
        });
        if (preflight.duplicate) {
          await this.repository.recordConversionOutcome({
            jobId,
            candidateId: candidate.id,
            expectedVersion: candidate.version,
            outcome: "duplicate",
            performanceId: preflight.duplicate.performanceId,
            errorCode: "duplicate_source",
            actorUserId: actor.userId,
            eventId: this.createId(),
            now: this.clock(),
          });
          results.push({
            candidateId: candidate.id,
            outcome: "duplicate",
            performanceId: preflight.duplicate.performanceId,
            errorCode: "duplicate_source",
          });
          continue;
        }
        if (
          preflight.channel.state !== "approved" ||
          !preflight.channel.catalogChannelId ||
          preflight.channel.catalogChannelId !== candidate.catalogChannelId
        ) {
          throw new IngestionRepositoryError(
            "validation_failed",
            "Candidate channel is not approved and active",
          );
        }
        const created = await this.catalog.createCatalogEntry(
          {
            expectedCatalogRevision: preflight.catalogRevision,
            youtubeUrl,
            startSeconds: 0,
            endSeconds: null,
            ...candidate.reviewInput,
            channel: {
              kind: "existing",
              channelId: preflight.channel.catalogChannelId,
            },
            publicationTarget: "draft",
          },
          actor,
          {
            jobId,
            candidateId: candidate.id,
            expectedVersion: candidate.version,
            eventId: this.createId(),
          },
        );
        results.push({
          candidateId: candidate.id,
          outcome: "created",
          performanceId: created.data.performance.id,
          errorCode: null,
        });
      } catch (error) {
        if (
          error instanceof AdminCatalogRepositoryError &&
          error.code === "duplicate_source"
        ) {
          const performanceId = error.fields?.performanceId ?? null;
          await this.repository.recordConversionOutcome({
            jobId,
            candidateId: selection.id,
            expectedVersion: selection.expectedVersion,
            outcome: "duplicate",
            performanceId,
            errorCode: "duplicate_source",
            actorUserId: actor.userId,
            eventId: this.createId(),
            now: this.clock(),
          });
          results.push({
            candidateId: selection.id,
            outcome: "duplicate",
            performanceId,
            errorCode: "duplicate_source",
          });
          continue;
        }
        const failure = this.conversionOutcome(error);
        await this.repository.recordConversionOutcome({
          jobId,
          candidateId: selection.id,
          expectedVersion: selection.expectedVersion,
          outcome: failure.outcome,
          performanceId: null,
          errorCode: failure.errorCode,
          actorUserId: actor.userId,
          eventId: this.createId(),
          now: this.clock(),
        });
        results.push({
          candidateId: selection.id,
          outcome: failure.outcome,
          performanceId: null,
          errorCode: failure.errorCode,
        });
      }
    }
    return { results };
  }

  async retryJob(jobId: string, actor: AdminCatalogActor) {
    const messages = await this.repository.retryJob({
      jobId,
      actorUserId: actor.userId,
      eventId: this.createId(),
      now: this.clock(),
    });
    let enqueued = 0;
    for (const message of messages) {
      try {
        await this.queue.send(message);
        enqueued += 1;
      } catch {
        const now = this.clock();
        await this.repository.recordMessageFailure(
          message.idempotencyKey,
          "queue_enqueue_failed",
          now + 60_000,
          now,
        );
      }
    }
    return { job: await this.repository.getJob(jobId), enqueued };
  }
}
