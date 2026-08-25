import type {
  OtwPlayConvertIngestionCandidatesRequest,
  OtwPlayIngestionConversionOutcome,
  OtwPlayIngestionConversionResultDto,
  OtwPlayCreatePlaylistImportRequest,
  OtwPlayIgnoreIngestionCandidatesRequest,
  OtwPlayIngestionIgnoreResultDto,
  OtwPlayIngestionCandidatePageDto,
  OtwPlayIngestionItemFilters,
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
  IngestionCursorError,
} from "../domain/ingestion-cursor";
import { isOtwPlayIngestionOfficialChannelRole } from "../domain/ingestion-channel-policy";
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
  : input.rangeStart !== undefined
    ? Math.min(
        Math.max(itemCount - input.rangeStart, 0),
        input.rangeLimit ?? PLAYLIST_HARD_CAP,
      )
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
    const rangeStartPosition = input.mode === "all_new"
      ? input.rangeStart ?? 0
      : 0;
    const rangeEndExclusive = rangeStartPosition + count;
    return {
      playlistId,
      canonicalUrl: canonicalYouTubePlaylistUrl(playlistId),
      title: summary.title,
      ownerChannelId: summary.ownerChannelId,
      ownerChannelTitle: summary.ownerChannelTitle,
      itemCount: summary.itemCount,
      privacyStatus: summary.privacyStatus,
      rangeStartPosition,
      rangeEndExclusive,
      nextRangeStart:
        rangeEndExclusive < summary.itemCount ? rangeEndExclusive : null,
      requestedItemCount: count,
      estimatedPageCount: Math.ceil(rangeEndExclusive / PAGE_SIZE),
      estimatedVideoBatchCount: Math.ceil(count / PAGE_SIZE),
      hardCap: 5_000 as const,
      requiresSplit:
        input.mode === "all_new" && input.rangeStart === undefined &&
        summary.itemCount > PLAYLIST_HARD_CAP,
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
      eventId: this.createId(),
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

  listJobs(limit = 100) {
    return this.repository.listJobs(Math.max(1, Math.min(100, limit)));
  }

  async listItems(
    jobId: string,
    limit: number,
    cursorValue: string | null,
    filters: OtwPlayIngestionItemFilters = {},
  ) {
    const cursor = cursorValue ? decodeIngestionItemCursor(cursorValue) : null;
    if (
      cursor &&
      (cursor.classification !== (filters.classification ?? null) ||
        cursor.status !== (filters.status ?? null))
    ) {
      throw new IngestionCursorError();
    }
    const result = await this.repository.listItems(
      jobId,
      limit,
      cursor,
      filters,
    );
    const last = result.page.items.at(-1);
    const page: OtwPlayIngestionCandidatePageDto = {
      ...result.page,
      nextCursor:
        result.hasMore && last
          ? encodeIngestionItemCursor({
              position: last.playlistPosition,
              id: last.originId,
              classification: filters.classification ?? null,
              status: filters.status ?? null,
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
      return this.repository.saveCandidateReview({
        ...command,
        ...(input.expectedReviewInput !== undefined
          ? { expectedReviewInput: input.expectedReviewInput }
          : {}),
        ...(input.expectedReviewStatus !== undefined
          ? { expectedReviewStatus: input.expectedReviewStatus }
          : {}),
        input: input.input,
      });
    }
    if (input.action === "ignore") {
      return this.repository.ignoreCandidate(command);
    }
    if (input.action === "approve_channel") {
      return this.approveCandidateChannel(
        candidateId,
        input.expectedVersion,
        input.channel,
        actor,
      );
    }
    return this.refreshCandidate(candidateId, input.expectedVersion, actor);
  }

  private async approveCandidateChannel(
    candidateId: string,
    expectedVersion: number,
    channelInput: Extract<
      OtwPlayUpdateIngestionCandidateRequest,
      { action: "approve_channel" }
    >["channel"],
    actor: AdminCatalogActor,
  ) {
    if (!this.catalog) {
      throw new IngestionServiceError(
        "unavailable",
        "Official channel approval is unavailable",
      );
    }
    const candidate = await this.repository.readReviewCandidate(
      null,
      candidateId,
    );
    if (candidate.version !== expectedVersion) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Ingestion candidate changed during channel approval",
      );
    }
    if (candidate.status === "converted" || candidate.status === "ignored") {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Completed ingestion candidates cannot approve a channel",
      );
    }

    try {
      const preflight = await this.catalog.preflightCatalogEntry({
        youtubeUrl: `https://www.youtube.com/watch?v=${candidate.videoId}`,
        startSeconds: 0,
      });
      const snapshot = await this.catalog.readCatalog();
      const ownershipEntities = channelInput.entityIds.map((entityId) =>
        snapshot.entities.find((entity) => entity.id === entityId)
      );
      const ownershipIsValid = channelInput.ownershipKind === "otw_official"
        ? channelInput.channelRole === "otw_official" &&
          channelInput.entityIds.length === 0
        : channelInput.ownershipKind === "member"
          ? ["member_music", "member_main"].includes(channelInput.channelRole) &&
            ownershipEntities.length > 0 &&
            ownershipEntities.every((entity) =>
              entity?.archivedAt === null && entity.memberUid !== null
            )
          : channelInput.ownershipKind === "external"
            ? channelInput.channelRole === "project_official" &&
              channelInput.externalApprovalConfirmed === true &&
              ownershipEntities.length > 0 &&
              ownershipEntities.every((entity) =>
                entity?.archivedAt === null && entity.memberUid === null
              )
            : false;
      if (!ownershipIsValid) {
        throw new IngestionRepositoryError(
          "validation_failed",
          "Official channel ownership does not match the selected approval path",
        );
      }
      const existing = snapshot.channels.find(
        (channel) =>
          channel.provider === "youtube" &&
          channel.externalChannelId === preflight.video.channelId,
      );
      if (existing?.verificationStatus === "revoked") {
        throw new IngestionRepositoryError(
          "validation_failed",
          "A revoked official channel must be reviewed in channel management",
        );
      }

      const createdOrExisting = existing ?? (await this.catalog.createChannel({
        externalChannelId: preflight.video.channelId,
        displayName: preflight.video.channelTitle,
        channelRole: channelInput.channelRole,
        entityIds: channelInput.entityIds,
      }, actor)).data;
      const expectedOwnerIds = new Set<string>(channelInput.entityIds);
      const sameOwners = createdOrExisting.entityIds.length ===
          channelInput.entityIds.length &&
        createdOrExisting.entityIds.every((id) =>
          expectedOwnerIds.has(id)
        );
      if (
        createdOrExisting.verificationStatus !== "approved" ||
        !createdOrExisting.active ||
        createdOrExisting.channelRole !== channelInput.channelRole ||
        !sameOwners
      ) {
        await this.catalog.updateChannel({
          id: createdOrExisting.id,
          externalChannelId: preflight.video.channelId,
          displayName: preflight.video.channelTitle,
          channelRole: channelInput.channelRole,
          entityIds: channelInput.entityIds,
          verificationStatus: "approved",
          active: true,
          expectedVersion: createdOrExisting.version,
        }, actor);
      }
    } catch (error) {
      if (error instanceof IngestionRepositoryError) throw error;
      if (
        error instanceof AdminCatalogRepositoryError ||
        error instanceof AdminCatalogServiceError
      ) {
        if (error.code === "stale_write") {
          throw new IngestionRepositoryError(
            "stale_message",
            "Official channel changed during approval",
          );
        }
        if (
          error.code === "external_service_unavailable" ||
          error.code === "unavailable"
        ) {
          throw new IngestionServiceError(
            "unavailable",
            "Official channel approval is temporarily unavailable",
          );
        }
        throw new IngestionRepositoryError(
          "validation_failed",
          "Official channel approval could not be completed",
        );
      }
      throw error;
    }

    const latest = await this.repository.readReviewCandidate(null, candidateId);
    return this.refreshCandidate(candidateId, latest.version, actor);
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

  async ignoreCandidates(
    jobId: string,
    input: OtwPlayIgnoreIngestionCandidatesRequest,
    actor: AdminCatalogActor,
  ) {
    await this.repository.getJob(jobId);
    const results: OtwPlayIngestionIgnoreResultDto[] = [];
    for (const selection of input.candidates) {
      try {
        const candidate = await this.repository.readReviewCandidate(
          jobId,
          selection.id,
        );
        if (candidate.version !== selection.expectedVersion) {
          throw new IngestionRepositoryError(
            "stale_message",
            "Ingestion candidate changed during bulk ignore",
          );
        }
        if (candidate.status === "converted" || candidate.status === "ignored") {
          throw new IngestionRepositoryError(
            "validation_failed",
            "Ingestion candidate cannot be ignored",
          );
        }
        await this.repository.ignoreCandidate({
          candidateId: candidate.id,
          expectedVersion: candidate.version,
          actorUserId: actor.userId,
          eventId: this.createId(),
          now: this.clock(),
        });
        results.push({
          candidateId: candidate.id,
          outcome: "ignored",
          errorCode: null,
        });
      } catch (error) {
        const stale = error instanceof IngestionRepositoryError &&
          error.code === "stale_message";
        results.push({
          candidateId: selection.id,
          outcome: stale ? "stale" : "failed",
          errorCode: stale ? "stale_write" : "validation_failed",
        });
      }
    }
    return { results };
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
          candidate.candidateKind !== "official_video" ||
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
          const outcome = await this.repository.recordConversionOutcome({
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
            outcome,
            performanceId: preflight.duplicate.performanceId,
            errorCode: outcome === "duplicate" ? "duplicate_source" : "stale_write",
          });
          continue;
        }
        if (
          preflight.channel.state !== "approved" ||
          !preflight.channel.catalogChannelId ||
          preflight.channel.catalogChannelId !== candidate.catalogChannelId ||
          !isOtwPlayIngestionOfficialChannelRole(preflight.channel.channelRole)
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
          const outcome = await this.repository.recordConversionOutcome({
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
            outcome,
            performanceId,
            errorCode: outcome === "duplicate" ? "duplicate_source" : "stale_write",
          });
          continue;
        }
        const failure = this.conversionOutcome(error);
        const outcome = await this.repository.recordConversionOutcome({
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
          outcome,
          performanceId: null,
          errorCode: outcome === failure.outcome ? failure.errorCode : "stale_write",
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
