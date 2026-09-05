import type {
  OtwPlayChannelMonitorCandidateDto,
  OtwPlayChannelMonitorDto,
  OtwPlayChannelMonitorStatus,
  OtwPlayIngestionReviewInput,
  OtwPlayWebsubSubscriptionStatus,
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
  last_recent_reconciled_at: number | null;
  last_error_code: string | null;
  sync_page_token: string | null;
  sync_base_video_id: string | null;
  sync_newest_video_id: string | null;
  sync_started_at: number | null;
  last_success_at: number | null;
  consecutive_failures: number;
  candidate_count: number;
  pending_candidate_count: number;
  previous_generation_pending_count: number;
  delivery_pending_count: number;
  delivery_failed_count: number;
  delivery_dead_letter_count: number;
  delivery_last_received_at: number | null;
  delivery_last_processed_at: number | null;
  delivery_last_failed_at: number | null;
  delivery_last_error_code: string | null;
  generation: number;
  version: number;
  created_at: number;
  updated_at: number;
  approval_scope: "candidate_collection" | null;
  approval_status: "approved" | "revoked" | null;
  operator_reference: string | null;
  approval_reference: string | null;
  revocation_procedure: string | null;
  approved_by_user_id: string | null;
  approved_at: number | null;
  revoked_by_user_id: string | null;
  revoked_at: number | null;
  approval_version: number | null;
  subscription_id: string | null;
  subscription_status: OtwPlayWebsubSubscriptionStatus | null;
  subscription_pending_mode: "subscribe" | "unsubscribe" | null;
  subscription_secret_version: number | null;
  subscription_requested_at: number | null;
  subscription_verified_at: number | null;
  subscription_lease_expires_at: number | null;
  subscription_last_notification_at: number | null;
  subscription_last_error_code: string | null;
  subscription_version: number | null;
};

const monitorSelect = `SELECT monitor.*,
  channel.display_name AS channel_display_name,
  channel.external_channel_id,
  approval.scope AS approval_scope,
  approval.status AS approval_status,
  approval.operator_reference,
  approval.approval_reference,
  approval.revocation_procedure,
  approval.approved_by_user_id,
  approval.approved_at,
  approval.revoked_by_user_id,
  approval.revoked_at,
  approval.version AS approval_version,
  subscription.id AS subscription_id,
  subscription.status AS subscription_status,
  subscription.pending_mode AS subscription_pending_mode,
  subscription.secret_version AS subscription_secret_version,
  subscription.requested_at AS subscription_requested_at,
  subscription.verified_at AS subscription_verified_at,
  subscription.lease_expires_at AS subscription_lease_expires_at,
  subscription.last_notification_at AS subscription_last_notification_at,
  subscription.last_error_code AS subscription_last_error_code,
  subscription.version AS subscription_version,
  (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
    WHERE origin.monitor_id = monitor.id
      AND origin.monitor_generation = monitor.generation) AS candidate_count,
  (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.monitor_id = monitor.id
      AND origin.monitor_generation = monitor.generation
      AND candidate.status NOT IN ('ignored', 'converted')) AS pending_candidate_count,
  (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
    JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
    WHERE origin.monitor_id = monitor.id
      AND origin.monitor_generation <> monitor.generation
      AND NOT EXISTS (
        SELECT 1 FROM music_channel_upload_candidate_origins AS current_origin
        WHERE current_origin.monitor_id = monitor.id
          AND current_origin.monitor_generation = monitor.generation
          AND current_origin.candidate_id = origin.candidate_id
      )
      AND candidate.status NOT IN ('ignored', 'converted')) AS previous_generation_pending_count,
  (SELECT COUNT(*) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id
      AND delivery.status IN ('pending', 'enqueued', 'processing')) AS delivery_pending_count,
  (SELECT COUNT(*) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id AND delivery.status = 'failed') AS delivery_failed_count,
  (SELECT COUNT(*) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id AND delivery.status = 'dead_letter') AS delivery_dead_letter_count,
  (SELECT MAX(delivery.received_at) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id) AS delivery_last_received_at,
  (SELECT MAX(delivery.processed_at) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id) AS delivery_last_processed_at,
  (SELECT MAX(delivery.updated_at) FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id
      AND delivery.status IN ('failed', 'dead_letter')) AS delivery_last_failed_at,
  (SELECT delivery.last_error_code FROM music_channel_websub_deliveries AS delivery
    WHERE delivery.monitor_id = monitor.id AND delivery.last_error_code IS NOT NULL
    ORDER BY delivery.updated_at DESC, delivery.id DESC LIMIT 1) AS delivery_last_error_code
 FROM music_channel_upload_monitors AS monitor
 JOIN music_channels AS channel ON channel.id = monitor.channel_id
 LEFT JOIN music_channel_automation_approvals AS approval
   ON approval.channel_id = monitor.channel_id
 LEFT JOIN music_channel_websub_subscriptions AS subscription
   ON subscription.monitor_id = monitor.id
  AND subscription.monitor_generation = monitor.generation`;

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
  lastRecentReconciledAt: row.last_recent_reconciled_at === null
    ? null
    : Number(row.last_recent_reconciled_at),
  lastErrorCode: row.last_error_code,
  syncPageToken: row.sync_page_token,
  syncBaseVideoId: row.sync_base_video_id,
  syncNewestVideoId: row.sync_newest_video_id,
  syncStartedAt: row.sync_started_at === null ? null : Number(row.sync_started_at),
  lastSuccessAt: row.last_success_at === null ? null : Number(row.last_success_at),
  consecutiveFailures: Number(row.consecutive_failures),
  automationApproval: row.approval_scope && row.approval_status &&
      row.operator_reference && row.approval_reference &&
      row.revocation_procedure && row.approved_by_user_id &&
      row.approved_at !== null && row.approval_version !== null
    ? {
        scope: row.approval_scope,
        status: row.approval_status,
        operatorReference: row.operator_reference,
        approvalReference: row.approval_reference,
        revocationProcedure: row.revocation_procedure,
        approvedByUserId: row.approved_by_user_id,
        approvedAt: Number(row.approved_at),
        revokedByUserId: row.revoked_by_user_id,
        revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
        version: Number(row.approval_version),
      }
    : null,
  subscription: row.subscription_id && row.subscription_status &&
      row.subscription_secret_version !== null &&
      row.subscription_requested_at !== null && row.subscription_version !== null
    ? {
        id: row.subscription_id,
        status: row.subscription_status,
        pendingMode: row.subscription_pending_mode,
        secretVersion: Number(row.subscription_secret_version),
        requestedAt: Number(row.subscription_requested_at),
        verifiedAt: row.subscription_verified_at === null
          ? null
          : Number(row.subscription_verified_at),
        leaseExpiresAt: row.subscription_lease_expires_at === null
          ? null
          : Number(row.subscription_lease_expires_at),
        lastNotificationAt: row.subscription_last_notification_at === null
          ? null
          : Number(row.subscription_last_notification_at),
        lastErrorCode: row.subscription_last_error_code,
        effectiveActive:
          row.subscription_status === "active" &&
          row.subscription_verified_at !== null &&
          row.subscription_lease_expires_at !== null &&
          Number(row.subscription_lease_expires_at) > Date.now(),
        recoveryReason:
          row.subscription_status !== "active"
            ? `status_${row.subscription_status}`
            : row.subscription_verified_at === null
              ? "unverified"
              : row.subscription_lease_expires_at === null
                ? "lease_missing"
                : Number(row.subscription_lease_expires_at) <= Date.now()
                  ? "lease_expired"
                  : null,
        version: Number(row.subscription_version),
      }
    : null,
  candidateCount: Number(row.candidate_count),
  pendingCandidateCount: Number(row.pending_candidate_count),
  previousGenerationPendingCount: Number(row.previous_generation_pending_count),
  deliveryHealth: {
    pendingCount: Number(row.delivery_pending_count),
    failedCount: Number(row.delivery_failed_count),
    deadLetterCount: Number(row.delivery_dead_letter_count),
    lastReceivedAt: row.delivery_last_received_at === null ? null : Number(row.delivery_last_received_at),
    lastProcessedAt: row.delivery_last_processed_at === null ? null : Number(row.delivery_last_processed_at),
    lastFailedAt: row.delivery_last_failed_at === null ? null : Number(row.delivery_last_failed_at),
    lastErrorCode: row.delivery_last_error_code,
  },
  generation: Number(row.generation),
  version: Number(row.version),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

export class D1ChannelMonitorRepository implements ChannelMonitorRepository {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  private async staleWrite(id: string, expectedVersion: number): Promise<never> {
    const current = await this.get(id);
    throw new IngestionRepositoryError(
      "stale_write",
      "Channel monitor changed during review",
      {
        expectedVersion: String(expectedVersion),
        actualVersion: String(current.version),
      },
    );
  }

  async findApprovableChannel(externalChannelId: string) {
    return await this.readChannel(externalChannelId, false);
  }

  async findEligibleChannel(externalChannelId: string) {
    return await this.readChannel(externalChannelId, true);
  }

  private async readChannel(externalChannelId: string, requireApproval: boolean) {
    return await this.database.prepare(
      `SELECT id, external_channel_id, display_name
       FROM music_channels AS channel
       WHERE external_channel_id = ? AND provider = 'youtube'
          AND channel_role = 'approved_kirinuki'
          AND verification_status = 'approved' AND active = 1
          AND (? = 0 OR EXISTS (
            SELECT 1 FROM music_channel_automation_approvals AS approval
            WHERE approval.channel_id = channel.id
              AND approval.scope = 'candidate_collection'
              AND approval.status = 'approved'
          ))`,
    ).bind(externalChannelId, requireApproval ? 1 : 0).first<EligibleChannelMonitorTarget & {
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
      `${monitorSelect} WHERE channel.external_channel_id = ?
        AND monitor.deleted_at IS NULL`,
    ).bind(externalChannelId).first<MonitorRow>();
    return row ? toDto(row) : null;
  }

  async get(id: string) {
    const row = await this.database.prepare(
      `${monitorSelect} WHERE monitor.id = ? AND monitor.deleted_at IS NULL`,
    ).bind(id).first<MonitorRow>();
    if (!row) throw new IngestionRepositoryError("not_found", "Channel monitor not found");
    return toDto(row);
  }

  async list() {
    const result = await this.database.prepare(
      `${monitorSelect} WHERE monitor.deleted_at IS NULL
        ORDER BY monitor.created_at DESC, monitor.id DESC`,
    ).all<MonitorRow>();
    return resultsOf(result).map(toDto);
  }

  async listCandidates(
    id: string,
    limit: number,
    cursor: Parameters<ChannelMonitorRepository["listCandidates"]>[2],
    generationScope: "current" | "previous" = "current",
  ) {
    const monitor = await this.get(id);
    const cursorSql = cursor
      ? `AND (origin.discovered_at > ?
        OR (origin.discovered_at = ? AND candidate.id > ?))`
      : "";
    const generationSql = generationScope === "current"
      ? "origin.monitor_generation = ?"
      : `origin.monitor_generation <> ?
         AND NOT EXISTS (
           SELECT 1 FROM music_channel_upload_candidate_origins AS current_origin
           WHERE current_origin.monitor_id = origin.monitor_id
             AND current_origin.monitor_generation = ?
             AND current_origin.candidate_id = origin.candidate_id
         )`;
    const statement = this.database.prepare(
      `SELECT candidate.id AS candidate_id, candidate.version AS candidate_version,
        candidate.external_video_id, candidate.title, candidate.channel_title,
        candidate.thumbnail_url, candidate.duration_seconds,
        candidate.provider_published_at, candidate.availability_status,
        candidate.status, candidate.classification, candidate.exclusion_reason,
        candidate.review_input_json, candidate.linked_performance_id,
        candidate.retention_expires_at,
        (SELECT channel.id FROM music_channels AS channel
          WHERE channel.provider = 'youtube'
            AND channel.external_channel_id = candidate.channel_id
            AND channel.channel_role = 'approved_kirinuki'
            AND channel.verification_status = 'approved' AND channel.active = 1
          LIMIT 1) AS catalog_channel_id,
        origin.discovered_at, origin.monitor_generation
       FROM music_channel_upload_candidate_origins AS origin
       JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
       WHERE origin.monitor_id = ? AND ${generationSql}
         AND candidate.status NOT IN ('ignored', 'converted')
         ${cursorSql}
       ORDER BY origin.discovered_at ASC, candidate.id ASC LIMIT ?`,
    );
    const bindings: unknown[] = [id, monitor.generation];
    if (generationScope === "previous") bindings.push(monitor.generation);
    if (cursor) {
      bindings.push(cursor.discoveredAt, cursor.discoveredAt, cursor.candidateId);
    }
    bindings.push(limit + 1);
    const result = await statement.bind(...bindings).all<{
      candidate_id: string;
      candidate_version: number;
      external_video_id: string;
      title: string | null;
      channel_title: string | null;
      thumbnail_url: string | null;
      duration_seconds: number | null;
      provider_published_at: number | null;
      availability_status: OtwPlayChannelMonitorCandidateDto["availabilityStatus"];
      status: OtwPlayChannelMonitorCandidateDto["status"];
      classification: OtwPlayChannelMonitorCandidateDto["classification"];
      exclusion_reason: string | null;
      review_input_json: string | null;
      linked_performance_id: string | null;
      catalog_channel_id: string | null;
      discovered_at: number;
      monitor_generation: number;
      retention_expires_at: number;
    }>();
    const rows = resultsOf(result);
    const items = rows.slice(0, limit).map((row) => ({
      candidateId: row.candidate_id,
      candidateVersion: Number(row.candidate_version),
      videoId: row.external_video_id,
      title: row.title,
      channelTitle: row.channel_title,
      thumbnailUrl: row.thumbnail_url,
      durationSeconds:
        row.duration_seconds === null ? null : Number(row.duration_seconds),
      publishedAt:
        row.provider_published_at === null ? null : Number(row.provider_published_at),
      availabilityStatus: row.availability_status,
      status: row.status,
      classification: row.classification,
      exclusionReason: row.exclusion_reason,
      catalogChannelId: row.catalog_channel_id,
      reviewInput: parseReviewInput(row.review_input_json),
      linkedPerformanceId: row.linked_performance_id,
      discoveredAt: Number(row.discovered_at),
      monitorGeneration: Number(row.monitor_generation),
      retentionExpiresAt: Number(row.retention_expires_at),
    }));
    return { items, hasMore: rows.length > limit };
  }

  async create(input: Parameters<ChannelMonitorRepository["create"]>[0]) {
    await this.database.batch([
      this.database.prepare(
        `INSERT INTO music_channel_automation_approvals (
          channel_id, scope, status, operator_reference, approval_reference,
          revocation_procedure, approved_by_user_id, approved_at,
          version, created_at, updated_at
        ) VALUES (?, 'candidate_collection', 'approved', ?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET
          scope = 'candidate_collection', status = 'approved',
          operator_reference = excluded.operator_reference,
          approval_reference = excluded.approval_reference,
          revocation_procedure = excluded.revocation_procedure,
          approved_by_user_id = excluded.approved_by_user_id,
          approved_at = excluded.approved_at,
          revoked_by_user_id = NULL, revoked_at = NULL,
          version = music_channel_automation_approvals.version + 1,
          updated_at = excluded.updated_at`,
      ).bind(
        input.channel.id,
        input.approval.operatorReference.trim(),
        input.approval.approvalReference.trim(),
        input.approval.revocationProcedure.trim(),
        input.actorUserId,
        input.now,
        input.now,
        input.now,
      ),
      this.database.prepare(
        `INSERT INTO music_channel_upload_monitors (
          id, channel_id, uploads_playlist_id, status, check_interval_minutes,
          next_check_at, last_seen_video_id, generation, created_by_user_id,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, 0, ?, 0, ?, ?)`,
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
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) VALUES (?, 'channel_automation_approval', ?,
          'channel_automation_approval.approved', 'admin', ?, ?, ?)`,
      ).bind(
        input.approvalEventId,
        input.channel.id,
        input.actorUserId,
        JSON.stringify({
          scope: "candidate_collection",
          operatorReference: input.approval.operatorReference.trim(),
          approvalReference: input.approval.approvalReference.trim(),
          revocationProcedure: input.approval.revocationProcedure.trim(),
          publicationAuthorized: false,
        }),
        input.now,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) VALUES (?, 'channel_monitor', ?, 'channel_monitor.created',
          'admin', ?, ?, ?)`,
      ).bind(
        input.eventId,
        input.id,
        input.actorUserId,
        JSON.stringify({
          channelId: input.channel.id,
          externalChannelId: input.channel.externalChannelId,
          generation: 0,
        }),
        input.now,
      ),
    ]);
    return this.get(input.id);
  }

  async updateStatus(
    input: Parameters<ChannelMonitorRepository["updateStatus"]>[0],
  ) {
    const [result] = await this.database.batch([
      this.database.prepare(
        `UPDATE music_channel_upload_monitors
         SET status = ?, next_check_at = ?, lease_until = NULL,
           last_error_code = NULL, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND deleted_at IS NULL
           AND NOT (COALESCE(last_error_code, '') = 'gap_suspected' AND ? = 'active')`,
      ).bind(
        input.status,
        input.status === "active"
          ? input.now
          : input.now + CHECK_INTERVAL_MINUTES * 60_000,
        input.now,
        input.id,
        input.expectedVersion,
        input.status,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_monitor', ?, 'channel_monitor.status_changed',
          'admin', ?, ?, ? WHERE changes() = 1`,
      ).bind(
        input.eventId,
        input.id,
        input.actorUserId,
        JSON.stringify({ status: input.status }),
        input.now,
      ),
    ]);
    if (Number(result?.meta.changes ?? 0) !== 1) {
      const current = await this.get(input.id);
      if (
        current.version === input.expectedVersion &&
        current.lastErrorCode === "gap_suspected" &&
        input.status === "active"
      ) {
        throw new IngestionRepositoryError(
          "validation_failed",
          "Reset the channel monitor watermark before resuming",
        );
      }
      return this.staleWrite(input.id, input.expectedVersion);
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
            generation = generation + 1, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ? AND deleted_at IS NULL`,
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
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_monitor', ?, 'channel_monitor.target_changed',
          'admin', ?, ?, ? WHERE changes() = 1`,
      ).bind(
        input.eventId,
        input.id,
        input.actorUserId,
        JSON.stringify({
          channelId: input.channel.id,
          externalChannelId: input.channel.externalChannelId,
        }),
        input.now,
      ),
    ]);
    if (Number(updateResult?.meta.changes ?? 0) !== 1) {
      return this.staleWrite(input.id, input.expectedVersion);
    }
    return this.get(input.id);
  }

  async resetWatermark(
    input: Parameters<ChannelMonitorRepository["resetWatermark"]>[0],
  ) {
    const [result] = await this.database.batch([
      this.database.prepare(
        `UPDATE music_channel_upload_monitors
         SET status = 'active', last_checked_at = NULL, next_check_at = ?,
           last_seen_video_id = ?, last_seen_published_at = NULL,
           last_error_code = NULL, lease_until = NULL,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      ).bind(
        input.now + CHECK_INTERVAL_MINUTES * 60_000,
        input.lastSeenVideoId,
        input.now,
        input.id,
        input.expectedVersion,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_monitor', ?, 'channel_monitor.watermark_reset',
          'admin', ?, ?, ? WHERE changes() = 1`,
      ).bind(
        input.eventId,
        input.id,
        input.actorUserId,
        JSON.stringify({ lastSeenVideoId: input.lastSeenVideoId }),
        input.now,
      ),
    ]);
    if (Number(result?.meta.changes ?? 0) !== 1) {
      return this.staleWrite(input.id, input.expectedVersion);
    }
    return this.get(input.id);
  }

  async revokeApproval(
    input: Parameters<ChannelMonitorRepository["revokeApproval"]>[0],
  ) {
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE music_channel_automation_approvals
         SET status = 'revoked', revoked_by_user_id = ?, revoked_at = ?,
           version = version + 1, updated_at = ?
         WHERE channel_id = (
           SELECT channel_id FROM music_channel_upload_monitors
           WHERE id = ? AND version = ? AND deleted_at IS NULL
         )
           AND status = 'approved' AND version = ?`,
      ).bind(
        input.actorUserId,
        input.now,
        input.now,
        input.id,
        input.expectedVersion,
        input.expectedApprovalVersion,
      ),
      this.database.prepare(
        `UPDATE music_channel_upload_monitors
         SET status = 'paused', lease_until = NULL,
           next_check_at = ?, version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND deleted_at IS NULL
           AND changes() = 1
           AND EXISTS (
             SELECT 1 FROM music_channel_automation_approvals AS approval
             WHERE approval.channel_id = music_channel_upload_monitors.channel_id
               AND approval.status = 'revoked'
               AND approval.revoked_by_user_id = ? AND approval.revoked_at = ?
           )`,
      ).bind(
        input.now + CHECK_INTERVAL_MINUTES * 60_000,
        input.now,
        input.id,
        input.expectedVersion,
        input.actorUserId,
        input.now,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_automation_approval', monitor.channel_id,
          'channel_automation_approval.revoked', 'admin', ?, ?, ?
          FROM music_channel_upload_monitors AS monitor
          JOIN music_channel_automation_approvals AS approval
            ON approval.channel_id = monitor.channel_id
          WHERE changes() = 1 AND monitor.id = ? AND approval.status = 'revoked'
            AND approval.revoked_by_user_id = ? AND approval.revoked_at = ?`,
      ).bind(
        input.approvalEventId,
        input.actorUserId,
        JSON.stringify({ scope: "candidate_collection" }),
        input.now,
        input.id,
        input.actorUserId,
        input.now,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_monitor', ?, 'channel_monitor.status_changed',
          'admin', ?, ?, ?
          WHERE changes() = 1 AND EXISTS (
            SELECT 1 FROM music_channel_upload_monitors AS monitor
            JOIN music_channel_automation_approvals AS approval
              ON approval.channel_id = monitor.channel_id
            WHERE monitor.id = ? AND monitor.status = 'paused'
              AND approval.status = 'revoked'
              AND approval.revoked_by_user_id = ? AND approval.revoked_at = ?
          )`,
      ).bind(
        input.monitorEventId,
        input.id,
        input.actorUserId,
        JSON.stringify({ status: "paused", reason: "authority_revoked" }),
        input.now,
        input.id,
        input.actorUserId,
        input.now,
      ),
    ]);
    if (
      Number(results[0]?.meta.changes ?? 0) !== 1 ||
      Number(results[1]?.meta.changes ?? 0) !== 1
    ) {
      return this.staleWrite(input.id, input.expectedVersion);
    }
    return this.get(input.id);
  }

  async remove(input: Parameters<ChannelMonitorRepository["remove"]>[0]) {
    const [result] = await this.database.batch([
      this.database.prepare(
        `UPDATE music_channel_upload_monitors
         SET status = 'paused', lease_until = NULL, deleted_at = ?,
           version = version + 1, updated_at = ?
         WHERE id = ? AND version = ? AND deleted_at IS NULL`,
      ).bind(input.now, input.now, input.id, input.expectedVersion),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'channel_monitor', ?, 'channel_monitor.deleted',
          'admin', ?, '{}', ? WHERE changes() = 1`,
      ).bind(input.eventId, input.id, input.actorUserId, input.now),
    ]);
    if (Number(result?.meta.changes ?? 0) !== 1) {
      return this.staleWrite(input.id, input.expectedVersion);
    }
    return { id: input.id };
  }

  async listDueIds(now: number, limit: number) {
    const result = await this.database.prepare(
       `SELECT id FROM music_channel_upload_monitors
       WHERE status = 'active' AND next_check_at <= ?
          AND deleted_at IS NULL
          AND (lease_until IS NULL OR lease_until <= ?)
         AND EXISTS (
           SELECT 1 FROM music_channels AS channel
           WHERE channel.id = music_channel_upload_monitors.channel_id
              AND channel.provider = 'youtube'
              AND channel.channel_role = 'approved_kirinuki'
              AND channel.verification_status = 'approved' AND channel.active = 1
         )
         AND EXISTS (
           SELECT 1 FROM music_channel_automation_approvals AS approval
           WHERE approval.channel_id = music_channel_upload_monitors.channel_id
             AND approval.scope = 'candidate_collection'
             AND approval.status = 'approved'
         )
       ORDER BY next_check_at ASC, id ASC LIMIT ?`,
    ).bind(now, now, limit).all<{ id: string }>();
    return resultsOf(result).map((row) => row.id);
  }

  async listRecentDueIds(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT monitor.id
       FROM music_channel_upload_monitors AS monitor
       JOIN music_channels AS channel ON channel.id = monitor.channel_id
       JOIN music_channel_automation_approvals AS approval
         ON approval.channel_id = monitor.channel_id
       WHERE monitor.status = 'active' AND monitor.deleted_at IS NULL
         AND (monitor.lease_until IS NULL OR monitor.lease_until <= ?)
         AND (monitor.last_recent_reconciled_at IS NULL
           OR monitor.last_recent_reconciled_at <= ?)
         AND channel.provider = 'youtube'
         AND channel.channel_role = 'approved_kirinuki'
         AND channel.verification_status = 'approved' AND channel.active = 1
         AND approval.scope = 'candidate_collection' AND approval.status = 'approved'
       ORDER BY COALESCE(monitor.last_recent_reconciled_at, 0) ASC, monitor.id ASC
       LIMIT ?`,
    ).bind(now, now - 24 * 60 * 60_000, limit).all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }

  async claim(id: string, now: number) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
        SET lease_until = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND status = 'active' AND deleted_at IS NULL
         AND (lease_until IS NULL OR lease_until <= ?)
         AND EXISTS (
           SELECT 1 FROM music_channels AS channel
           WHERE channel.id = music_channel_upload_monitors.channel_id
              AND channel.provider = 'youtube'
              AND channel.channel_role = 'approved_kirinuki'
              AND channel.verification_status = 'approved' AND channel.active = 1
         )
         AND EXISTS (
           SELECT 1 FROM music_channel_automation_approvals AS approval
           WHERE approval.channel_id = music_channel_upload_monitors.channel_id
             AND approval.scope = 'candidate_collection'
             AND approval.status = 'approved'
         )`,
    ).bind(now + LEASE_MS, now, id, now).run();
    return Number(result.meta.changes ?? 0) === 1 ? this.get(id) : null;
  }

  async recordCandidates(input: Parameters<ChannelMonitorRepository["recordCandidates"]>[0]) {
    const before = await this.database.prepare(
      `SELECT COUNT(*) AS count FROM music_channel_upload_candidate_origins
       WHERE monitor_id = ? AND monitor_generation = ?`,
    ).bind(input.monitorId, input.monitorGeneration).first<{ count: number }>();
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
            ) SELECT ?, 'youtube', ?, 'singing_clip', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
              WHERE EXISTS (
                SELECT 1 FROM music_channel_upload_monitors
                WHERE id = ? AND version = ? AND generation = ?
                  AND status = 'active' AND deleted_at IS NULL
                  AND EXISTS (
                    SELECT 1 FROM music_channel_automation_approvals AS approval
                    WHERE approval.channel_id = music_channel_upload_monitors.channel_id
                      AND approval.scope = 'candidate_collection'
                      AND approval.status = 'approved'
                  )
              )
            ON CONFLICT(provider, external_video_id) DO UPDATE SET
              candidate_kind = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN 'singing_clip'
                ELSE music_ingestion_candidates.candidate_kind
              END,
              status = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN excluded.status
                ELSE music_ingestion_candidates.status
              END,
              classification = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN excluded.classification
                ELSE music_ingestion_candidates.classification
              END,
              exclusion_reason = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN excluded.exclusion_reason
                ELSE music_ingestion_candidates.exclusion_reason
              END,
              review_input_json = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN NULL
                ELSE music_ingestion_candidates.review_input_json
              END,
              reviewed_by_user_id = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN NULL
                ELSE music_ingestion_candidates.reviewed_by_user_id
              END,
              last_conversion_outcome = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN NULL
                ELSE music_ingestion_candidates.last_conversion_outcome
              END,
              last_conversion_error_code = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN NULL
                ELSE music_ingestion_candidates.last_conversion_error_code
              END,
              last_conversion_attempt_at = CASE
                WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
                  AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
                  THEN NULL
                ELSE music_ingestion_candidates.last_conversion_attempt_at
              END,
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
            input.monitorId,
            input.expectedVersion,
            input.monitorGeneration,
          ),
          this.database.prepare(
            `INSERT INTO music_channel_upload_candidate_origins (
              monitor_id, candidate_id, provider_published_at, discovered_at,
              monitor_generation
            ) SELECT ?, id, provider_published_at, ?, ?
              FROM music_ingestion_candidates
              WHERE provider = 'youtube' AND external_video_id = ?
                AND EXISTS (
                  SELECT 1 FROM music_channel_upload_monitors
                  WHERE id = ? AND version = ? AND generation = ?
                    AND status = 'active' AND deleted_at IS NULL
                    AND EXISTS (
                      SELECT 1 FROM music_channel_automation_approvals AS approval
                      WHERE approval.channel_id = music_channel_upload_monitors.channel_id
                        AND approval.scope = 'candidate_collection'
                        AND approval.status = 'approved'
                    )
                )
            ON CONFLICT(monitor_id, candidate_id) DO NOTHING`,
          ).bind(
            input.monitorId,
            input.now,
            input.monitorGeneration,
            observation.videoId,
            input.monitorId,
            input.expectedVersion,
            input.monitorGeneration,
          ),
        );
      }
      if (statements.length > 0) await this.database.batch(statements);
    }
    const claim = await this.database.prepare(
      `SELECT 1 AS matched FROM music_channel_upload_monitors
       WHERE id = ? AND version = ? AND generation = ?
         AND status = 'active' AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM music_channel_automation_approvals AS approval
           WHERE approval.channel_id = music_channel_upload_monitors.channel_id
             AND approval.scope = 'candidate_collection'
             AND approval.status = 'approved'
         )`,
    ).bind(
      input.monitorId,
      input.expectedVersion,
      input.monitorGeneration,
    ).first<{ matched: number }>();
    if (!claim) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Channel monitor changed during reconciliation",
      );
    }
    const after = await this.database.prepare(
      `SELECT COUNT(*) AS count FROM music_channel_upload_candidate_origins
       WHERE monitor_id = ? AND monitor_generation = ?`,
    ).bind(input.monitorId, input.monitorGeneration).first<{ count: number }>();
    return Number(after?.count ?? 0) - Number(before?.count ?? 0);
  }

  async complete(input: Parameters<ChannelMonitorRepository["complete"]>[0]) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET last_checked_at = ?, next_check_at = ?, last_seen_video_id = ?,
         last_seen_published_at = ?, last_error_code = NULL, lease_until = NULL,
         sync_page_token = NULL, sync_base_video_id = NULL,
         sync_newest_video_id = NULL, sync_started_at = NULL,
         last_success_at = ?, consecutive_failures = 0,
         version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND generation = ?
          AND status = 'active' AND deleted_at IS NULL
          AND EXISTS (
            SELECT 1 FROM music_channel_automation_approvals AS approval
            WHERE approval.channel_id = music_channel_upload_monitors.channel_id
              AND approval.scope = 'candidate_collection'
              AND approval.status = 'approved'
          )`,
    ).bind(
      input.now,
      input.now + CHECK_INTERVAL_MINUTES * 60_000,
      input.lastSeenVideoId,
      input.lastSeenPublishedAt,
      input.now,
      input.now,
      input.id,
      input.expectedVersion,
      input.monitorGeneration,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Channel monitor changed during reconciliation",
      );
    }
    return this.get(input.id);
  }

  async saveContinuation(
    input: Parameters<ChannelMonitorRepository["saveContinuation"]>[0],
  ) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors SET
         sync_page_token = ?, sync_base_video_id = ?, sync_newest_video_id = ?,
         sync_started_at = COALESCE(sync_started_at, ?), last_checked_at = ?,
         next_check_at = ?, last_error_code = NULL, lease_until = NULL,
         version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND generation = ?
         AND status = 'active' AND deleted_at IS NULL`,
    ).bind(
      input.pageToken,
      input.baseVideoId,
      input.newestVideoId,
      input.now,
      input.now,
      input.now + 15 * 60_000,
      input.now,
      input.id,
      input.expectedVersion,
      input.monitorGeneration,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError("stale_message", "Channel monitor continuation changed");
    }
    return this.get(input.id);
  }

  async completeSupplemental(
    input: Parameters<ChannelMonitorRepository["completeSupplemental"]>[0],
  ) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET last_recent_reconciled_at = ?, lease_until = NULL,
         version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND generation = ?
         AND status = 'active' AND deleted_at IS NULL
         AND EXISTS (
           SELECT 1 FROM music_channel_automation_approvals AS approval
           WHERE approval.channel_id = music_channel_upload_monitors.channel_id
             AND approval.scope = 'candidate_collection'
             AND approval.status = 'approved'
         )`,
    ).bind(
      input.now,
      input.now,
      input.id,
      input.expectedVersion,
      input.monitorGeneration,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Channel monitor changed during supplemental reconciliation",
      );
    }
    return this.get(input.id);
  }

  async markGapSuspected(
    input: Parameters<ChannelMonitorRepository["markGapSuspected"]>[0],
  ) {
    const result = await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET status = 'paused', last_checked_at = ?, next_check_at = ?,
         last_error_code = 'gap_suspected', lease_until = NULL,
         version = version + 1, updated_at = ?
       WHERE id = ? AND version = ? AND generation = ?
         AND status = 'active' AND deleted_at IS NULL`,
    ).bind(
      input.now,
      input.now + CHECK_INTERVAL_MINUTES * 60_000,
      input.now,
      input.id,
      input.expectedVersion,
      input.monitorGeneration,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError(
        "stale_message",
        "Channel monitor changed during reconciliation",
      );
    }
    return this.get(input.id);
  }

  async fail(input: Parameters<ChannelMonitorRepository["fail"]>[0]) {
    await this.database.prepare(
      `UPDATE music_channel_upload_monitors
       SET last_error_code = ?, next_check_at = ?, lease_until = NULL,
          consecutive_failures = consecutive_failures + 1,
          version = version + 1, updated_at = ?
        WHERE id = ? AND version = ? AND generation = ?
          AND status = 'active' AND deleted_at IS NULL`,
    ).bind(
      input.errorCode,
      input.now + 15 * 60_000,
      input.now,
      input.id,
      input.expectedVersion,
      input.monitorGeneration,
    ).run();
  }
}
