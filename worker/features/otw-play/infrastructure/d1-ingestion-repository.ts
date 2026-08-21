import type {
  OtwPlayIngestionCandidateItemDto,
  OtwPlayIngestionClassification,
  OtwPlayIngestionJobDto,
  OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";
import type { IngestionItemCursor } from "../domain/ingestion-cursor";
import {
  IngestionRepositoryError,
  type CreateIngestionJobCommand,
  type IngestionMessageRecord,
  type IngestionRepository,
  type OtwPlayIngestionQueueMessage,
} from "../application/ports/ingestion-repository";
import type {
  OtwPlayYouTubePlaylistPage,
  OtwPlayYouTubeVideoObservation,
} from "../application/ports/youtube-metadata";

const DAY_MS = 86_400_000;
const API_DATA_RETENTION_MS = 30 * DAY_MS;
const ACTIVE_RETENTION_MS = 90 * DAY_MS;
const BLOCKED_RETENTION_MS = 180 * DAY_MS;

const resultsOf = <T>(result: D1Result<T>): T[] =>
  Array.isArray(result.results) ? result.results : [];

type JobRow = {
  id: string;
  source_external_id: string;
  source_title: string;
  owner_channel_id: string;
  owner_channel_title: string;
  import_mode: "all_new" | "recent";
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
            requested_item_count, status, actor_user_id, idempotency_key,
            created_at, updated_at
          ) VALUES (?, 'playlist_import', ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)`,
        ).bind(
          command.jobId,
          command.preflight.playlistId,
          command.preflight.canonicalUrl,
          command.preflight.title,
          command.preflight.ownerChannelId,
          command.preflight.ownerChannelTitle,
          command.input.mode,
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
  ) {
    await this.getJob(jobId);
    const cursorSql = cursor
      ? `AND (origin.playlist_position > ?
        OR (origin.playlist_position = ? AND origin.id > ?))`
      : "";
    const statement = this.database.prepare(
      `SELECT origin.id AS origin_id, candidate.id AS candidate_id,
        candidate.version AS candidate_version, origin.playlist_position,
        origin.playlist_item_id, candidate.external_video_id,
        candidate.status, ${itemClassificationSql} AS item_classification,
        candidate.exclusion_reason, candidate.title, candidate.channel_id,
        candidate.channel_title, candidate.thumbnail_url,
        candidate.duration_seconds, candidate.provider_published_at,
        candidate.availability_status, candidate.made_for_kids,
        candidate.metadata_checked_at
       FROM music_ingestion_candidate_origins AS origin
       JOIN music_ingestion_jobs AS job ON job.id = origin.job_id
       JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
       WHERE origin.job_id = ? ${cursorSql}
       ORDER BY origin.playlist_position ASC, origin.id ASC LIMIT ?`,
    );
    const result = cursor
      ? await statement.bind(
          jobId,
          cursor.position,
          cursor.position,
          cursor.id,
          limit + 1,
        ).all<{
          origin_id: string;
          candidate_id: string;
          candidate_version: number;
          playlist_position: number;
          playlist_item_id: string;
          external_video_id: string;
          status: OtwPlayIngestionCandidateItemDto["status"];
          item_classification: OtwPlayIngestionClassification;
          exclusion_reason: string | null;
          title: string | null;
          channel_id: string | null;
          channel_title: string | null;
          thumbnail_url: string | null;
          duration_seconds: number | null;
          provider_published_at: number | null;
          availability_status: OtwPlaySourceAvailabilityStatus;
          made_for_kids: number | null;
          metadata_checked_at: number | null;
        }>()
      : await statement.bind(jobId, limit + 1).all();
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
        exclusion_reason: string | null;
        title: string | null;
        channel_id: string | null;
        channel_title: string | null;
        thumbnail_url: string | null;
        duration_seconds: number | null;
        provider_published_at: number | null;
        availability_status: OtwPlaySourceAvailabilityStatus;
        made_for_kids: number | null;
        metadata_checked_at: number | null;
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
        exclusionReason: row.exclusion_reason,
        title: row.title,
        channelId: row.channel_id,
        channelTitle: row.channel_title,
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
      (item) => item.position < job.requestedItemCount,
    );
    const uniqueVideoIds = [...new Set(items.map((item) => item.videoId))];
    const reachedLimit = items.some(
      (item) => item.position + 1 >= job.requestedItemCount,
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

    await this.database.batch([
      ...items.flatMap((item) => [
        this.database.prepare(
          `INSERT INTO music_ingestion_candidates (
            id, provider, external_video_id, candidate_kind, status,
            classification, availability_status, first_discovered_at,
            last_discovered_at, retention_expires_at, version, created_at, updated_at
          ) SELECT ?, 'youtube', ?, 'official_video', 'discovered',
            'pending_metadata', 'unknown', ?, ?, ?, 0, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM music_ingestion_messages
            WHERE idempotency_key = ? AND status = 'pending'
          )
          ON CONFLICT(provider, external_video_id) DO UPDATE SET
            last_discovered_at = excluded.last_discovered_at,
            retention_expires_at = MAX(
              music_ingestion_candidates.retention_expires_at,
              excluded.retention_expires_at
            ),
            updated_at = excluded.updated_at`,
        ).bind(
          candidateId(item.videoId),
          item.videoId,
          now,
          now,
          now + ACTIVE_RETENTION_MS,
          now,
          now,
          message.idempotencyKey,
        ),
        this.database.prepare(
          `INSERT OR IGNORE INTO music_ingestion_candidate_origins (
            id, candidate_id, job_id, origin_kind, playlist_id,
            playlist_item_id, playlist_position, is_playlist_duplicate,
            discovered_at
          ) SELECT ?, ?, ?, 'playlist_import', ?, ?, ?,
            EXISTS (
              SELECT 1 FROM music_ingestion_candidate_origins AS prior_origin
              JOIN music_ingestion_candidates AS prior_candidate
                ON prior_candidate.id = prior_origin.candidate_id
              WHERE prior_origin.job_id = ?
                AND prior_candidate.provider = 'youtube'
                AND prior_candidate.external_video_id = ?
            ), ?
          WHERE EXISTS (
            SELECT 1 FROM music_ingestion_messages
            WHERE idempotency_key = ? AND status = 'pending'
          )`,
        ).bind(
          `${message.jobId}:origin:${item.playlistItemId}`,
          candidateId(item.videoId),
          message.jobId,
          job.playlistId,
          item.playlistItemId,
          item.position,
          message.jobId,
          item.videoId,
          now,
          message.idempotencyKey,
        ),
      ]),
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
    await this.database.batch([
      ...observations.map((observation) => {
        const video = observation.video;
        return this.database.prepare(
          `UPDATE music_ingestion_candidates
           SET title = ?, channel_id = ?, channel_title = ?, thumbnail_url = ?,
             duration_seconds = ?, provider_published_at = ?, availability_status = ?,
             made_for_kids = ?, metadata_checked_at = ?, next_retry_at = NULL,
             classification = CASE
               WHEN EXISTS (
                 SELECT 1 FROM music_media_sources
                 WHERE provider = 'youtube' AND external_id = ?
               ) THEN 'existing_catalog'
               WHEN EXISTS (
                 SELECT 1 FROM music_cover_proposals
                 WHERE youtube_video_id = ? AND segment_start_seconds = 0
                   AND status = 'pending_review'
               ) THEN 'existing_proposal'
               WHEN ? <> 'playable' THEN 'unavailable'
               WHEN ? = 1 THEN 'policy_blocked'
               WHEN EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = ?
                   AND (verification_status = 'revoked' OR active = 0)
               ) THEN 'policy_blocked'
               WHEN EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = ?
                   AND verification_status = 'approved' AND active = 1
               ) THEN 'eligible'
               ELSE 'channel_review'
             END,
             status = CASE
               WHEN ? <> 'playable' OR ? = 1 OR EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = ?
                   AND (verification_status = 'revoked' OR active = 0)
               ) THEN 'blocked'
               WHEN EXISTS (
                 SELECT 1 FROM music_media_sources
                 WHERE provider = 'youtube' AND external_id = ?
               ) OR EXISTS (
                 SELECT 1 FROM music_cover_proposals
                 WHERE youtube_video_id = ? AND segment_start_seconds = 0
                   AND status = 'pending_review'
               ) THEN 'discovered'
               WHEN EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = ?
                   AND verification_status = 'approved' AND active = 1
               ) THEN 'needs_input'
               ELSE 'discovered'
             END,
             exclusion_reason = CASE
               WHEN ? <> 'playable' THEN ?
               WHEN ? = 1 THEN 'made_for_kids_review'
               WHEN EXISTS (
                 SELECT 1 FROM music_channels
                 WHERE provider = 'youtube' AND external_channel_id = ?
                   AND (verification_status = 'revoked' OR active = 0)
               ) THEN 'channel_policy_blocked'
               ELSE NULL
             END,
             retention_expires_at = CASE
               WHEN ? <> 'playable' OR ? = 1 THEN ? ELSE ? END,
             version = version + 1, updated_at = ?
           WHERE provider = 'youtube' AND external_video_id = ?
             AND EXISTS (
               SELECT 1 FROM music_ingestion_messages
               WHERE idempotency_key = ? AND status = 'pending'
             )`,
        ).bind(
          video?.title ?? null,
          video?.channelId ?? null,
          video?.channelTitle ?? null,
          video?.thumbnailUrl ?? null,
          video?.durationSeconds ?? null,
          video?.publishedAt ?? null,
          observation.availabilityStatus,
          video?.madeForKids ?? null,
          now,
          observation.videoId,
          observation.videoId,
          observation.availabilityStatus,
          video?.madeForKids === true ? 1 : 0,
          video?.channelId ?? "",
          video?.channelId ?? "",
          observation.availabilityStatus,
          video?.madeForKids === true ? 1 : 0,
          video?.channelId ?? "",
          observation.videoId,
          observation.videoId,
          video?.channelId ?? "",
          observation.availabilityStatus,
          observation.availabilityStatus,
          video?.madeForKids === true ? 1 : 0,
          video?.channelId ?? "",
          observation.availabilityStatus,
          video?.madeForKids === true ? 1 : 0,
          now + BLOCKED_RETENTION_MS,
          now + ACTIVE_RETENTION_MS,
          now,
          observation.videoId,
          message.idempotencyKey,
        );
      }),
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
    const result = await this.database.prepare(
      `UPDATE music_ingestion_candidates
       SET title = NULL, channel_id = NULL, channel_title = NULL,
         thumbnail_url = NULL, duration_seconds = NULL,
         provider_published_at = NULL, made_for_kids = NULL,
         availability_status = 'unknown', metadata_checked_at = NULL,
         version = version + 1, updated_at = ?
       WHERE id IN (
         SELECT id FROM music_ingestion_candidates
         WHERE metadata_checked_at IS NOT NULL
           AND (metadata_checked_at <= ? OR retention_expires_at <= ?)
         ORDER BY metadata_checked_at, id
         LIMIT ?
       )`,
    ).bind(now, now - API_DATA_RETENTION_MS, now, limit).run();
    return Number(result.meta.changes ?? 0);
  }
}
