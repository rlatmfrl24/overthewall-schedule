import type {
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayPlaylistPreflightRequest,
} from "@contracts/otw-play";
import {
  decodeIngestionItemCursor,
  encodeIngestionItemCursor,
} from "../domain/ingestion-cursor";
import {
  canonicalYouTubePlaylistUrl,
  extractYouTubePlaylistId,
} from "../domain/youtube-playlist-id";
import type {
  IngestionRepository,
  OtwPlayIngestionQueueMessage,
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

  constructor(
    repository: IngestionRepository,
    youtube: OtwPlayYouTubeIngestionReader,
    queue: IngestionQueueSender,
    createId: () => string,
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.queue = queue;
    this.createId = createId;
    this.clock = clock;
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
}
