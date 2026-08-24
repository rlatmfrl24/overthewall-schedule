import type {
  OtwPlayIngestionCandidateItemDto,
  OtwPlayIngestionClassification,
  OtwPlayIngestionJobDto,
  OtwPlayIngestionItemFilters,
  OtwPlayIngestionReviewInput,
  OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";
import type { IngestionItemCursor } from "../domain/ingestion-cursor";
import {
  IngestionRepositoryError,
  type CreateIngestionJobCommand,
  type IngestionMessageRecord,
  type IngestionRepository,
  type IngestionReviewCandidate,
  type OtwPlayIngestionQueueMessage,
} from "../application/ports/ingestion-repository";
import type {
  OtwPlayYouTubePlaylistPage,
  OtwPlayYouTubeVideoObservation,
} from "../application/ports/youtube-metadata";
import { OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES } from "../domain/ingestion-channel-policy";

const DAY_MS = 86_400_000;
const API_DATA_RETENTION_MS = 30 * DAY_MS;
const ACTIVE_RETENTION_MS = 90 * DAY_MS;
const BLOCKED_RETENTION_MS = 180 * DAY_MS;

const resultsOf = <T>(result: D1Result<T>): T[] =>
  Array.isArray(result.results) ? result.results : [];

const chunksOf = <T>(items: readonly T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const officialChannelRoleSql = OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES
  .map((role) => `'${role}'`)
  .join(", ");

type JobRow = {
  id: string;
  source_external_id: string;
  source_title: string;
  owner_channel_id: string;
  owner_channel_title: string;
  import_mode: "all_new" | "recent";
  range_start_position: number;
  requested_item_count: number;
  status: OtwPlayIngestionJobDto["status"];
  last_error_code: string | null;
  next_retry_at: number | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  updated_at: number;
  discovered_count: number;
  metadata_checked_count: number;
  eligible_count: number;
  existing_catalog_count: number;
  existing_proposal_count: number;
  existing_candidate_count: number;
  channel_review_count: number;
  unavailable_count: number;
  policy_blocked_count: number;
  scope_review_count: number;
  playlist_duplicate_count: number;
  retry_pending_count: number;
  permanent_error_count: number;
};

const itemClassificationSql = `CASE
  WHEN origin.is_playlist_duplicate = 1 THEN 'playlist_duplicate'
  WHEN candidate.first_discovered_at < job.created_at THEN 'existing_candidate'
  ELSE candidate.classification
END`;

const jobSelect = `SELECT job.*,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    WHERE origin.job_id = job.id) AS discovered_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND origin.is_playlist_duplicate = 0
      AND candidate.metadata_checked_at IS NOT NULL) AS metadata_checked_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'eligible') AS eligible_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'existing_catalog') AS existing_catalog_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'existing_proposal') AS existing_proposal_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'existing_candidate') AS existing_candidate_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'channel_review') AS channel_review_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'unavailable') AS unavailable_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'policy_blocked') AS policy_blocked_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.job_id = job.id AND (${itemClassificationSql}) = 'scope_review') AS scope_review_count,
  (SELECT COUNT(*) FROM music_ingestion_candidate_origins AS origin
    WHERE origin.job_id = job.id AND origin.is_playlist_duplicate = 1) AS playlist_duplicate_count,
  (SELECT COUNT(*) FROM music_ingestion_messages AS message
    WHERE message.job_id = job.id AND message.status = 'pending'
      AND message.next_retry_at IS NOT NULL) AS retry_pending_count,
  (SELECT COUNT(*) FROM music_ingestion_messages AS message
    WHERE message.job_id = job.id AND message.status = 'failed') AS permanent_error_count
FROM music_ingestion_jobs AS job`;

const toJobDto = (row: JobRow): OtwPlayIngestionJobDto => ({
  id: row.id,
  playlistId: row.source_external_id,
  playlistTitle: row.source_title,
  playlistOwnerChannelId: row.owner_channel_id,
  playlistOwnerChannelTitle: row.owner_channel_title,
  mode: row.import_mode,
  rangeStartPosition: Number(row.range_start_position),
  rangeEndExclusive:
    Number(row.range_start_position) + Number(row.requested_item_count),
  requestedItemCount: Number(row.requested_item_count),
  status: row.status,
  counts: {
    discovered: Number(row.discovered_count),
    metadataChecked: Number(row.metadata_checked_count),
    eligible: Number(row.eligible_count),
    existingCatalog: Number(row.existing_catalog_count),
    existingProposal: Number(row.existing_proposal_count),
    existingCandidate: Number(row.existing_candidate_count),
    channelReview: Number(row.channel_review_count),
    unavailable: Number(row.unavailable_count),
    policyBlocked: Number(row.policy_blocked_count),
    scopeReview: Number(row.scope_review_count),
    playlistDuplicate: Number(row.playlist_duplicate_count),
    retryPending: Number(row.retry_pending_count),
    permanentError: Number(row.permanent_error_count),
  },
  lastErrorCode: row.last_error_code,
  nextRetryAt:
    row.next_retry_at === null ? null : Number(row.next_retry_at),
  createdAt: Number(row.created_at),
  startedAt: row.started_at === null ? null : Number(row.started_at),
  completedAt: row.completed_at === null ? null : Number(row.completed_at),
  updatedAt: Number(row.updated_at),
});

const queueMessage = (
  jobId: string,
  idempotencyKey: string,
): OtwPlayIngestionQueueMessage => ({
  schemaVersion: 1,
  jobId,
  idempotencyKey,
});

const candidateId = (videoId: string) => `youtube:${videoId}`;

const parseReviewInput = (value: string | null): OtwPlayIngestionReviewInput | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as OtwPlayIngestionReviewInput
      : null;
  } catch {
    return null;
  }
};

const stableJsonValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableJsonValue(item)]),
  );
};

const comparableReviewInput = (
  value: OtwPlayIngestionReviewInput | null,
): unknown => {
  if (!value) return null;
  const song = value.song.kind === "from_video"
    ? { ...value.song, tags: [...(value.song.tags ?? [])].sort() }
    : value.song.kind === "create"
      ? {
          ...value.song,
          aliases: value.song.aliases.map((alias) => ({
            ...alias,
            locale: alias.locale ?? null,
            aliasKind: alias.aliasKind ?? null,
          })),
          originalArtists: [...value.song.originalArtists].sort(
            (left, right) => left.creditOrder - right.creditOrder,
          ),
          tags: [...(value.song.tags ?? [])].sort(),
        }
      : value.song;
  return stableJsonValue({
    ...value,
    song,
    participants: value.participants
      .map((participant) => ({
        ...participant,
        creditNameSnapshot: participant.creditNameSnapshot ?? null,
      }))
      .sort((left, right) => left.creditOrder - right.creditOrder),
    internalNote: value.internalNote ?? null,
  });
};

const sameReviewInput = (
  left: OtwPlayIngestionReviewInput | null,
  right: OtwPlayIngestionReviewInput | null,
) => JSON.stringify(comparableReviewInput(left)) ===
  JSON.stringify(comparableReviewInput(right));

export class D1IngestionRepository implements IngestionRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async findPreviousImport(playlistId: string) {
    const row = await this.database.prepare(
      `SELECT id, status, updated_at FROM music_ingestion_jobs
       WHERE source_kind = 'playlist_import' AND source_external_id = ?
       ORDER BY updated_at DESC, id DESC LIMIT 1`,
    ).bind(playlistId).first<{
      id: string;
      status: OtwPlayIngestionJobDto["status"];
      updated_at: number;
    }>();
    return row
      ? { jobId: row.id, status: row.status, lastSyncedAt: Number(row.updated_at) }
      : null;
  }

  private async readByIdempotency(actorUserId: string, key: string) {
    const row = await this.database.prepare(
      `${jobSelect}
       WHERE job.actor_user_id = ? AND job.idempotency_key = ?`,
    ).bind(actorUserId, key).first<JobRow>();
    return row ? toJobDto(row) : null;
  }

  async createJob(command: CreateIngestionJobCommand) {
    const existing = await this.readByIdempotency(
      command.actorUserId,
      command.input.idempotencyKey,
    );
    if (existing) {
      if (
        existing.playlistId !== command.preflight.playlistId ||
        existing.mode !== command.input.mode ||
        existing.rangeStartPosition !== command.preflight.rangeStartPosition ||
        existing.requestedItemCount !== command.preflight.requestedItemCount
      ) {
        throw new IngestionRepositoryError(
          "idempotency_conflict",
          "idempotencyKey was already used for a different import",
        );
      }
      return {
        job: existing,
        message: queueMessage(
          existing.id,
          `${existing.id}:playlist_page:first`,
        ),
      };
    }

    const firstMessageKey = `${command.jobId}:playlist_page:first`;
    try {
      await this.database.batch([
        this.database.prepare(
          `INSERT INTO music_ingestion_jobs (
            id, source_kind, source_external_id, source_url, source_title,
            owner_channel_id, owner_channel_title, import_mode,
            range_start_position, requested_item_count, status,
            actor_user_id, idempotency_key,
            created_at, updated_at
          ) VALUES (?, 'playlist_import', ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
        ).bind(
          command.jobId,
          command.preflight.playlistId,
          command.preflight.canonicalUrl,
          command.preflight.title,
          command.preflight.ownerChannelId,
          command.preflight.ownerChannelTitle,
          command.input.mode,
          command.preflight.rangeStartPosition,
          command.preflight.requestedItemCount,
          command.actorUserId,
          command.input.idempotencyKey,
          command.now,
          command.now,
        ),
        this.database.prepare(
          `INSERT INTO music_ingestion_messages (
            idempotency_key, job_id, message_kind, payload_key, status,
            created_at, updated_at
          ) VALUES (?, ?, 'playlist_page', 'first', 'pending', ?, ?)`,
        ).bind(firstMessageKey, command.jobId, command.now, command.now),
        this.database.prepare(
          `INSERT INTO music_ingestion_events (
            id, job_id, event_type, actor_user_id, detail_json, created_at
          ) VALUES (?, ?, 'job.created', ?, ?, ?)`,
        ).bind(
          command.eventId ?? `${command.jobId}:event:created`,
          command.jobId,
          command.actorUserId,
          JSON.stringify({
            playlistId: command.preflight.playlistId,
            mode: command.input.mode,
            rangeStartPosition: command.preflight.rangeStartPosition,
            requestedItemCount: command.preflight.requestedItemCount,
          }),
          command.now,
        ),
      ]);
    } catch (error) {
      const raced = await this.readByIdempotency(
        command.actorUserId,
        command.input.idempotencyKey,
      );
      if (raced) {
        if (
          raced.playlistId === command.preflight.playlistId &&
          raced.mode === command.input.mode &&
          raced.rangeStartPosition === command.preflight.rangeStartPosition &&
          raced.requestedItemCount === command.preflight.requestedItemCount
        ) {
          return {
            job: raced,
            message: queueMessage(
              raced.id,
              `${raced.id}:playlist_page:first`,
            ),
          };
        }
        throw new IngestionRepositoryError(
          "idempotency_conflict",
          "idempotencyKey was already used for a different import",
        );
      }
      throw new IngestionRepositoryError(
        "unavailable",
        `Ingestion job could not be stored: ${error instanceof Error ? error.name : "unknown"}`,
      );
    }
    return {
      job: await this.getJob(command.jobId),
      message: queueMessage(command.jobId, firstMessageKey),
    };
  }

  async getJob(jobId: string) {
    const row = await this.database.prepare(
      `${jobSelect} WHERE job.id = ?`,
    ).bind(jobId).first<JobRow>();
    if (!row) {
      throw new IngestionRepositoryError("not_found", "Ingestion job not found");
    }
    return toJobDto(row);
  }

  async listItems(
    jobId: string,
    limit: number,
    cursor: IngestionItemCursor | null,
    filters: OtwPlayIngestionItemFilters = {},
  ) {
    await this.getJob(jobId);
    const classificationSql = filters.classification
      ? `AND (${itemClassificationSql}) = ?`
      : "";
    const statusSql = filters.status
      ? "AND candidate.status = ?"
      : "AND candidate.status NOT IN ('converted', 'ignored')";
    const cursorSql = cursor
      ? `AND (origin.playlist_position > ?
        OR (origin.playlist_position = ? AND origin.id > ?))`
      : "";
    const statement = this.database.prepare(
      `SELECT origin.id AS origin_id, candidate.id AS candidate_id,
        candidate.version AS candidate_version, origin.playlist_position,
        origin.playlist_item_id, candidate.external_video_id,
        candidate.status, ${itemClassificationSql} AS item_classification,
        candidate.classification AS candidate_classification,
        candidate.exclusion_reason, candidate.title, candidate.channel_id,
        candidate.channel_title,
        (SELECT channel.id FROM music_channels AS channel
          WHERE channel.provider = 'youtube'
            AND channel.external_channel_id = candidate.channel_id
            AND channel.verification_status = 'approved' AND channel.active = 1
            AND channel.channel_role IN (${officialChannelRoleSql})
          LIMIT 1) AS catalog_channel_id,
        candidate.thumbnail_url,
        candidate.duration_seconds, candidate.provider_published_at,
        candidate.availability_status, candidate.made_for_kids,
        candidate.metadata_checked_at, candidate.review_input_json,
        candidate.last_conversion_outcome,
        candidate.last_conversion_error_code,
        candidate.last_conversion_attempt_at,
        candidate.linked_performance_id
       FROM music_ingestion_candidate_origins AS origin
       JOIN music_ingestion_jobs AS job ON job.id = origin.job_id
       JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
       WHERE origin.job_id = ? ${classificationSql} ${statusSql} ${cursorSql}
       ORDER BY origin.playlist_position ASC, origin.id ASC LIMIT ?`,
    );
    const bindings: unknown[] = [jobId];
    if (filters.classification) bindings.push(filters.classification);
    if (filters.status) bindings.push(filters.status);
    if (cursor) {
      bindings.push(cursor.position, cursor.position, cursor.id);
    }
    bindings.push(limit + 1);
    const result = await statement.bind(...bindings).all<{
          origin_id: string;
          candidate_id: string;
          candidate_version: number;
          playlist_position: number;
          playlist_item_id: string;
          external_video_id: string;
          status: OtwPlayIngestionCandidateItemDto["status"];
          item_classification: OtwPlayIngestionClassification;
          candidate_classification: OtwPlayIngestionClassification;
          exclusion_reason: string | null;
          title: string | null;
          channel_id: string | null;
          channel_title: string | null;
          catalog_channel_id: string | null;
          thumbnail_url: string | null;
          duration_seconds: number | null;
          provider_published_at: number | null;
          availability_status: OtwPlaySourceAvailabilityStatus;
          made_for_kids: number | null;
          metadata_checked_at: number | null;
          review_input_json: string | null;
          last_conversion_outcome: OtwPlayIngestionCandidateItemDto["lastConversionOutcome"];
          last_conversion_error_code: string | null;
          last_conversion_attempt_at: number | null;
          linked_performance_id: string | null;
        }>();
    const rows = resultsOf(result as D1Result<Record<string, unknown>>);
    const items = rows.slice(0, limit).map((value) => {
      const row = value as unknown as {
        origin_id: string;
        candidate_id: string;
        candidate_version: number;
        playlist_position: number;
        playlist_item_id: string;
        external_video_id: string;
        status: OtwPlayIngestionCandidateItemDto["status"];
        item_classification: OtwPlayIngestionClassification;
        candidate_classification: OtwPlayIngestionClassification;
        exclusion_reason: string | null;
        title: string | null;
        channel_id: string | null;
        channel_title: string | null;
        catalog_channel_id: string | null;
        thumbnail_url: string | null;
        duration_seconds: number | null;
        provider_published_at: number | null;
        availability_status: OtwPlaySourceAvailabilityStatus;
        made_for_kids: number | null;
        metadata_checked_at: number | null;
        review_input_json: string | null;
        last_conversion_outcome: OtwPlayIngestionCandidateItemDto["lastConversionOutcome"];
        last_conversion_error_code: string | null;
        last_conversion_attempt_at: number | null;
        linked_performance_id: string | null;
      };
      return {
        originId: row.origin_id,
        candidateId: row.candidate_id,
        candidateVersion: Number(row.candidate_version),
        playlistPosition: Number(row.playlist_position),
        playlistItemId: row.playlist_item_id,
        videoId: row.external_video_id,
        status: row.status,
        classification: row.item_classification,
        candidateClassification: row.candidate_classification,
        exclusionReason: row.exclusion_reason,
        title: row.title,
        channelId: row.channel_id,
        channelTitle: row.channel_title,
        catalogChannelId: row.catalog_channel_id,
        thumbnailUrl: row.thumbnail_url,
        durationSeconds:
          row.duration_seconds === null ? null : Number(row.duration_seconds),
        publishedAt:
          row.provider_published_at === null
            ? null
            : Number(row.provider_published_at),
        availabilityStatus: row.availability_status,
        madeForKids:
          row.made_for_kids === null ? null : row.made_for_kids === 1,
        metadataCheckedAt:
          row.metadata_checked_at === null
            ? null
            : Number(row.metadata_checked_at),
        reviewInput: parseReviewInput(row.review_input_json),
        lastConversionOutcome: row.last_conversion_outcome,
        lastConversionErrorCode: row.last_conversion_error_code,
        lastConversionAttemptAt:
          row.last_conversion_attempt_at === null
            ? null
            : Number(row.last_conversion_attempt_at),
        linkedPerformanceId: row.linked_performance_id,
      } satisfies OtwPlayIngestionCandidateItemDto;
    });
    return {
      page: { items, nextCursor: null },
      hasMore: rows.length > limit,
    };
  }

  async readMessage(idempotencyKey: string): Promise<IngestionMessageRecord> {
    const row = await this.database.prepare(
      `SELECT job_id, idempotency_key, message_kind, page_token,
        video_ids_json, status, attempts
       FROM music_ingestion_messages WHERE idempotency_key = ?`,
    ).bind(idempotencyKey).first<{
      job_id: string;
      idempotency_key: string;
      message_kind: "playlist_page" | "video_batch";
      page_token: string | null;
      video_ids_json: string | null;
      status: IngestionMessageRecord["status"];
      attempts: number;
    }>();
    if (!row) {
      throw new IngestionRepositoryError("not_found", "Ingestion message not found");
    }
    let videoIds: string[] = [];
    if (row.video_ids_json) {
      try {
        const parsed: unknown = JSON.parse(row.video_ids_json);
        if (
          !Array.isArray(parsed) ||
          parsed.length > 50 ||
          !parsed.every(
            (videoId): videoId is string =>
              typeof videoId === "string" && /^[A-Za-z0-9_-]{11}$/.test(videoId),
          )
        ) {
          throw new Error("invalid");
        }
        videoIds = parsed;
      } catch {
        throw new IngestionRepositoryError(
          "unavailable",
          "Stored ingestion message payload is invalid",
        );
      }
    }
    return {
      jobId: row.job_id,
      idempotencyKey: row.idempotency_key,
      kind: row.message_kind,
      pageToken: row.page_token,
      videoIds,
      status: row.status,
      attempts: Number(row.attempts),
    };
  }

  async recordPlaylistPage(
    message: IngestionMessageRecord,
    page: OtwPlayYouTubePlaylistPage,
    now: number,
  ) {
    const job = await this.getJob(message.jobId);
    const items = page.items.filter(
      (item) =>
        item.position >= job.rangeStartPosition &&
        item.position < job.rangeEndExclusive,
    );
    const uniqueVideoIds = [...new Set(items.map((item) => item.videoId))];
    const reachedLimit = job.requestedItemCount === 0 || page.items.some(
      (item) => item.position + 1 >= job.rangeEndExclusive,
    );
    const nextPageToken = reachedLimit ? null : page.nextPageToken;
    const children: Array<{
      message: OtwPlayIngestionQueueMessage;
      statement: D1PreparedStatement;
    }> = [];
    if (uniqueVideoIds.length > 0) {
      const payloadKey = `batch:${message.idempotencyKey}`;
      const key = `${message.jobId}:video_batch:${payloadKey}`;
      children.push({
        message: queueMessage(message.jobId, key),
        statement: this.database.prepare(
          `INSERT OR IGNORE INTO music_ingestion_messages (
            idempotency_key, job_id, message_kind, payload_key,
            video_ids_json, status, created_at, updated_at
          ) VALUES (?, ?, 'video_batch', ?, ?, 'pending', ?, ?)`,
        ).bind(
          key,
          message.jobId,
          payloadKey,
          JSON.stringify(uniqueVideoIds),
          now,
          now,
        ),
      });
    }
    if (nextPageToken) {
      const payloadKey = `page:${nextPageToken}`;
      const key = `${message.jobId}:playlist_page:${payloadKey}`;
      children.push({
        message: queueMessage(message.jobId, key),
        statement: this.database.prepare(
          `INSERT OR IGNORE INTO music_ingestion_messages (
            idempotency_key, job_id, message_kind, payload_key,
            page_token, status, created_at, updated_at
          ) VALUES (?, ?, 'playlist_page', ?, ?, 'pending', ?, ?)`,
        ).bind(
          key,
          message.jobId,
          payloadKey,
          nextPageToken,
          now,
          now,
        ),
      });
    }

    const uniqueCandidateItems = [...new Map(
      items.map((item) => [item.videoId, item]),
    ).values()];
    const candidateStatements = chunksOf(uniqueCandidateItems, 48).map((chunk) =>
      this.database.prepare(
        `WITH context(now, expires_at, message_key) AS (VALUES (?, ?, ?)),
          incoming(id, external_video_id) AS (VALUES ${chunk.map(() => "(?, ?)").join(", ")})
         INSERT INTO music_ingestion_candidates (
           id, provider, external_video_id, candidate_kind, status,
           classification, availability_status, first_discovered_at,
           last_discovered_at, retention_expires_at, version, created_at, updated_at
         )
         SELECT incoming.id, 'youtube', incoming.external_video_id,
           'official_video', 'discovered', 'pending_metadata', 'unknown',
           context.now, context.now, context.expires_at, 0, context.now, context.now
         FROM incoming CROSS JOIN context
         WHERE EXISTS (
           SELECT 1 FROM music_ingestion_messages
           WHERE idempotency_key = context.message_key AND status = 'pending'
         )
         ON CONFLICT(provider, external_video_id) DO UPDATE SET
           last_discovered_at = excluded.last_discovered_at,
           retention_expires_at = MAX(
             music_ingestion_candidates.retention_expires_at,
             excluded.retention_expires_at
           ),
           updated_at = excluded.updated_at`,
      ).bind(
        now,
        now + ACTIVE_RETENTION_MS,
        message.idempotencyKey,
        ...chunk.flatMap((item) => [candidateId(item.videoId), item.videoId]),
      )
    );
    const originStatements = chunksOf(items, 19).map((chunk) =>
      this.database.prepare(
        `WITH context(job_id, playlist_id, discovered_at, message_key) AS
            (VALUES (?, ?, ?, ?)),
          incoming(
            origin_id, candidate_id, playlist_item_id, playlist_position, video_id
          ) AS (VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")})
         INSERT OR IGNORE INTO music_ingestion_candidate_origins (
           id, candidate_id, job_id, origin_kind, playlist_id,
           playlist_item_id, playlist_position, is_playlist_duplicate,
           discovered_at
         )
         SELECT incoming.origin_id, incoming.candidate_id, context.job_id,
           'playlist_import', context.playlist_id, incoming.playlist_item_id,
           incoming.playlist_position,
           EXISTS (
             SELECT 1 FROM music_ingestion_candidate_origins AS prior_origin
             JOIN music_ingestion_candidates AS prior_candidate
               ON prior_candidate.id = prior_origin.candidate_id
             WHERE prior_origin.job_id = context.job_id
               AND prior_candidate.provider = 'youtube'
               AND prior_candidate.external_video_id = incoming.video_id
           ) OR EXISTS (
             SELECT 1 FROM incoming AS prior_incoming
             WHERE prior_incoming.video_id = incoming.video_id
               AND (
                 prior_incoming.playlist_position < incoming.playlist_position
                 OR (
                   prior_incoming.playlist_position = incoming.playlist_position
                   AND prior_incoming.origin_id < incoming.origin_id
                 )
               )
           ), context.discovered_at
         FROM incoming CROSS JOIN context
         WHERE EXISTS (
           SELECT 1 FROM music_ingestion_messages
           WHERE idempotency_key = context.message_key AND status = 'pending'
         )`,
      ).bind(
        message.jobId,
        job.playlistId,
        now,
        message.idempotencyKey,
        ...chunk.flatMap((item) => [
          `${message.jobId}:origin:${item.playlistItemId}`,
          candidateId(item.videoId),
          item.playlistItemId,
          item.position,
          item.videoId,
        ]),
      )
    );

    await this.database.batch([
      ...candidateStatements,
      ...originStatements,
      ...children.map((child) => child.statement),
      this.database.prepare(
        `UPDATE music_ingestion_messages
         SET status = 'completed', completed_at = ?, next_retry_at = NULL,
           last_error_code = NULL, updated_at = ?
         WHERE idempotency_key = ? AND status = 'pending'`,
      ).bind(now, now, message.idempotencyKey),
      this.database.prepare(
        `UPDATE music_ingestion_jobs
         SET status = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'pending'
           ) THEN 'collecting' ELSE 'completed' END,
           started_at = COALESCE(started_at, ?),
           completed_at = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'pending'
           ) THEN NULL ELSE ? END,
           last_error_code = NULL, next_retry_at = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(message.jobId, now, message.jobId, now, now, message.jobId),
    ]);
    return children.map((child) => child.message);
  }

  async recordVideoBatch(
    message: IngestionMessageRecord,
    observations: OtwPlayYouTubeVideoObservation[],
    now: number,
  ) {
    const observationStatements = chunksOf(observations, 9).map((chunk) =>
      this.database.prepare(
        `WITH context(now, blocked_expires_at, active_expires_at, message_key) AS
            (VALUES (?, ?, ?, ?)),
          observation(
            video_id, title, channel_id, channel_title, thumbnail_url,
            duration_seconds, provider_published_at, availability_status,
            made_for_kids, scope_review
          ) AS (VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")})
         UPDATE music_ingestion_candidates AS candidate
         SET title = observation.title,
           channel_id = observation.channel_id,
           channel_title = observation.channel_title,
           thumbnail_url = observation.thumbnail_url,
           duration_seconds = observation.duration_seconds,
           provider_published_at = observation.provider_published_at,
           availability_status = observation.availability_status,
           made_for_kids = observation.made_for_kids,
           metadata_checked_at = context.now,
           next_retry_at = NULL,
           classification = CASE
             WHEN EXISTS (
               SELECT 1 FROM music_media_sources
               WHERE provider = 'youtube' AND external_id = observation.video_id
             ) THEN 'existing_catalog'
             WHEN EXISTS (
               SELECT 1 FROM music_cover_proposals
               WHERE youtube_video_id = observation.video_id AND segment_start_seconds = 0
                 AND status = 'pending_review'
             ) THEN 'existing_proposal'
             WHEN observation.availability_status <> 'playable' THEN 'unavailable'
             WHEN observation.made_for_kids = 1 THEN 'policy_blocked'
             WHEN EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND (verification_status = 'revoked' OR active = 0)
             ) THEN 'policy_blocked'
             WHEN candidate.review_input_json IS NOT NULL AND EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND verification_status = 'approved' AND active = 1
                 AND channel_role IN (${officialChannelRoleSql})
             ) THEN 'eligible'
             WHEN observation.scope_review = 1 AND EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND verification_status = 'approved' AND active = 1
                 AND channel_role IN (${officialChannelRoleSql})
             ) THEN 'scope_review'
             WHEN EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND verification_status = 'approved' AND active = 1
                 AND channel_role IN (${officialChannelRoleSql})
             ) THEN 'eligible'
             ELSE 'channel_review'
           END,
           status = CASE
             WHEN candidate.status = 'converted' THEN 'converted'
             WHEN candidate.status = 'ignored' THEN 'ignored'
             WHEN observation.availability_status <> 'playable'
               OR observation.made_for_kids = 1 OR EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                   AND (verification_status = 'revoked' OR active = 0)
               ) THEN 'blocked'
             WHEN EXISTS (
               SELECT 1 FROM music_media_sources
               WHERE provider = 'youtube' AND external_id = observation.video_id
             ) OR EXISTS (
               SELECT 1 FROM music_cover_proposals
               WHERE youtube_video_id = observation.video_id AND segment_start_seconds = 0
                 AND status = 'pending_review'
             ) THEN 'discovered'
             WHEN candidate.review_input_json IS NOT NULL AND EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND verification_status = 'approved' AND active = 1
                 AND channel_role IN (${officialChannelRoleSql})
             ) THEN 'ready'
             WHEN observation.scope_review = 1 THEN 'discovered'
             WHEN EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND verification_status = 'approved' AND active = 1
                 AND channel_role IN (${officialChannelRoleSql})
             ) THEN 'needs_input'
             ELSE 'discovered'
           END,
           exclusion_reason = CASE
             WHEN observation.availability_status <> 'playable'
               THEN observation.availability_status
             WHEN observation.made_for_kids = 1 THEN 'made_for_kids_review'
             WHEN EXISTS (
               SELECT 1 FROM music_channels
               WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                 AND (verification_status = 'revoked' OR active = 0)
             ) THEN 'channel_policy_blocked'
             WHEN observation.scope_review = 1 AND candidate.review_input_json IS NULL
               THEN 'release_scope_review'
             ELSE NULL
           END,
           retention_expires_at = CASE
             WHEN candidate.status = 'ignored' THEN context.blocked_expires_at
             WHEN observation.availability_status <> 'playable'
               OR observation.made_for_kids = 1 OR EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = observation.channel_id
                   AND (verification_status = 'revoked' OR active = 0)
               ) THEN context.blocked_expires_at
             ELSE context.active_expires_at
           END,
           version = version + 1,
           updated_at = context.now
         FROM observation CROSS JOIN context
         WHERE candidate.provider = 'youtube'
           AND candidate.external_video_id = observation.video_id
           AND EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE idempotency_key = context.message_key AND status = 'pending'
           )`,
      ).bind(
        now,
        now + BLOCKED_RETENTION_MS,
        now + ACTIVE_RETENTION_MS,
        message.idempotencyKey,
        ...chunk.flatMap((item) => [
          item.videoId,
          item.video?.title ?? null,
          item.video?.channelId ?? null,
          item.video?.channelTitle ?? null,
          item.video?.thumbnailUrl ?? null,
          item.video?.durationSeconds ?? null,
          item.video?.publishedAt ?? null,
          item.availabilityStatus,
          item.video?.madeForKids === true
            ? 1
            : item.video?.madeForKids === false
              ? 0
              : null,
          item.video?.scopeReview === true ? 1 : 0,
        ]),
      )
    );
    await this.database.batch([
      ...observationStatements,
      this.database.prepare(
        `UPDATE music_ingestion_messages
         SET status = 'completed', completed_at = ?, next_retry_at = NULL,
           last_error_code = NULL, updated_at = ?
         WHERE idempotency_key = ? AND status = 'pending'`,
      ).bind(now, now, message.idempotencyKey),
      this.database.prepare(
        `UPDATE music_ingestion_jobs
         SET status = CASE
           WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'pending'
           ) THEN 'collecting'
           WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'failed'
           ) THEN 'partial'
           ELSE 'completed' END,
           completed_at = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'pending'
           ) THEN NULL ELSE ? END,
           last_error_code = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = ? AND status = 'failed'
           ) THEN last_error_code ELSE NULL END,
           next_retry_at = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(
        message.jobId,
        message.jobId,
        message.jobId,
        now,
        message.jobId,
        now,
        message.jobId,
      ),
    ]);
  }

  async recordMessageFailure(
    idempotencyKey: string,
    errorCode: string,
    nextRetryAt: number | null,
    now: number,
  ) {
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_messages
         SET attempts = attempts + 1, last_error_code = ?, next_retry_at = ?,
           updated_at = ?
         WHERE idempotency_key = ? AND status = 'pending'`,
      ).bind(errorCode, nextRetryAt, now, idempotencyKey),
      this.database.prepare(
        `UPDATE music_ingestion_jobs
         SET status = CASE WHEN started_at IS NULL THEN 'queued' ELSE 'collecting' END,
           last_error_code = ?, next_retry_at = ?, updated_at = ?
         WHERE id = (
           SELECT job_id FROM music_ingestion_messages WHERE idempotency_key = ?
         )`,
      ).bind(errorCode, nextRetryAt, now, idempotencyKey),
    ]);
  }

  async markMessageDeadLetter(
    idempotencyKey: string,
    errorCode: string,
    now: number,
  ) {
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_messages
         SET status = 'failed', attempts = attempts + 1, last_error_code = ?,
           next_retry_at = NULL, completed_at = ?, updated_at = ?
         WHERE idempotency_key = ? AND status = 'pending'`,
      ).bind(errorCode, now, now, idempotencyKey),
      this.database.prepare(
        `UPDATE music_ingestion_jobs
         SET status = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = music_ingestion_jobs.id AND status = 'pending'
           ) THEN 'collecting' ELSE 'partial' END,
           last_error_code = ?, next_retry_at = NULL,
           completed_at = CASE WHEN EXISTS (
             SELECT 1 FROM music_ingestion_messages
             WHERE job_id = music_ingestion_jobs.id AND status = 'pending'
           ) THEN NULL ELSE ? END,
           updated_at = ?
         WHERE id = (
           SELECT job_id FROM music_ingestion_messages WHERE idempotency_key = ?
         )`,
      ).bind(errorCode, now, now, idempotencyKey),
    ]);
  }

  async listPendingMessages(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT job_id, idempotency_key FROM music_ingestion_messages
       WHERE status = 'pending'
         AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY created_at ASC, idempotency_key ASC LIMIT ?`,
    ).bind(now, limit).all<{ job_id: string; idempotency_key: string }>();
    return resultsOf(result).map((row) =>
      queueMessage(row.job_id, row.idempotency_key),
    );
  }

  async clearExpiredApiData(now: number, limit: number) {
    const candidates = resultsOf(await this.database.prepare(
      `SELECT id FROM music_ingestion_candidates
       WHERE metadata_checked_at IS NOT NULL
         AND (metadata_checked_at <= ? OR retention_expires_at <= ?)
       ORDER BY metadata_checked_at, id LIMIT ?`,
    ).bind(now - API_DATA_RETENTION_MS, now, limit).all<{ id: string }>());
    let cleared = 0;
    for (const chunk of chunksOf(candidates, 48)) {
      const statements = chunk.flatMap((candidate) => [
        this.database.prepare(
          `UPDATE music_ingestion_candidates
           SET title = NULL, channel_id = NULL, channel_title = NULL,
             thumbnail_url = NULL, duration_seconds = NULL,
             provider_published_at = NULL, made_for_kids = NULL,
             availability_status = 'unknown', metadata_checked_at = NULL,
             version = version + 1, updated_at = ?
           WHERE id = ? AND metadata_checked_at IS NOT NULL
             AND (metadata_checked_at <= ? OR retention_expires_at <= ?)`,
        ).bind(
          now,
          candidate.id,
          now - API_DATA_RETENTION_MS,
          now,
        ),
        this.database.prepare(
          `INSERT INTO music_ingestion_events (
            id, candidate_id, event_type, actor_user_id, detail_json, created_at
          ) SELECT ?, ?, 'candidate.api_data_cleared', 'system', ?, ?
            WHERE changes() = 1`,
        ).bind(
          `retention:${now}:${candidate.id}`,
          candidate.id,
          JSON.stringify({ reason: "api_data_expired" }),
          now,
        ),
      ]);
      const results = await this.database.batch(statements);
      for (let index = 0; index < results.length; index += 2) {
        cleared += Number(results[index]?.meta.changes ?? 0);
      }
    }
    return cleared;
  }

  private async readReviewCandidateById(
    candidateIdValue: string,
    jobId?: string,
  ): Promise<IngestionReviewCandidate> {
    const row = await this.database.prepare(
      `SELECT candidate.id, candidate.version, candidate.external_video_id,
        candidate.status, candidate.classification,
        (SELECT channel.id FROM music_channels AS channel
          WHERE channel.provider = 'youtube'
            AND channel.external_channel_id = candidate.channel_id
            AND channel.verification_status = 'approved' AND channel.active = 1
            AND channel.channel_role IN (${officialChannelRoleSql})
          LIMIT 1) AS catalog_channel_id,
        candidate.review_input_json, candidate.linked_performance_id
       FROM music_ingestion_candidates AS candidate
       WHERE candidate.id = ?
         ${jobId ? `AND EXISTS (
           SELECT 1 FROM music_ingestion_candidate_origins AS origin
           WHERE origin.candidate_id = candidate.id AND origin.job_id = ?
         )` : ""}`,
    ).bind(...(jobId ? [candidateIdValue, jobId] : [candidateIdValue])).first<{
      id: string;
      version: number;
      external_video_id: string;
      status: IngestionReviewCandidate["status"];
      classification: IngestionReviewCandidate["classification"];
      catalog_channel_id: string | null;
      review_input_json: string | null;
      linked_performance_id: string | null;
    }>();
    if (!row) {
      throw new IngestionRepositoryError(
        "not_found",
        "Ingestion candidate not found",
      );
    }
    return {
      id: row.id,
      version: Number(row.version),
      videoId: row.external_video_id,
      status: row.status,
      classification: row.classification,
      catalogChannelId: row.catalog_channel_id,
      reviewInput: parseReviewInput(row.review_input_json),
      linkedPerformanceId: row.linked_performance_id,
    };
  }

  readReviewCandidate(jobId: string | null, candidateIdValue: string) {
    return this.readReviewCandidateById(candidateIdValue, jobId ?? undefined);
  }

  private async requireCandidateEvent(eventId: string) {
    const event = await this.database.prepare(
      "SELECT 1 AS matched FROM music_ingestion_events WHERE id = ?",
    ).bind(eventId).first<{ matched: number }>();
    if (!event) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Ingestion candidate changed during review",
      );
    }
  }

  async saveCandidateReview(command: {
    candidateId: string;
    expectedVersion: number;
    expectedReviewInput?: OtwPlayIngestionReviewInput | null;
    expectedReviewStatus?: OtwPlayIngestionCandidateItemDto["status"];
    input: OtwPlayIngestionReviewInput;
    actorUserId: string;
    eventId: string;
    now: number;
  }) {
    const hasExpectedReviewState = command.expectedReviewInput !== undefined &&
      command.expectedReviewStatus !== undefined;
    const current = await this.readReviewCandidateById(command.candidateId);
    let expectedVersion = command.expectedVersion;
    if (current.version !== command.expectedVersion) {
      if (
        !hasExpectedReviewState ||
        current.status !== command.expectedReviewStatus ||
        !sameReviewInput(current.reviewInput, command.expectedReviewInput ?? null)
      ) {
        throw new IngestionRepositoryError(
          "stale_message",
          "Ingestion candidate changed during review",
        );
      }
      expectedVersion = current.version;
    }
    if (
      current.status === "converted" ||
      !["eligible", "scope_review"].includes(current.classification) ||
      !current.catalogChannelId
    ) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Ingestion candidate is not eligible for review saving",
      );
    }
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_candidates
         SET review_input_json = ?, reviewed_by_user_id = ?, status = 'ready',
           classification = 'eligible', exclusion_reason = NULL,
           last_conversion_outcome = NULL, last_conversion_error_code = NULL,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?
           AND classification IN ('eligible', 'scope_review')
           AND status <> 'converted'
           AND EXISTS (
             SELECT 1 FROM music_channels AS channel
             WHERE channel.provider = 'youtube'
               AND channel.external_channel_id = music_ingestion_candidates.channel_id
               AND channel.verification_status = 'approved' AND channel.active = 1
               AND channel.channel_role IN (${officialChannelRoleSql})
           )`,
      ).bind(
        JSON.stringify(command.input),
        command.actorUserId,
        command.now,
        command.candidateId,
        expectedVersion,
      ),
      this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, candidate_id, event_type, actor_user_id, detail_json, created_at
        ) SELECT ?, ?, 'candidate.review_saved', ?, ?, ? WHERE changes() = 1`,
      ).bind(
        command.eventId,
        command.candidateId,
        command.actorUserId,
        JSON.stringify({ changedFields: [
          "song",
          "participants",
          "relationType",
          "releaseType",
          "participationType",
          "internalNote",
        ] }),
        command.now,
      ),
    ]);
    await this.requireCandidateEvent(command.eventId);
    return this.readReviewCandidateById(command.candidateId);
  }

  async ignoreCandidate(command: {
    candidateId: string;
    expectedVersion: number;
    actorUserId: string;
    eventId: string;
    now: number;
  }) {
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_candidates
         SET status = 'ignored', review_input_json = NULL,
           reviewed_by_user_id = ?, retention_expires_at = MAX(
             retention_expires_at, ?
           ), last_conversion_outcome = NULL,
           last_conversion_error_code = NULL,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND status <> 'converted'`,
      ).bind(
        command.actorUserId,
        command.now + BLOCKED_RETENTION_MS,
        command.now,
        command.candidateId,
        command.expectedVersion,
      ),
      this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, candidate_id, event_type, actor_user_id, detail_json, created_at
        ) SELECT ?, ?, 'candidate.ignored', ?, '{}', ? WHERE changes() = 1`,
      ).bind(
        command.eventId,
        command.candidateId,
        command.actorUserId,
        command.now,
      ),
    ]);
    await this.requireCandidateEvent(command.eventId);
    return this.readReviewCandidateById(command.candidateId);
  }

  async refreshCandidateMetadata(command: {
    candidateId: string;
    expectedVersion: number;
    observation: OtwPlayYouTubeVideoObservation;
    actorUserId: string;
    eventId: string;
    now: number;
  }) {
    const video = command.observation.video;
    const [sourceResult, proposalResult, channelResult] = await this.database.batch([
      this.database.prepare(
        `SELECT 1 AS matched FROM music_media_sources
         WHERE provider = 'youtube' AND external_id = ? LIMIT 1`,
      ).bind(command.observation.videoId),
      this.database.prepare(
        `SELECT 1 AS matched FROM music_cover_proposals
         WHERE youtube_video_id = ? AND segment_start_seconds = 0
           AND status = 'pending_review' LIMIT 1`,
      ).bind(command.observation.videoId),
      this.database.prepare(
        `SELECT verification_status, active, channel_role FROM music_channels
         WHERE provider = 'youtube' AND external_channel_id = ? LIMIT 1`,
      ).bind(video?.channelId ?? ""),
    ]);
    const existingSource = resultsOf(sourceResult).length > 0;
    const existingProposal = resultsOf(proposalResult).length > 0;
    const channel = resultsOf(channelResult as D1Result<{
      verification_status: "pending" | "approved" | "revoked";
      active: number;
      channel_role: (typeof OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES)[number] | string;
    }>)[0];
    const unavailable = command.observation.availabilityStatus !== "playable";
    const kids = video?.madeForKids === true;
    const policyBlocked = channel?.verification_status === "revoked" || channel?.active === 0;
    const approved = channel?.verification_status === "approved" &&
      channel.active === 1 && OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES.includes(
        channel.channel_role as (typeof OTW_PLAY_INGESTION_OFFICIAL_CHANNEL_ROLES)[number],
      );
    const scopeReview = video?.scopeReview === true;
    const current = await this.readReviewCandidateById(command.candidateId);
    const classification = existingSource
      ? "existing_catalog"
      : existingProposal
        ? "existing_proposal"
        : unavailable
          ? "unavailable"
          : kids || policyBlocked
            ? "policy_blocked"
            : approved
              ? current.reviewInput ? "eligible" : scopeReview ? "scope_review" : "eligible"
              : "channel_review";
    const status = current.status === "converted" || current.status === "ignored"
      ? current.status
      : unavailable || kids || policyBlocked
        ? "blocked"
        : existingSource || existingProposal
          ? "discovered"
          : approved && current.reviewInput
            ? "ready"
            : approved && !scopeReview
              ? "needs_input"
              : "discovered";
    const exclusionReason = unavailable
      ? command.observation.availabilityStatus
      : kids
        ? "made_for_kids_review"
        : policyBlocked
          ? "channel_policy_blocked"
          : scopeReview && approved && !current.reviewInput
            ? "release_scope_review"
          : null;
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_candidates
         SET title = ?, channel_id = ?, channel_title = ?, thumbnail_url = ?,
           duration_seconds = ?, provider_published_at = ?, availability_status = ?,
           made_for_kids = ?, metadata_checked_at = ?, classification = ?,
           status = ?, exclusion_reason = ?, retention_expires_at = ?,
           reviewed_by_user_id = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND external_video_id = ?`,
      ).bind(
        video?.title ?? null,
        video?.channelId ?? null,
        video?.channelTitle ?? null,
        video?.thumbnailUrl ?? null,
        video?.durationSeconds ?? null,
        video?.publishedAt ?? null,
        command.observation.availabilityStatus,
        video?.madeForKids ?? null,
        command.now,
        classification,
        status,
        exclusionReason,
        command.now + (
          status === "blocked" || status === "ignored"
            ? BLOCKED_RETENTION_MS
            : ACTIVE_RETENTION_MS
        ),
        command.actorUserId,
        command.now,
        command.candidateId,
        command.expectedVersion,
        command.observation.videoId,
      ),
      this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, candidate_id, event_type, actor_user_id, detail_json, created_at
        ) SELECT ?, ?, 'candidate.metadata_refreshed', ?, ?, ? WHERE changes() = 1`,
      ).bind(
        command.eventId,
        command.candidateId,
        command.actorUserId,
        JSON.stringify({ classification, status }),
        command.now,
      ),
    ]);
    await this.requireCandidateEvent(command.eventId);
    return this.readReviewCandidateById(command.candidateId);
  }

  async recordConversionOutcome(command: {
    jobId: string;
    candidateId: string;
    expectedVersion: number;
    outcome: "duplicate" | "stale" | "validation_failed" | "retryable_failed";
    performanceId: string | null;
    errorCode: string | null;
    actorUserId: string;
    eventId: string;
    now: number;
  }) {
    const duplicate = command.outcome === "duplicate";
    const belongsToJob = await this.database.prepare(
      `SELECT 1 AS matched FROM music_ingestion_candidate_origins
       WHERE candidate_id = ? AND job_id = ? LIMIT 1`,
    ).bind(command.candidateId, command.jobId).first<{ matched: number }>();
    if (!belongsToJob) {
      await this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, job_id, event_type, actor_user_id, detail_json, created_at
        ) VALUES (?, ?, 'candidate.convert.validation_failed', ?, ?, ?)`,
      ).bind(
        command.eventId,
        command.jobId,
        command.actorUserId,
        JSON.stringify({
          expectedVersion: command.expectedVersion,
          candidateId: command.candidateId,
          errorCode: "candidate_not_in_job",
        }),
        command.now,
      ).run();
      return "validation_failed" as const;
    }
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_candidates
         SET status = CASE WHEN ? = 1 THEN 'converted' ELSE status END,
           classification = CASE WHEN ? = 1 THEN 'existing_catalog' ELSE classification END,
           linked_performance_id = CASE WHEN ? = 1 THEN ? ELSE linked_performance_id END,
           last_conversion_outcome = ?, last_conversion_error_code = ?,
           last_conversion_attempt_at = ?, reviewed_by_user_id = ?,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND status = 'ready'
           AND EXISTS (
             SELECT 1 FROM music_ingestion_candidate_origins AS origin
             WHERE origin.candidate_id = music_ingestion_candidates.id
               AND origin.job_id = ?
           )`,
      ).bind(
        duplicate ? 1 : 0,
        duplicate ? 1 : 0,
        duplicate ? 1 : 0,
        command.performanceId,
        command.outcome,
        command.errorCode,
        command.now,
        command.actorUserId,
        command.now,
        command.candidateId,
        command.expectedVersion,
        command.jobId,
      ),
      this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, job_id, candidate_id, event_type, actor_user_id, detail_json, created_at
        ) SELECT ?, ?, ?,
          CASE WHEN changes() = 1 THEN ? ELSE 'candidate.convert.stale' END,
          ?, ?, ?`,
      ).bind(
        command.eventId,
        command.jobId,
        command.candidateId,
        `candidate.convert.${command.outcome}`,
        command.actorUserId,
        JSON.stringify({
          expectedVersion: command.expectedVersion,
          candidateId: command.candidateId,
          performanceId: command.performanceId,
          errorCode: command.errorCode,
        }),
        command.now,
      ),
    ]);
    return Number(results[0]?.meta.changes ?? 0) === 1
      ? command.outcome
      : "stale";
  }

  async retryJob(command: {
    jobId: string;
    actorUserId: string;
    eventId: string;
    now: number;
  }) {
    await this.getJob(command.jobId);
    const failed = await this.database.prepare(
      `SELECT idempotency_key FROM music_ingestion_messages
       WHERE job_id = ? AND status = 'failed'
         AND last_error_code IN (
           'queue_retries_exhausted', 'quota_exceeded', 'rate_limited',
           'timeout', 'upstream_unavailable', 'ingestion_internal'
         )
       ORDER BY created_at, idempotency_key LIMIT 100`,
    ).bind(command.jobId).all<{ idempotency_key: string }>();
    const keys = resultsOf(failed).map((row) => row.idempotency_key);
    if (keys.length === 0) return [];
    const placeholders = keys.map(() => "?").join(", ");
    await this.database.batch([
      this.database.prepare(
        `UPDATE music_ingestion_messages
         SET status = 'pending', attempts = 0, last_error_code = NULL,
           next_retry_at = NULL, completed_at = NULL, updated_at = ?
         WHERE job_id = ? AND idempotency_key IN (${placeholders})`,
      ).bind(command.now, command.jobId, ...keys),
      this.database.prepare(
        `UPDATE music_ingestion_jobs
         SET status = 'collecting', last_error_code = NULL,
           next_retry_at = NULL, completed_at = NULL, updated_at = ?
         WHERE id = ?`,
      ).bind(command.now, command.jobId),
      this.database.prepare(
        `INSERT INTO music_ingestion_events (
          id, job_id, event_type, actor_user_id, detail_json, created_at
        ) VALUES (?, ?, 'job.retry_requested', ?, ?, ?)`,
      ).bind(
        command.eventId,
        command.jobId,
        command.actorUserId,
        JSON.stringify({ messageCount: keys.length }),
        command.now,
      ),
    ]);
    return keys.map((key) => queueMessage(command.jobId, key));
  }
}
