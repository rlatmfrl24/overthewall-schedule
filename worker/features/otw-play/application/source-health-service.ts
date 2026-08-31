import {
  OTW_PLAY_SOURCE_HEALTH_RETRY_CODES,
  type OtwPlayAdminRecheckSourceRequest,
  type OtwPlaySourceHealthRetryCode,
} from "@contracts/otw-play";
import { extractYouTubeVideoId } from "../domain/youtube-video-id";
import {
  getNextSourceCheckAt,
  getSourceRetryAt,
  OTW_PLAY_SOURCE_HEALTH_LEASE_MS,
  OTW_PLAY_SOURCE_HEALTH_LIMIT,
  OTW_PLAY_SOURCE_HEALTH_LINK_LIMIT,
  OTW_PLAY_SOURCE_HEALTH_RECOVERY_WINDOW_DAYS,
} from "../domain/source-health-policy";
import type {
  SourceHealthActor,
  SourceHealthMutationResult,
  SourceHealthRepository,
  SourceHealthTarget,
} from "./ports/source-health-repository";
import { SourceHealthRepositoryError } from "./ports/source-health-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeBatchMetadataReader,
  type OtwPlayYouTubeVideoObservation,
} from "./ports/youtube-metadata";
import {
  createPlayTelemetryEvent,
  type PlayTelemetryEventName,
  type PlayTelemetryWriter,
} from "./ports/play-telemetry";

export type SourceHealthServiceErrorCode =
  | "invalid_request"
  | "not_found"
  | "stale_write"
  | "validation_failed"
  | "external_service_unavailable";

export class SourceHealthServiceError extends Error {
  readonly code: SourceHealthServiceErrorCode;
  readonly fields?: Record<string, string>;

  constructor(
    code: SourceHealthServiceErrorCode,
    message: string,
    fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "SourceHealthServiceError";
    this.code = code;
    this.fields = fields;
  }
}

export interface ScheduledSourceHealthResult {
  claimed: number;
  checked: number;
  changed: number;
  recovered: number;
  retryScheduled: number;
  staleSkipped: number;
  failed: number;
}

const isRetryCode = (value: string): value is OtwPlaySourceHealthRetryCode =>
  OTW_PLAY_SOURCE_HEALTH_RETRY_CODES.includes(
    value as OtwPlaySourceHealthRetryCode,
  );

const validateObservationIdentity = (
  target: SourceHealthTarget,
  observation: OtwPlayYouTubeVideoObservation,
) =>
  observation.videoId === target.externalId &&
  (!observation.video ||
    (observation.video.videoId === target.externalId &&
      observation.video.channelId === target.externalChannelId));

const isSharedRepositoryFailure = (error: unknown) =>
  error instanceof SourceHealthRepositoryError && error.code === "unavailable";

export class SourceHealthService {
  private readonly repository: SourceHealthRepository;
  private readonly youtube: OtwPlayYouTubeBatchMetadataReader;
  private readonly createId: () => string;
  private readonly clock: () => number;
  private readonly telemetry: PlayTelemetryWriter | undefined;

  constructor(
    repository: SourceHealthRepository,
    youtube: OtwPlayYouTubeBatchMetadataReader,
    createId: () => string = () => crypto.randomUUID(),
    clock: () => number = Date.now,
    telemetry?: PlayTelemetryWriter,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.createId = createId;
    this.clock = clock;
    this.telemetry = telemetry;
  }

  private recordScheduledTelemetry(
    event: PlayTelemetryEventName,
    sourceId: string | undefined,
    now: number,
    startedAt: number,
    options: { transition?: string; errorCode?: string; status?: number } = {},
  ) {
    try {
      this.telemetry?.write(
        createPlayTelemetryEvent({
          event,
          occurredAt: new Date(now).toISOString(),
          requestId: `scheduled:${startedAt}`,
          cfRay: null,
          routeId: "otw-play.scheduled.source-health",
          trigger: "scheduled",
          status: options.status ?? 200,
          durationMs: Math.max(0, now - startedAt),
          cacheStatus: null,
          d1RowsRead: null,
          d1RowsWritten: null,
          ...(sourceId
            ? { resourceType: "source", resourceId: sourceId }
            : {}),
          ...(options.transition
            ? { transition: options.transition }
            : {}),
          ...(options.errorCode ? { errorCode: options.errorCode } : {}),
        }),
      );
    } catch {
      // Scheduled source authority is independent from telemetry availability.
    }
  }

  readDashboard() {
    const now = this.clock();
    return this.repository.readDashboard(
      now,
      now - OTW_PLAY_SOURCE_HEALTH_RECOVERY_WINDOW_DAYS * 24 * 60 * 60_000,
      OTW_PLAY_SOURCE_HEALTH_LIMIT,
      OTW_PLAY_SOURCE_HEALTH_LINK_LIMIT,
    );
  }

  private async scheduleRetry(
    target: SourceHealthTarget,
    actor: SourceHealthActor,
    error: OtwPlayYouTubeMetadataError,
    now: number,
  ) {
    if (!error.retryable || !isRetryCode(error.code)) throw error;
    return this.repository.scheduleRetry({
      target,
      actor,
      eventId: this.createId(),
      retryCode: error.code,
      nextCheckAt: getSourceRetryAt(
        error.code,
        now,
        error.retryAfterMs,
      ),
      now,
    });
  }

  async recheckSource(
    sourceId: string,
    input: OtwPlayAdminRecheckSourceRequest,
  ) {
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
      throw new SourceHealthServiceError(
        "invalid_request",
        "expectedVersion must be a non-negative integer",
        { expectedVersion: "invalid" },
      );
    }
    const videoId = extractYouTubeVideoId(input.youtubeUrl);
    if (!videoId) {
      throw new SourceHealthServiceError(
        "invalid_request",
        "A supported YouTube video URL is required",
        { youtubeUrl: "invalid" },
      );
    }
    const target = await this.repository.readTarget(sourceId);
    if (!target) {
      throw new SourceHealthServiceError("not_found", "Source not found");
    }
    if (target.version !== input.expectedVersion) {
      throw new SourceHealthServiceError(
        "stale_write",
        "Source changed before recheck",
      );
    }
    if (target.externalId !== videoId || target.channelId !== input.channelId) {
      throw new SourceHealthServiceError(
        "validation_failed",
        "Stored source and channel identity do not match the recheck request",
      );
    }
    const actor = { kind: "admin" } as const;
    const now = this.clock();
    let observation: OtwPlayYouTubeVideoObservation;
    try {
      observation = (await this.youtube.readVideos([videoId]))[0]!;
    } catch (error) {
      if (error instanceof OtwPlayYouTubeMetadataError && error.retryable) {
        const result = await this.scheduleRetry(target, actor, error, now);
        if (result.kind === "stale") {
          throw new SourceHealthServiceError(
            "stale_write",
            "Source changed before retry could be scheduled",
          );
        }
        return result.response;
      }
      throw new SourceHealthServiceError(
        "external_service_unavailable",
        "YouTube metadata is unavailable",
      );
    }
    if (!validateObservationIdentity(target, observation)) {
      throw new SourceHealthServiceError(
        "validation_failed",
        "YouTube video and channel metadata do not match",
      );
    }
    const result = await this.repository.applyObservation({
      target,
      observation,
      actor,
      eventId: this.createId(),
      checkedAt: now,
      nextCheckAt: getNextSourceCheckAt(observation.availabilityStatus, now),
    });
    if (result.kind === "stale") {
      throw new SourceHealthServiceError(
        "stale_write",
        "Source changed before recheck completed",
      );
    }
    return result.response;
  }

  async runScheduled(
    limit = OTW_PLAY_SOURCE_HEALTH_LIMIT,
  ): Promise<ScheduledSourceHealthResult> {
    const now = this.clock();
    const startedAt = now;
    const targets = await this.repository.claimDueSources(
      now,
      now + OTW_PLAY_SOURCE_HEALTH_LEASE_MS,
      Math.max(1, Math.min(limit, OTW_PLAY_SOURCE_HEALTH_LIMIT)),
    );
    const result: ScheduledSourceHealthResult = {
      claimed: targets.length,
      checked: 0,
      changed: 0,
      recovered: 0,
      retryScheduled: 0,
      staleSkipped: 0,
      failed: 0,
    };
    if (targets.length === 0) return result;
    const actor = { kind: "system" } as const;
    let observations: OtwPlayYouTubeVideoObservation[];
    try {
      observations = await this.youtube.readVideos(
        targets.map((target) => target.externalId),
      );
    } catch (error) {
      if (!(error instanceof OtwPlayYouTubeMetadataError) || !error.retryable) {
        this.recordScheduledTelemetry(
          "play.youtube.verify_failed",
          undefined,
          this.clock(),
          startedAt,
          {
            errorCode:
              error instanceof OtwPlayYouTubeMetadataError
                ? error.code
                : "youtube_dependency_failed",
            status: 503,
          },
        );
        throw error;
      }
      for (const target of targets) {
        let mutation: SourceHealthMutationResult;
        try {
          mutation = await this.scheduleRetry(target, actor, error, now);
        } catch (sourceError) {
          if (isSharedRepositoryFailure(sourceError)) throw sourceError;
          result.failed += 1;
          this.recordScheduledTelemetry(
            "play.request.failed",
            target.id,
            this.clock(),
            startedAt,
            { errorCode: "source_health_source_failed", status: 500 },
          );
          continue;
        }
        if (mutation.kind === "stale") {
          result.staleSkipped += 1;
          this.recordScheduledTelemetry(
            "play.concurrent_write_conflict",
            target.id,
            this.clock(),
            startedAt,
            { errorCode: "PLAY_ADMIN_STALE_WRITE", status: 409 },
          );
        } else {
          result.retryScheduled += 1;
          this.recordScheduledTelemetry(
            "play.youtube.verify_failed",
            target.id,
            this.clock(),
            startedAt,
            { errorCode: error.code },
          );
        }
      }
      return result;
    }
    const observationById = new Map(
      observations.map((observation) => [observation.videoId, observation]),
    );
    for (const target of targets) {
      const observation = observationById.get(target.externalId);
      if (!observation || !validateObservationIdentity(target, observation)) {
        result.staleSkipped += 1;
        continue;
      }
      let mutation: SourceHealthMutationResult;
      try {
        mutation = await this.repository.applyObservation({
          target,
          observation,
          actor,
          eventId: this.createId(),
          checkedAt: now,
          nextCheckAt: getNextSourceCheckAt(observation.availabilityStatus, now),
        });
      } catch (sourceError) {
        if (isSharedRepositoryFailure(sourceError)) throw sourceError;
        result.failed += 1;
        this.recordScheduledTelemetry(
          "play.request.failed",
          target.id,
          this.clock(),
          startedAt,
          { errorCode: "source_health_source_failed", status: 500 },
        );
        continue;
      }
      if (mutation.kind === "stale") {
        result.staleSkipped += 1;
        this.recordScheduledTelemetry(
          "play.concurrent_write_conflict",
          target.id,
          this.clock(),
          startedAt,
          { errorCode: "PLAY_ADMIN_STALE_WRITE", status: 409 },
        );
        continue;
      }
      result.checked += 1;
      if (mutation.response.check.status === "checked") {
        if (mutation.response.check.changed) result.changed += 1;
        const previous = mutation.response.check.previousAvailability;
        const current = mutation.response.check.currentAvailability;
        if (previous === "playable" && current !== "playable") {
          this.recordScheduledTelemetry(
            "play.source.unavailable",
            target.id,
            this.clock(),
            startedAt,
            { transition: `${previous}:${current}` },
          );
        } else if (previous !== "playable" && current === "playable") {
          this.recordScheduledTelemetry(
            "play.source.recovered",
            target.id,
            this.clock(),
            startedAt,
            { transition: `${previous}:${current}` },
          );
        } else if (mutation.response.check.changed) {
          this.recordScheduledTelemetry(
            "play.catalog.updated",
            target.id,
            this.clock(),
            startedAt,
            { transition: `${previous}:${current}` },
          );
        }
        if (
          mutation.response.check.previousAvailability !== "playable" &&
          mutation.response.check.currentAvailability === "playable"
        ) {
          result.recovered += 1;
        }
      }
    }
    return result;
  }
}
