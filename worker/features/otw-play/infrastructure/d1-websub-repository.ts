import type {
  OtwPlayChannelMonitorDto,
  OtwPlayWebsubSubscriptionStatus,
} from "@contracts/otw-play";
import { IngestionRepositoryError } from "../application/ports/ingestion-repository";
import type {
  WebsubRepository,
  WebsubSubscriptionAuthority,
} from "../application/ports/websub-repository";
import { D1ChannelMonitorRepository } from "./d1-channel-monitor-repository";

const RETENTION_MS = 180 * 86_400_000;
const DELIVERY_RECOVERY_MS = 60_000;
const ENQUEUED_RECOVERY_MS = 15 * 60_000;
const PROCESSING_RECOVERY_MS = 5 * 60_000;
const INTENT_RECOVERY_MS = 15 * 60_000;

const subscriptionSelect = `SELECT subscription.*,
  channel.external_channel_id,
  monitor.status AS monitor_status,
  monitor.deleted_at AS monitor_deleted_at,
  approval.status AS approval_status
 FROM music_channel_websub_subscriptions AS subscription
 JOIN music_channel_upload_monitors AS monitor ON monitor.id = subscription.monitor_id
 JOIN music_channels AS channel ON channel.id = monitor.channel_id
 LEFT JOIN music_channel_automation_approvals AS approval
   ON approval.channel_id = monitor.channel_id
  AND approval.scope = 'candidate_collection'`;

type SubscriptionRow = {
  id: string;
  monitor_id: string;
  monitor_generation: number;
  external_channel_id: string;
  topic_url: string;
  callback_token_hash: string;
  secret_version: number;
  status: OtwPlayWebsubSubscriptionStatus;
  pending_mode: "subscribe" | "unsubscribe" | null;
  requested_at: number;
  verified_at: number | null;
  lease_expires_at: number | null;
  monitor_status: "active" | "paused";
  monitor_deleted_at: number | null;
  approval_status: "approved" | "revoked" | null;
};

const toSubscription = (row: SubscriptionRow): WebsubSubscriptionAuthority => ({
  id: row.id,
  monitorId: row.monitor_id,
  monitorGeneration: Number(row.monitor_generation),
  externalChannelId: row.external_channel_id,
  topicUrl: row.topic_url,
  callbackTokenHash: row.callback_token_hash,
  secretVersion: Number(row.secret_version),
  status: row.status,
  pendingMode: row.pending_mode,
  requestedAt: Number(row.requested_at),
  verifiedAt: row.verified_at === null ? null : Number(row.verified_at),
  leaseExpiresAt: row.lease_expires_at === null ? null : Number(row.lease_expires_at),
  monitorStatus: row.monitor_status,
  monitorDeletedAt: row.monitor_deleted_at === null ? null : Number(row.monitor_deleted_at),
  approvalStatus: row.approval_status,
});

export class D1WebsubRepository implements WebsubRepository {
  private readonly monitorRepository: D1ChannelMonitorRepository;
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
    this.monitorRepository = new D1ChannelMonitorRepository(database);
  }

  getMonitor(id: string): Promise<OtwPlayChannelMonitorDto> {
    return this.monitorRepository.get(id);
  }

  async getCurrentSubscription(monitorId: string, monitorGeneration: number) {
    const row = await this.database.prepare(
      `${subscriptionSelect}
       WHERE subscription.monitor_id = ? AND subscription.monitor_generation = ?`,
    ).bind(monitorId, monitorGeneration).first<SubscriptionRow>();
    return row ? toSubscription(row) : null;
  }

  async findSubscriptionByTokenHash(callbackTokenHash: string) {
    const row = await this.database.prepare(
      `${subscriptionSelect} WHERE subscription.callback_token_hash = ?`,
    ).bind(callbackTokenHash).first<SubscriptionRow>();
    return row ? toSubscription(row) : null;
  }

  async prepareSubscription(input: Parameters<WebsubRepository["prepareSubscription"]>[0]) {
    const [result] = await this.database.batch([
      this.database.prepare(
        `INSERT INTO music_channel_websub_subscriptions (
          id, monitor_id, monitor_generation, topic_url, callback_token_hash,
          secret_version, status, pending_mode, requested_at, version,
          created_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM music_channel_upload_monitors AS monitor
            JOIN music_channels AS channel ON channel.id = monitor.channel_id
            LEFT JOIN music_channel_automation_approvals AS approval
              ON approval.channel_id = channel.id
            WHERE monitor.id = ? AND monitor.generation = ?
              AND monitor.deleted_at IS NULL AND channel.provider = 'youtube'
              AND (
                (? = 'unsubscribe' AND EXISTS (
                  SELECT 1 FROM music_channel_websub_subscriptions AS current
                  WHERE current.id = ? AND current.monitor_id = monitor.id
                    AND current.monitor_generation = monitor.generation
                    AND current.status <> 'unsubscribed'
                ))
                OR (? = 'subscribe'
                  AND monitor.status = 'active'
                  AND channel.channel_role = 'approved_kirinuki'
                  AND channel.verification_status = 'approved' AND channel.active = 1
                  AND approval.scope = 'candidate_collection'
                  AND approval.status = 'approved')
              )
          )
        ON CONFLICT(monitor_id, monitor_generation) DO UPDATE SET
          topic_url = excluded.topic_url,
          callback_token_hash = excluded.callback_token_hash,
          secret_version = excluded.secret_version,
          status = excluded.status,
          pending_mode = excluded.pending_mode,
          requested_at = excluded.requested_at,
          last_error_code = NULL,
          version = music_channel_websub_subscriptions.version + 1,
          updated_at = excluded.updated_at`,
      ).bind(
        input.id,
        input.monitorId,
        input.monitorGeneration,
        input.topicUrl,
        input.callbackTokenHash,
        input.secretVersion,
        input.status,
        input.pendingMode,
        input.now,
        input.now,
        input.now,
        input.monitorId,
        input.monitorGeneration,
        input.pendingMode,
        input.id,
        input.pendingMode,
      ),
      this.database.prepare(
        `INSERT INTO music_catalog_events (
          id, aggregate_type, aggregate_id, event_type, actor_kind,
          actor_user_id, detail_json, created_at
        ) SELECT ?, 'websub_subscription', ?, ?, 'admin', ?, ?, ?
          WHERE changes() = 1`,
      ).bind(
        input.eventId,
        input.id,
        `websub_subscription.${input.pendingMode}_requested`,
        input.actorUserId,
        JSON.stringify({
          monitorId: input.monitorId,
          monitorGeneration: input.monitorGeneration,
          secretVersion: input.secretVersion,
        }),
        input.now,
      ),
    ]);
    if (Number(result?.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError(
        "validation_failed",
        input.pendingMode === "unsubscribe"
          ? "A current WebSub subscription is required"
          : "An active rights-approved monitor is required",
      );
    }
  }

  async markSubscriptionVerified(
    input: Parameters<WebsubRepository["markSubscriptionVerified"]>[0],
  ) {
    const result = await this.database.prepare(
      `UPDATE music_channel_websub_subscriptions
       SET status = ?, pending_mode = NULL, verified_at = ?, lease_expires_at = ?,
         last_error_code = NULL, version = version + 1, updated_at = ?
       WHERE id = ? AND pending_mode = ?
         AND status IN ('pending', 'renewing', 'unsubscribing')`,
    ).bind(
      input.mode === "subscribe" ? "active" : "unsubscribed",
      input.now,
      input.leaseExpiresAt,
      input.now,
      input.id,
      input.mode,
    ).run();
    if (Number(result.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError("stale_message", "WebSub intent is no longer pending");
    }
  }

  async markSubscriptionDenied(id: string, errorCode: string, now: number) {
    await this.database.prepare(
      `UPDATE music_channel_websub_subscriptions
       SET status = 'denied', pending_mode = NULL, last_error_code = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(errorCode, now, id).run();
  }

  async markSubscriptionFailed(
    id: string,
    errorCode: string,
    fallbackStatus: "active" | "failed",
    now: number,
  ) {
    await this.database.prepare(
      `UPDATE music_channel_websub_subscriptions
       SET status = ?, pending_mode = NULL, last_error_code = ?,
         version = version + 1, updated_at = ? WHERE id = ?`,
    ).bind(fallbackStatus, errorCode, now, id).run();
  }

  async recordDelivery(input: Parameters<WebsubRepository["recordDelivery"]>[0]) {
    const [insert] = await this.database.batch([
      this.database.prepare(
        `INSERT INTO music_channel_websub_deliveries (
          id, subscription_id, monitor_id, monitor_generation,
          external_channel_id, external_video_id, provider_updated_at,
          status, attempt_count, received_at, updated_at
        ) SELECT ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM music_channel_websub_subscriptions AS subscription
            JOIN music_channel_upload_monitors AS monitor
              ON monitor.id = subscription.monitor_id
            JOIN music_channels AS channel ON channel.id = monitor.channel_id
            JOIN music_channel_automation_approvals AS approval
              ON approval.channel_id = monitor.channel_id
            WHERE subscription.id = ? AND subscription.status = 'active'
              AND subscription.verified_at IS NOT NULL
              AND subscription.lease_expires_at IS NOT NULL
              AND subscription.lease_expires_at > ?
              AND subscription.monitor_id = ?
              AND subscription.monitor_generation = ?
              AND monitor.generation = subscription.monitor_generation
              AND monitor.status = 'active' AND monitor.deleted_at IS NULL
              AND channel.provider = 'youtube'
              AND channel.channel_role = 'approved_kirinuki'
              AND channel.verification_status = 'approved' AND channel.active = 1
              AND approval.scope = 'candidate_collection'
              AND approval.status = 'approved'
          )
        ON CONFLICT(subscription_id, external_video_id, provider_updated_at) DO NOTHING`,
      ).bind(
        input.id,
        input.subscription.id,
        input.subscription.monitorId,
        input.subscription.monitorGeneration,
        input.externalChannelId,
        input.externalVideoId,
        input.providerUpdatedAt,
        input.now,
        input.now,
        input.subscription.id,
        input.now,
        input.subscription.monitorId,
        input.subscription.monitorGeneration,
      ),
      this.database.prepare(
        `UPDATE music_channel_websub_subscriptions
         SET last_notification_at = MAX(COALESCE(last_notification_at, 0), ?),
           version = version + 1, updated_at = ?
         WHERE id = ? AND status = 'active'
           AND verified_at IS NOT NULL
           AND lease_expires_at IS NOT NULL
           AND lease_expires_at > ?
           AND EXISTS (
             SELECT 1 FROM music_channel_upload_monitors AS monitor
             JOIN music_channels AS channel ON channel.id = monitor.channel_id
             JOIN music_channel_automation_approvals AS approval
               ON approval.channel_id = monitor.channel_id
             WHERE monitor.id = music_channel_websub_subscriptions.monitor_id
                AND monitor.generation = music_channel_websub_subscriptions.monitor_generation
                AND monitor.status = 'active' AND monitor.deleted_at IS NULL
                AND channel.provider = 'youtube'
                AND channel.channel_role = 'approved_kirinuki'
                AND channel.verification_status = 'approved' AND channel.active = 1
                AND approval.scope = 'candidate_collection'
               AND approval.status = 'approved'
           )`,
      ).bind(input.now, input.now, input.subscription.id, input.now),
    ]);
    if (Number(insert?.meta.changes ?? 0) === 1) {
      return { id: input.id, shouldEnqueue: true };
    }
    const existing = await this.database.prepare(
      `SELECT id, status FROM music_channel_websub_deliveries
       WHERE subscription_id = ? AND external_video_id = ? AND provider_updated_at = ?`,
    ).bind(
      input.subscription.id,
      input.externalVideoId,
      input.providerUpdatedAt,
    ).first<{ id: string; status: string }>();
    if (!existing) {
      throw new IngestionRepositoryError(
        "stale_message",
        "WebSub delivery authority changed",
      );
    }
    return {
      id: existing.id,
      shouldEnqueue: existing.status === "pending" || existing.status === "failed",
    };
  }

  async markDeliveryEnqueued(id: string, now: number) {
    await this.database.prepare(
      `UPDATE music_channel_websub_deliveries
       SET status = 'enqueued', enqueued_at = ?, last_error_code = NULL, updated_at = ?
       WHERE id = ? AND status IN ('pending', 'failed')`,
    ).bind(now, now, id).run();
  }

  async markDeliveryFailed(id: string, errorCode: string, now: number) {
    await this.database.prepare(
      `UPDATE music_channel_websub_deliveries
       SET status = 'failed', last_error_code = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('completed', 'rejected', 'dead_letter')`,
    ).bind(errorCode, now, id).run();
  }

  async claimDelivery(id: string, now: number) {
    const result = await this.database.prepare(
      `UPDATE music_channel_websub_deliveries
       SET status = 'processing', attempt_count = attempt_count + 1, updated_at = ?
       WHERE id = ? AND (
         status IN ('pending', 'enqueued', 'failed')
         OR (status = 'processing' AND updated_at <= ?)
       )`,
    ).bind(now, id, now - PROCESSING_RECOVERY_MS).run();
    if (Number(result.meta.changes ?? 0) !== 1) return null;
    const row = await this.database.prepare(
      `SELECT delivery.*, monitor.version AS monitor_version,
        monitor.status AS monitor_status, monitor.deleted_at AS monitor_deleted_at,
        approval.status AS approval_status
       FROM music_channel_websub_deliveries AS delivery
       JOIN music_channel_upload_monitors AS monitor ON monitor.id = delivery.monitor_id
       LEFT JOIN music_channel_automation_approvals AS approval
         ON approval.channel_id = monitor.channel_id
        AND approval.scope = 'candidate_collection'
       WHERE delivery.id = ?`,
    ).bind(id).first<{
      id: string;
      subscription_id: string;
      monitor_id: string;
      monitor_generation: number;
      external_channel_id: string;
      external_video_id: string;
      provider_updated_at: number;
      status: "processing";
      attempt_count: number;
      monitor_version: number;
      monitor_status: "active" | "paused";
      monitor_deleted_at: number | null;
      approval_status: "approved" | "revoked" | null;
    }>();
    return row ? {
      id: row.id,
      subscriptionId: row.subscription_id,
      monitorId: row.monitor_id,
      monitorGeneration: Number(row.monitor_generation),
      externalChannelId: row.external_channel_id,
      externalVideoId: row.external_video_id,
      providerUpdatedAt: Number(row.provider_updated_at),
      status: row.status,
      attemptCount: Number(row.attempt_count),
      monitorVersion: Number(row.monitor_version),
      monitorStatus: row.monitor_status,
      monitorDeletedAt: row.monitor_deleted_at === null ? null : Number(row.monitor_deleted_at),
      approvalStatus: row.approval_status,
    } : null;
  }

  async recordDeliveryObservation(
    input: Parameters<WebsubRepository["recordDeliveryObservation"]>[0],
  ) {
    const video = input.observation.video;
    const blocked = input.observation.availabilityStatus !== "playable" ||
      video?.madeForKids === true;
    const classification = video?.madeForKids === true
      ? "policy_blocked"
      : input.observation.availabilityStatus === "playable"
        ? "scope_review"
        : "unavailable";
    const exclusionReason = video?.madeForKids === true
      ? "made_for_kids"
      : input.observation.availabilityStatus === "playable"
        ? null
        : input.observation.availabilityStatus;
    const results = await this.database.batch([
      this.database.prepare(
        `INSERT INTO music_ingestion_candidates (
          id, provider, external_video_id, candidate_kind, status, classification,
          exclusion_reason, title, channel_id, channel_title, thumbnail_url,
          duration_seconds, provider_published_at, availability_status,
          made_for_kids, metadata_checked_at, first_discovered_at,
          last_discovered_at, retention_expires_at, version, created_at, updated_at
        ) SELECT ?, 'youtube', ?, 'singing_clip', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?
          WHERE EXISTS (
            SELECT 1 FROM music_channel_upload_monitors AS monitor
            JOIN music_channels AS channel ON channel.id = monitor.channel_id
            JOIN music_channel_automation_approvals AS approval
              ON approval.channel_id = monitor.channel_id
            WHERE monitor.id = ? AND monitor.generation = ?
              AND monitor.status = 'active' AND monitor.deleted_at IS NULL
              AND channel.provider = 'youtube'
              AND channel.channel_role = 'approved_kirinuki'
              AND channel.verification_status = 'approved' AND channel.active = 1
              AND approval.scope = 'candidate_collection' AND approval.status = 'approved'
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
            WHEN excluded.status = 'blocked'
              AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
              THEN 'blocked'
            ELSE music_ingestion_candidates.status
          END,
          classification = CASE
            WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
              AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
              THEN excluded.classification
            WHEN excluded.status = 'blocked'
              AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
              THEN excluded.classification
            ELSE music_ingestion_candidates.classification
          END,
          exclusion_reason = CASE
            WHEN music_ingestion_candidates.candidate_kind <> 'singing_clip'
              AND music_ingestion_candidates.status NOT IN ('converted', 'ignored')
              THEN excluded.exclusion_reason
            WHEN excluded.status = 'blocked'
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
        `youtube:${input.observation.videoId}`,
        input.observation.videoId,
        blocked ? "blocked" : "needs_input",
        classification,
        exclusionReason,
        video?.title ?? null,
        video?.channelId ?? null,
        video?.channelTitle ?? null,
        video?.thumbnailUrl ?? null,
        video?.durationSeconds ?? null,
        video?.publishedAt ?? null,
        input.observation.availabilityStatus,
        video?.madeForKids ?? null,
        input.now,
        input.now,
        input.now,
        input.now + RETENTION_MS,
        input.now,
        input.now,
        input.delivery.monitorId,
        input.delivery.monitorGeneration,
      ),
      this.database.prepare(
        `INSERT INTO music_channel_upload_candidate_origins (
          monitor_id, candidate_id, provider_published_at, discovered_at,
          monitor_generation
        ) SELECT ?, id, provider_published_at, ?, ?
          FROM music_ingestion_candidates
          WHERE provider = 'youtube' AND external_video_id = ?
            AND EXISTS (
              SELECT 1 FROM music_channel_upload_monitors AS monitor
              JOIN music_channels AS channel ON channel.id = monitor.channel_id
              JOIN music_channel_automation_approvals AS approval
                ON approval.channel_id = monitor.channel_id
              WHERE monitor.id = ? AND monitor.generation = ?
                AND monitor.status = 'active' AND monitor.deleted_at IS NULL
                AND channel.provider = 'youtube'
                AND channel.channel_role = 'approved_kirinuki'
                AND channel.verification_status = 'approved' AND channel.active = 1
                AND approval.scope = 'candidate_collection'
                AND approval.status = 'approved'
            )
        ON CONFLICT(monitor_id, candidate_id) DO NOTHING`,
      ).bind(
        input.delivery.monitorId,
        input.now,
        input.delivery.monitorGeneration,
        input.observation.videoId,
        input.delivery.monitorId,
        input.delivery.monitorGeneration,
      ),
      this.database.prepare(
        `UPDATE music_channel_websub_deliveries
         SET status = 'completed', processed_at = ?, last_error_code = NULL, updated_at = ?
         WHERE id = ? AND status = 'processing'
           AND EXISTS (
             SELECT 1 FROM music_channel_upload_monitors AS monitor
             JOIN music_channels AS channel ON channel.id = monitor.channel_id
             JOIN music_channel_automation_approvals AS approval
               ON approval.channel_id = monitor.channel_id
             WHERE monitor.id = music_channel_websub_deliveries.monitor_id
                AND monitor.generation = music_channel_websub_deliveries.monitor_generation
                AND monitor.status = 'active' AND monitor.deleted_at IS NULL
                AND channel.provider = 'youtube'
                AND channel.channel_role = 'approved_kirinuki'
                AND channel.verification_status = 'approved' AND channel.active = 1
                AND approval.scope = 'candidate_collection' AND approval.status = 'approved'
           )`,
      ).bind(input.now, input.now, input.delivery.id),
    ]);
    const completion = results[2];
    if (Number(completion?.meta.changes ?? 0) !== 1) {
      throw new IngestionRepositoryError("stale_message", "WebSub delivery authority changed");
    }
  }

  async rejectDelivery(id: string, errorCode: string, now: number) {
    await this.database.prepare(
      `UPDATE music_channel_websub_deliveries
       SET status = 'rejected', processed_at = ?, last_error_code = ?, updated_at = ?
       WHERE id = ? AND status NOT IN ('completed', 'dead_letter')`,
    ).bind(now, errorCode, now, id).run();
  }

  async markDeliveryDeadLetter(id: string, errorCode: string, now: number) {
    await this.database.prepare(
      `UPDATE music_channel_websub_deliveries
       SET status = 'dead_letter', processed_at = ?, last_error_code = ?, updated_at = ?
       WHERE id = ? AND status <> 'completed'`,
    ).bind(now, errorCode, now, id).run();
  }

  async listRecoverableDeliveryIds(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT id FROM music_channel_websub_deliveries
       WHERE (status IN ('pending', 'failed') AND updated_at <= ?)
          OR (status = 'enqueued' AND updated_at <= ?)
          OR (status = 'processing' AND updated_at <= ?)
       ORDER BY updated_at ASC, id ASC LIMIT ?`,
    ).bind(
      now - DELIVERY_RECOVERY_MS,
      now - ENQUEUED_RECOVERY_MS,
      now - PROCESSING_RECOVERY_MS,
      limit,
    ).all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }

  async listStaleIntents(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT monitor_id, status
       FROM music_channel_websub_subscriptions
       WHERE status IN ('pending', 'renewing', 'unsubscribing')
         AND requested_at <= ?
       ORDER BY requested_at ASC, id ASC LIMIT ?`,
    ).bind(now - INTENT_RECOVERY_MS, limit).all<{
      monitor_id: string;
      status: "pending" | "renewing" | "unsubscribing";
    }>();
    return (result.results ?? []).map((row) => ({
      monitorId: row.monitor_id,
      status: row.status,
    }));
  }

  async listCleanupMonitorIds(limit: number) {
    const result = await this.database.prepare(
      `SELECT subscription.monitor_id AS id
       FROM music_channel_websub_subscriptions AS subscription
       JOIN music_channel_upload_monitors AS monitor ON monitor.id = subscription.monitor_id
       JOIN music_channels AS channel ON channel.id = monitor.channel_id
       LEFT JOIN music_channel_automation_approvals AS approval
         ON approval.channel_id = monitor.channel_id
        AND approval.scope = 'candidate_collection'
       WHERE subscription.status IN ('active', 'pending', 'renewing', 'failed', 'denied')
         AND subscription.monitor_generation = monitor.generation
         AND monitor.deleted_at IS NULL
         AND (
           monitor.status <> 'active'
           OR channel.provider <> 'youtube'
           OR channel.channel_role <> 'approved_kirinuki'
           OR channel.verification_status <> 'approved'
           OR channel.active <> 1
           OR approval.status IS NULL OR approval.status <> 'approved'
         )
       ORDER BY subscription.updated_at ASC, subscription.id ASC LIMIT ?`,
    ).bind(limit).all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }

  async listRenewalMonitorIds(now: number, limit: number) {
    const result = await this.database.prepare(
      `SELECT subscription.monitor_id AS id
       FROM music_channel_websub_subscriptions AS subscription
       JOIN music_channel_upload_monitors AS monitor ON monitor.id = subscription.monitor_id
       JOIN music_channels AS channel ON channel.id = monitor.channel_id
       JOIN music_channel_automation_approvals AS approval
         ON approval.channel_id = monitor.channel_id
       WHERE subscription.status = 'active'
         AND subscription.monitor_generation = monitor.generation
         AND subscription.lease_expires_at IS NOT NULL
         AND subscription.lease_expires_at <= ?
         AND monitor.status = 'active' AND monitor.deleted_at IS NULL
         AND channel.provider = 'youtube'
         AND channel.channel_role = 'approved_kirinuki'
         AND channel.verification_status = 'approved' AND channel.active = 1
         AND approval.scope = 'candidate_collection' AND approval.status = 'approved'
       ORDER BY subscription.lease_expires_at ASC, subscription.id ASC LIMIT ?`,
    ).bind(now + 48 * 60 * 60_000, limit).all<{ id: string }>();
    return (result.results ?? []).map((row) => row.id);
  }
}
