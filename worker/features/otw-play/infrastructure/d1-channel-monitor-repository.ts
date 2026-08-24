import type {
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayChannelMonitorDto,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import {
  IngestionRepositoryError,
} from "../application/ports/ingestion-repository";
import type {
  ChannelMonitorRepository,
  EligibleChannelMonitorTarget,
} from "../application/ports/channel-monitor-repository";

const CHECK_INTERVAL_MINUTES = 360;
const LEASE_MS = 5 * 60_000;
const RETENTION_MS = 180 * 86_400_000;

const resultsOf = <T>(result: D1Result<T>): T[] =>
  Array.isArray(result.results) ? result.results : [];

type MonitorRow = {
  id: string;
  channel_id: string;
  channel_display_name: string;
  external_channel_id: string;
  uploads_playlist_id: string;
  status: OtwPlayChannelMonitorStatus;
  check_interval_minutes: number;
  last_checked_at: number | null;
  next_check_at: number;
  last_seen_video_id: string | null;
  last_seen_published_at: number | null;
  last_error_code: string | null;
  candidate_count: number;
  pending_candidate_count: number;
  version: number;
  created_at: number;
  updated_at: number;
};

const monitorSelect = `SELECT monitor.*,
  channel.display_name AS channel_display_name,
  channel.external_channel_id,
  (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
    WHERE origin.monitor_id = monitor.id) AS candidate_count,
  (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.monitor_id = monitor.id
      AND candidate.status NOT IN ('ignored', 'converted')) AS pending_candidate_count
 FROM music_channel_upload_monitors AS monitor
 JOIN music_channels AS channel ON channel.id = monitor.channel_id`;

const toDto = (row: MonitorRow): OtwPlayChannelMonitorDto => ({
  id: row.id,
  channelId: row.channel_id,
  channelDisplayName: row.channel_display_name,
  externalChannelId: row.external_channel_id,
  uploadsPlaylistId: row.uploads_playlist_id,
  status: row.status,
  checkIntervalMinutes: Number(row.check_interval_minutes),
  lastCheckedAt: row.last_checked_at === null ? null : Number(row.last_checked_at),
  nextCheckAt: Number(row.next_check_at),
  lastSeenVideoId: row.last_seen_video_id,
  lastSeenPublishedAt:
    row.last_seen_published_at === null ? null : Number(row.last_seen_published_at),
  lastErrorCode: row.last_error_code,
  candidateCount: Number(row.candidate_count),
  pendingCandidateCount: Number(row.pending_candidate_count),
  version: Number(row.version),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

export class D1ChannelMonitorRepository implements ChannelMonitorRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  async findEligibleChannel(externalChannelId: string) {
    return await this.database.prepare(
      `SELECT id, external_channel_id, display_name
       FROM music_channels
       WHERE external_channel_id = ? AND provider = 'youtube'
         AND verification_status = 'approved' AND active = 1`,
    ).bind(externalChannelId).first<EligibleChannelMonitorTarget & {
      external_channel_id: string;
      display_name: string;
    }>().then((row) => row ? ({
      id: row.id,
      externalChannelId: row.external_channel_id,
      displayName: row.display_name,
    }) : null);
  }

  async findByExternalChannel(externalChannelId: string) {
    const row = await this.database.prepare(
      `${monitorSelect} WHERE channel.external_channel_id = ?`,
    ).bind(externalChannelId).first<MonitorRow>();
    return row ? toDto(row) : null;
  }

  async get(id: string) {
    const row = await this.database.prepare(
      `${monitorSelect} WHERE monitor.id = ?`,
    ).bind(id).first<MonitorRow>();
    if (!row) throw new IngestionRepositoryError("not_found", "Channel monitor not found");
    return toDto(row);
  }

  async list() {
    const result = await this.database.prepare(
      `${monitorSelect} ORDER BY monitor.created_at DESC, monitor.id DESC`,
    ).all<MonitorRow>();
    return resultsOf(result).map(toDto);
  }

  async listCandidates(id: string, limit: number) {
    await this.get(id);
    const result = await this.database.prepare(
      `SELECT candidate.id AS candidate_id, candidate.version AS candidate_version,
        candidate.external_video_id, candidate.title, candidate.thumbnail_url,
        candidate.provider_published_at, candidate.availability_status,
        candidate.status, candidate.classification, candidate.exclusion_reason,
        origin.discovered_at
       FROM music_channel_upload_candidate_origins AS origin
       JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
       WHERE origin.monitor_id = ?
       ORDER BY origin.discovered_at DESC, candidate.id DESC LIMIT ?`,
    ).bind(id, limit).all<{
      candidate_id: string;
      candidate_version: number;
      external_video_id: string;
      title: string | null;
      thumbnail_url: string | null;
      provider_published_at: number | null;
      availability_status: OtwPlayChannelMonitorCandidateDto["availabilityStatus"];
      status: OtwPlayChannelMonitorCandidateDto["status"];
      classification: OtwPlayChannelMonitorCandidateDto["classification"];
      exclusion_reason: string | null;
      discovered_at: number;
    }>();
    return resultsOf(result).map((row) => ({
      candidateId: row.candidate_id,
      candidateVersion: Number(row.candidate_version),
      videoId: row.external_video_id,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      publishedAt:
        row.provider_published_at === null ? null : Number(row.provider_published_at),
      availabilityStatus: row.availability_status,
      status: row.status,
      classification: row.classification,
      exclusionReason: row.exclusion_reason,
      discoveredAt: Number(row.discovered_at),
    }));
  }

  async create(input: Parameters<ChannelMonitorRepository["create"]>[0]) {
    await this.database.prepare(
      `INSERT INTO music_channel_upload_monitors (
        id, channel_id, uploads_playlist_id, status, check_interval_minutes,
        next_check_at, last_seen_video_id, created_by_user_id,
        version, created_at, updated_at
      ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, 0, ?, ?)`,
    ).bind(
      input.id,
      input.channel.id,
      input.uploadsPlaylistId,
      CHECK_INTERVAL_MINUTES,
      input.now + CHECK_INTERVAL_MINUTES * 60_000,
      input.lastSeenVideoId,
      input.actorUserId,
      input.now,
      input.now,
    ).run();
    return this.get(input.id);
  }

  async updateStatus(input: {
    id: string;
    expectedVersion: number;
    status: OtwPlayChannelMonitorStatus;
    now: number;
  }) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET status = ?, next_check_at = ?, lease_until = NULL,
         last_error_code = NULL, version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
    ).bind(
      input.status,
      input.status === "active"
        ? input.now
        : input.now + CHECK_INTERVAL_MINUTES * 60_000,
      input.now,
      input.id,
      input.expectedVersion,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      await this.get(input.id);
      throw new IngestionRepositoryError("validation_failed", "Channel monitor changed during review");
    }
    return this.get(input.id);
  }

  async updateTarget(input: Parameters<ChannelMonitorRepository["updateTarget"]>[0]) {
    const [updateResult] = await this.database.batch([
      this.database.prepare(
        `UPDATE music_channel_upload_monitors
         SET channel_id = ?, uploads_playlist_id = ?, last_checked_at = NULL,
           next_check_at = ?, last_seen_video_id = ?, last_seen_published_at = NULL,
           last_error_code = NULL, lease_until = NULL,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
      ).bind(
        input.channel.id,
        input.uploadsPlaylistId,
        input.now + CHECK_INTERVAL_MINUTES * 60_000,
        input.lastSeenVideoId,
        input.now,
        input.id,
        input.expectedVersion,
      ),
      this.database.prepare(
        `DELETE FROM music_channel_upload_candidate_origins
         WHERE monitor_id = ?
           AND EXISTS (
             SELECT 1 FROM music_channel_upload_monitors
             WHERE id = ? AND channel_id = ? AND version = ?
           )`,
      ).bind(
        input.id,
        input.id,
        input.channel.id,
        input.expectedVersion + 1,
      ),
    ]);
    if (Number(updateResult?.meta.changes ?? 0) !== 1) {
      await this.get(input.id);
      throw new IngestionRepositoryError(
        "validation_failed",
        "Channel monitor changed during review",
      );
    }
    return this.get(input.id);
  }

  async remove(input: { id: string; expectedVersion: number }) {
    const result = await this.database.prepare(
      "DELETE FROM music_channel_upload_monitors WHERE id = ? AND version = ?",
    ).bind(input.id, input.expectedVersion).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      await this.get(input.id);
      throw new IngestionRepositoryError(
        "validation_failed",
        "Channel monitor changed during review",
      );
    }
    return { id: input.id };
  }

  async listDueIds(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT id FROM music_channel_upload_monitors
       WHERE status = 'active' AND next_check_at <= ?
         AND (lease_until IS NULL OR lease_until <= ?)
         AND EXISTS (
           SELECT 1 FROM music_channels AS channel
           WHERE channel.id = music_channel_upload_monitors.channel_id
             AND channel.provider = 'youtube'
             AND channel.verification_status = 'approved' AND channel.active = 1
         )
       ORDER BY next_check_at ASC, id ASC LIMIT ?`,
    ).bind(now, now, limit).all<{ id: string }>();
    return resultsOf(result).map((row) => row.id);
  }

  async claim(id: string, now: number) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET lease_until = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'active'
         AND (lease_until IS NULL OR lease_until <= ?)
         AND EXISTS (
           SELECT 1 FROM music_channels AS channel
           WHERE channel.id = music_channel_upload_monitors.channel_id
             AND channel.provider = 'youtube'
             AND channel.verification_status = 'approved' AND channel.active = 1
         )`,
    ).bind(now + LEASE_MS, now, id, now).run();
    return Number(result.meta.changes ?? 0) === 1 ? this.get(id) : null;
  }

  async recordCandidates(input: Parameters<ChannelMonitorRepository["recordCandidates"]>[0]) {
    const before = await this.database.prepare(
      `SELECT COUNT(*) AS count FROM music_channel_upload_candidate_origins WHERE monitor_id = ?`,
    ).bind(input.monitorId).first<{ count: number }>();
    for (let index = 0; index < input.observations.length; index += 50) {
      const statements: D1PreparedStatement[] = [];
      for (const observation of input.observations.slice(index, index + 50)) {
        const video = observation.video;
        const blocked = observation.availabilityStatus !== "playable" || video?.madeForKids === true;
        const classification = video?.madeForKids === true
          ? "policy_blocked"
          : observation.availabilityStatus === "playable"
            ? "scope_review"
            : "unavailable";
        const exclusionReason = video?.madeForKids === true
          ? "made_for_kids"
          : observation.availabilityStatus === "playable"
            ? null
            : observation.availabilityStatus;
        statements.push(
          this.database.prepare(
            `INSERT INTO music_ingestion_candidates (
              id, provider, external_video_id, candidate_kind, status, classification,
              exclusion_reason, title, channel_id, channel_title, thumbnail_url,
              duration_seconds, provider_published_at, availability_status,
              made_for_kids, metadata_checked_at, first_discovered_at,
              last_discovered_at, retention_expires_at, version, created_at, updated_at
            ) VALUES (?, 'youtube', ?, 'singing_clip', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
            ON CONFLICT(provider, external_video_id) DO UPDATE SET
              title = excluded.title, channel_id = excluded.channel_id,
              channel_title = excluded.channel_title, thumbnail_url = excluded.thumbnail_url,
              duration_seconds = excluded.duration_seconds,
              provider_published_at = excluded.provider_published_at,
              availability_status = excluded.availability_status,
              made_for_kids = excluded.made_for_kids,
              metadata_checked_at = excluded.metadata_checked_at,
              last_discovered_at = excluded.last_discovered_at,
              retention_expires_at = MAX(music_ingestion_candidates.retention_expires_at, excluded.retention_expires_at),
              version = music_ingestion_candidates.version + 1,
              updated_at = excluded.updated_at`,
          ).bind(
            `youtube:${observation.videoId}`,
            observation.videoId,
            blocked ? "blocked" : "needs_input",
            classification,
            exclusionReason,
            video?.title ?? null,
            video?.channelId ?? null,
            video?.channelTitle ?? null,
            video?.thumbnailUrl ?? null,
            video?.durationSeconds ?? null,
            video?.publishedAt ?? null,
            observation.availabilityStatus,
            video?.madeForKids ?? null,
            input.now,
            input.now,
            input.now,
            input.now + RETENTION_MS,
            input.now,
            input.now,
          ),
          this.database.prepare(
            `INSERT INTO music_channel_upload_candidate_origins (
              monitor_id, candidate_id, provider_published_at, discovered_at
            ) SELECT ?, id, provider_published_at, ?
              FROM music_ingestion_candidates
              WHERE provider = 'youtube' AND external_video_id = ?
            ON CONFLICT(monitor_id, candidate_id) DO NOTHING`,
          ).bind(input.monitorId, input.now, observation.videoId),
        );
      }
      if (statements.length > 0) await this.database.batch(statements);
    }
    const after = await this.database.prepare(
      `SELECT COUNT(*) AS count FROM music_channel_upload_candidate_origins WHERE monitor_id = ?`,
    ).bind(input.monitorId).first<{ count: number }>();
    return Number(after?.count ?? 0) - Number(before?.count ?? 0);
  }

  async complete(input: Parameters<ChannelMonitorRepository["complete"]>[0]) {
    await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET last_checked_at = ?, next_check_at = ?, last_seen_video_id = ?,
         last_seen_published_at = ?, last_error_code = NULL, lease_until = NULL,
         version = version + 1, updated_at = ?
       WHERE id = ?`,
    ).bind(
      input.now,
      input.now + CHECK_INTERVAL_MINUTES * 60_000,
      input.lastSeenVideoId,
      input.lastSeenPublishedAt,
      input.now,
      input.id,
    ).run();
    return this.get(input.id);
  }

  async fail(input: { id: string; errorCode: string; now: number }) {
    await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET last_error_code = ?, next_check_at = ?, lease_until = NULL,
         version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(input.errorCode, input.now + 15 * 60_000, input.now, input.id).run();
  }
}
