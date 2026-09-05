import type {
  OperationRunDto,
  OperationRunFailureDto,
  OperationRunProgressDto,
  ScheduledJobSource,
  ScheduledJobStatus,
  ScheduledJobType,
} from "@contracts/scheduled-operations";
import {
  isScheduledJobType,
  scheduledJobTypes,
} from "@contracts/scheduled-operations";
import { toXCollectionOperationItem, type XCollectionItemEvidence } from "./x-collection-run-read-model";
import {
  SCHEDULED_D1_READ_DAILY_TARGET,
  SCHEDULED_D1_WRITE_DAILY_TARGET,
  SCHEDULED_JOB_LEASE_MS,
  SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS,
  SCHEDULED_QUEUE_DAILY_TARGET,
  type ScheduledLane,
} from "./job-policy";

export type ScheduledJobActor = {
  actorId?: string | null;
  actorName?: string | null;
  actorIp?: string | null;
};

export type ScheduledJobRunRecord = {
  id: string;
  job_type: ScheduledJobType;
  source: ScheduledJobSource;
  idempotency_key: string;
  scheduled_bucket: string | null;
  status: ScheduledJobStatus;
  scheduled_for: number | null;
  accepted_at: number;
  started_at: number | null;
  finished_at: number | null;
  last_error: string | null;
  summary_json: string | null;
};

export type ScheduledJobItemRecord = {
  id: string;
  run_id: string;
  target_key: string;
  phase: string;
  lane: ScheduledLane;
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "skipped" | "throttled";
  attempts: number;
  lease_token: string | null;
  lease_until: number | null;
  continuation_json: string | null;
  result_json: string | null;
  last_error_code: string | null;
  last_error: string | null;
  available_at: number;
  updated_at: number;
};

export type NewScheduledItem = {
  targetKey: string;
  phase: string;
  lane: ScheduledLane;
  continuation?: Record<string, unknown> | null;
};

const parseJsonRecord = (value: string | null) => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

const toProgress = (rows: Array<{ status: string; count: number | string }>) => {
  const progress: OperationRunProgressDto = {
    total: 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    throttled: 0,
  };
  for (const row of rows) {
    const count = Number(row.count) || 0;
    // Item-level partial is terminal. The public progress contract has no
    // separate partial counter, so count it as completed/succeeded while the
    // parent run retains the more precise `partial` status.
    if (row.status === "partial") {
      progress.succeeded += count;
    } else if (row.status in progress && row.status !== "total") {
      progress[row.status as keyof Omit<OperationRunProgressDto, "total">] =
        count;
    }
    progress.total += count;
  }
  return progress;
};

type PartialItemEvidenceRow = {
  id: string;
  target_key: string;
  phase: string;
  status: "partial";
  attempts: number;
  result_json: string | null;
  last_error_code: string | null;
  last_error: string | null;
  updated_at: number;
  retry_pending: number | string;
};

type FailedItemEvidenceRow = Omit<PartialItemEvidenceRow, "status"> & {
  status: "failed";
};

type YouTubeFeedProgress = {
  attempted: number;
  succeeded: number;
  failed: number;
  retryPending: boolean;
};

const toNonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;

const parseYouTubeFeedProgress = (
  item: PartialItemEvidenceRow,
): YouTubeFeedProgress | null => {
  const result = parseJsonRecord(item.result_json);
  if (!result) return null;
  const attempted = toNonNegativeInteger(result.attempted);
  const succeeded = toNonNegativeInteger(result.succeeded);
  const failed = toNonNegativeInteger(result.failed);
  if (
    attempted === null || succeeded === null || failed === null ||
    succeeded + failed > attempted
  ) {
    return null;
  }
  return {
    attempted,
    succeeded,
    failed,
    retryPending: Number(item.retry_pending) > 0 ||
      (toNonNegativeInteger(result.retryScheduled) ?? 0) > 0 ||
      result.retryAt !== null && result.retryAt !== undefined,
  };
};

const isResolvedYouTubePartial = (item: PartialItemEvidenceRow) => {
  const progress = parseYouTubeFeedProgress(item);
  return progress !== null &&
    progress.succeeded === progress.attempted &&
    progress.failed === 0 &&
    !progress.retryPending &&
    item.last_error_code === null &&
    item.last_error === null;
};

const applyYouTubePartialProgress = (
  progress: OperationRunProgressDto,
  items: PartialItemEvidenceRow[],
) => {
  const normalized = { ...progress };
  for (const item of items) {
    const nested = parseYouTubeFeedProgress(item);
    if (!nested || nested.attempted === 0) continue;
    normalized.total += nested.attempted - 1;
    normalized.succeeded += nested.succeeded - 1;
    normalized.failed += nested.failed;
  }
  return normalized;
};

const canNormalizeYouTubePartials = (
  run: Pick<ScheduledJobRunRecord, "job_type" | "last_error">,
  partialCount: number,
  items: PartialItemEvidenceRow[],
) => run.job_type === "youtube_feed_collection" &&
  run.last_error === null &&
  partialCount > 0 &&
  items.length === partialCount &&
  items.every(isResolvedYouTubePartial);

const toYouTubePartialFailure = (
  item: PartialItemEvidenceRow,
): OperationRunFailureDto => {
  const progress = parseYouTubeFeedProgress(item);
  const code = item.last_error_code ??
    (progress?.retryPending
      ? "youtube_feed_collection_retry_pending"
      : "youtube_feed_collection_partial");
  const message = item.last_error ?? (progress
    ? progress.failed > 0
      ? `YouTube feed collection failed for ${progress.failed} of ${progress.attempted} sources`
      : progress.succeeded < progress.attempted
        ? `YouTube feed collection completed ${progress.succeeded} of ${progress.attempted} sources`
        : "YouTube feed collection is waiting for retry completion"
    : "YouTube feed collection returned an unverified partial result");
  return {
    itemId: item.id,
    targetKey: item.target_key,
    phase: item.phase,
    code,
    message,
    attempts: item.attempts,
    lastAttemptAt: item.updated_at,
  };
};

const toRunDto = (
  run: ScheduledJobRunRecord,
  progress: OperationRunProgressDto,
  failures: OperationRunFailureDto[],
): OperationRunDto => ({
  runId: run.id,
  jobType: run.job_type,
  source: run.source,
  status: run.status,
  idempotencyKey: run.idempotency_key,
  scheduledFor: run.scheduled_for,
  acceptedAt: run.accepted_at,
  startedAt: run.started_at,
  finishedAt: run.finished_at,
  progress,
  failures,
  summary: parseJsonRecord(run.summary_json),
  lastError: run.last_error,
});

export class D1ScheduledJobRepository {
  private readonly db: D1Database;
  private readonly clock: () => number;
  private readonly createId: () => string;

  constructor(
    db: D1Database,
    clock: () => number = Date.now,
    createId: () => string = () => crypto.randomUUID(),
  ) {
    this.db = db;
    this.clock = clock;
    this.createId = createId;
  }

  async createRun(input: {
    jobType: ScheduledJobType;
    source: ScheduledJobSource;
    idempotencyKey: string;
    scheduledBucket?: string | null;
    scheduledFor?: number | null;
    actor?: ScheduledJobActor;
  }) {
    const now = this.clock();
    const id = this.createId();
    await this.db.prepare(
      `INSERT INTO scheduled_job_runs (
         id, job_type, source, idempotency_key, scheduled_bucket, status,
         actor_id, actor_name, actor_ip, scheduled_for, accepted_at,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(
      id,
      input.jobType,
      input.source,
      input.idempotencyKey,
      input.scheduledBucket ?? null,
      input.actor?.actorId ?? null,
      input.actor?.actorName ?? null,
      input.actor?.actorIp ?? null,
      input.scheduledFor ?? null,
      now,
      now,
      now,
    ).run();
    const run = await this.readRunByIdempotencyKey(input.idempotencyKey);
    if (!run) throw new Error("scheduled_run_create_failed");
    return run;
  }

  readRun(runId: string) {
    return this.db.prepare(
      `SELECT id, job_type, source, idempotency_key, scheduled_bucket, status,
              scheduled_for, accepted_at, started_at, finished_at, last_error,
              summary_json
       FROM scheduled_job_runs WHERE id = ?`,
    ).bind(runId).first<ScheduledJobRunRecord>();
  }

  readRunByIdempotencyKey(idempotencyKey: string) {
    return this.db.prepare(
      `SELECT id, job_type, source, idempotency_key, scheduled_bucket, status,
              scheduled_for, accepted_at, started_at, finished_at, last_error,
              summary_json
       FROM scheduled_job_runs WHERE idempotency_key = ?`,
    ).bind(idempotencyKey).first<ScheduledJobRunRecord>();
  }

  async addItems(runId: string, items: NewScheduledItem[]) {
    if (items.length === 0) return [];
    const now = this.clock();
    const records = items.map((item) => ({
      ...item,
      id: this.createId(),
    }));
    const statements: D1PreparedStatement[] = [];
    for (let index = 0; index < records.length; index += 10) {
      const chunk = records.slice(index, index + 10);
      const placeholders = chunk.map(() =>
        "(?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)"
      ).join(", ");
      const bindings = chunk.flatMap((item) => [
        item.id,
        runId,
        item.targetKey,
        item.phase,
        item.lane,
        item.continuation ? JSON.stringify(item.continuation) : null,
        now,
        now,
        now,
      ]);
      statements.push(
        this.db.prepare(
          `INSERT INTO scheduled_job_items (
             id, run_id, target_key, phase, lane, status, attempts,
             continuation_json, available_at, created_at, updated_at
           ) VALUES ${placeholders}
           ON CONFLICT(run_id, target_key, phase) DO NOTHING`,
        ).bind(...bindings),
      );
    }
    statements.push(
      this.db.prepare(
        `INSERT INTO scheduled_outbox (
           id, run_id, item_id, lane, event_type, status, attempts,
           available_at, created_at, updated_at
         ) SELECT lower(hex(randomblob(16))), i.run_id, i.id, i.lane,
                  'execute', 'pending', 0, ?, ?, ?
           FROM scheduled_job_items i
           LEFT JOIN scheduled_outbox o
             ON o.item_id = i.id AND o.event_type = 'execute'
           WHERE i.run_id = ? AND o.id IS NULL
         ON CONFLICT(item_id, event_type) DO NOTHING`,
      ).bind(now, now, now, runId),
    );
    statements.push(
      this.db.prepare(
        `UPDATE scheduled_job_runs
         SET total_items = (
           SELECT COUNT(*) FROM scheduled_job_items WHERE run_id = ?
         ), status = CASE
              WHEN status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled')
                THEN 'running'
              ELSE status
            END,
            finished_at = CASE
              WHEN status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled')
                THEN NULL
              ELSE finished_at
            END,
            updated_at = ?
         WHERE id = ?`,
      ).bind(runId, now, runId),
    );
    await this.db.batch(statements);
    return records.map((item) => item.id);
  }

  async skipRun(runId: string, reason = "no_targets") {
    const now = this.clock();
    await this.db.prepare(
      `UPDATE scheduled_job_runs
       SET status = 'skipped', finished_at = ?, updated_at = ?,
           summary_json = ?
       WHERE id = ? AND status = 'queued'`,
    ).bind(now, now, JSON.stringify({ reason }), runId).run();
  }

  async claimPendingOutbox(runId?: string, limit = 25) {
    const where = runId
      ? "o.run_id = ? AND"
      : "";
    const leaseToken = this.createId();
    const statement = this.db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'dispatching', attempts = attempts + 1,
           lease_token = ?, lease_until = ?, updated_at = ?
       WHERE id IN (
         SELECT o.id
         FROM scheduled_outbox o
         INNER JOIN scheduled_job_items i ON i.id = o.item_id
         INNER JOIN scheduled_job_runs r ON r.id = o.run_id
         WHERE ${where}
           (o.status IN ('pending', 'failed')
             OR (o.status = 'dispatching' AND o.lease_until < ?))
           AND o.available_at <= ?
           AND r.status IN ('queued', 'running')
           AND (
             (o.event_type = 'execute' AND i.status = 'queued')
             OR (
               o.event_type = 'reconcile'
               AND i.status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled')
             )
           )
         ORDER BY o.available_at, o.id
         LIMIT ?
       )
       RETURNING id, run_id, item_id, lane,
         (SELECT phase FROM scheduled_job_items WHERE id = item_id) AS phase,
         (SELECT job_type FROM scheduled_job_runs WHERE id = run_id) AS job_type`,
    );
    const now = this.clock();
    const result = runId
      ? await statement.bind(
          leaseToken,
          now + SCHEDULED_JOB_LEASE_MS,
          now,
          runId,
          now,
          now,
          limit,
        ).all<{
          id: string;
          run_id: string;
          item_id: string;
          lane: ScheduledLane;
          phase: string;
          job_type: ScheduledJobType;
        }>()
      : await statement.bind(
          leaseToken,
          now + SCHEDULED_JOB_LEASE_MS,
          now,
          now,
          now,
          limit,
        ).all<{
          id: string;
          run_id: string;
          item_id: string;
          lane: ScheduledLane;
          phase: string;
          job_type: ScheduledJobType;
        }>();
    return result.results;
  }

  async recoverStaleItems(limit = 10) {
    const now = this.clock();
    const queueDeliveryCutoff = now - SCHEDULED_QUEUE_DELIVERY_RECOVERY_MS;
    const redispatchExpiredDeliveries = this.db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'pending', available_at = ?, dispatched_at = NULL,
           last_error = 'queue_delivery_retention_elapsed',
           lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE id IN (
         SELECT o.id
         FROM scheduled_outbox o
         INNER JOIN scheduled_job_items i ON i.id = o.item_id
         WHERE o.event_type = 'execute'
           AND o.status = 'dispatched'
           AND o.dispatched_at IS NOT NULL
           AND o.dispatched_at <= ?
           AND i.status = 'queued'
           AND i.available_at <= ?
         ORDER BY o.dispatched_at, o.id
         LIMIT ?
       )`,
    ).bind(now, now, queueDeliveryCutoff, now, limit);
    const rebuildMissingDeliveries = this.db.prepare(
      `INSERT INTO scheduled_outbox (
         id, run_id, item_id, lane, event_type, status, attempts,
         available_at, last_error, created_at, updated_at
       ) SELECT lower(hex(randomblob(16))), i.run_id, i.id, i.lane, 'execute',
                'pending', 0, ?, 'queue_delivery_outbox_rebuilt', ?, ?
         FROM scheduled_job_items i
         LEFT JOIN scheduled_outbox o
           ON o.item_id = i.id AND o.event_type = 'execute'
         WHERE i.status = 'queued'
           AND i.available_at <= ?
           AND i.updated_at <= ?
           AND o.id IS NULL
         ORDER BY i.updated_at, i.id
         LIMIT ?
       ON CONFLICT(item_id, event_type) DO NOTHING`,
    ).bind(
      now,
      now,
      now,
      now,
      queueDeliveryCutoff,
      limit,
    );
    const update = this.db.prepare(
      `UPDATE scheduled_job_items
       SET status = 'queued', available_at = ?,
           last_error_code = 'stale_lease_recovered',
           last_error = 'Execution lease expired before completion',
           lease_token = NULL, lease_until = NULL, updated_at = ?
       WHERE id IN (
         SELECT id FROM scheduled_job_items
         WHERE status = 'running' AND lease_until < ?
         ORDER BY lease_until, id LIMIT ?
       )`,
    ).bind(now, now, now, limit);
    const rebuildOutbox = this.db.prepare(
      `INSERT INTO scheduled_outbox (
         id, run_id, item_id, lane, event_type, status, attempts,
         available_at, created_at, updated_at
       ) SELECT lower(hex(randomblob(16))), run_id, id, lane, 'execute',
                'pending', 0, ?, ?, ?
         FROM scheduled_job_items
         WHERE status = 'queued'
           AND last_error_code = 'stale_lease_recovered'
           AND updated_at = ?
       ON CONFLICT(item_id, event_type) DO UPDATE SET
         status = 'pending', attempts = 0,
         available_at = excluded.available_at, last_error = NULL,
         lease_token = NULL, lease_until = NULL,
         updated_at = excluded.updated_at`,
    ).bind(now, now, now, now);
    const [redispatched, rebuilt, recoveredLeases] = await this.db.batch([
      redispatchExpiredDeliveries,
      rebuildMissingDeliveries,
      update,
      rebuildOutbox,
    ]);
    return Number(redispatched.meta.changes ?? 0) +
      Number(rebuilt.meta.changes ?? 0) +
      Number(recoveredLeases.meta.changes ?? 0);
  }

  async markOutboxDispatched(outboxId: string) {
    const now = this.clock();
    await this.db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'dispatched', dispatched_at = ?, updated_at = ?,
           lease_token = NULL, lease_until = NULL
       WHERE id = ?`,
    ).bind(now, now, outboxId).run();
  }

  async markOutboxFailed(outboxId: string, error: string) {
    const now = this.clock();
    await this.db.prepare(
      `UPDATE scheduled_outbox
       SET status = 'failed', attempts = attempts + 1, last_error = ?,
           available_at = ?, updated_at = ?, lease_token = NULL,
           lease_until = NULL
       WHERE id = ?`,
    ).bind(error, now + 60_000, now, outboxId).run();
  }

  async reserveQueueOperations(lane: ScheduledLane, amount = 3) {
    void lane;
    const now = this.clock();
    const day = new Date(now).toISOString().slice(0, 10);
    const result = await this.db.prepare(
      `INSERT INTO scheduled_usage_daily (
         day, lane, resource, reserved, used, limit_value, updated_at
       ) VALUES (?, ?, 'queue_operations', 0, ?, ?, ?)
       ON CONFLICT(day, lane, resource) DO UPDATE SET
         used = scheduled_usage_daily.used + excluded.used,
         updated_at = excluded.updated_at
       WHERE scheduled_usage_daily.used + scheduled_usage_daily.reserved + excluded.used
         <= scheduled_usage_daily.limit_value
       RETURNING used`,
    ).bind(day, "all", amount, SCHEDULED_QUEUE_DAILY_TARGET, now)
      .first<{ used: number }>();
    return result !== null;
  }

  async reserveDispatchBudget(
    lane: ScheduledLane,
    estimate: { rowsRead: number; rowsWritten: number },
  ) {
    void lane;
    const now = this.clock();
    const day = new Date(now).toISOString().slice(0, 10);
    const result = await this.db.prepare(
      `WITH requested(resource, amount, limit_value) AS (
         VALUES
           ('queue_operations', 3, ?),
           ('d1_rows_read', ?, ?),
           ('d1_rows_written', ?, ?)
       )
       INSERT INTO scheduled_usage_daily (
         day, lane, resource, reserved, used, limit_value, updated_at
       )
       SELECT ?, 'all', requested.resource, 0, requested.amount,
              requested.limit_value, ?
       FROM requested
       WHERE NOT EXISTS (
         SELECT 1
         FROM requested AS checked
         LEFT JOIN scheduled_usage_daily AS current
           ON current.day = ? AND current.lane = 'all'
          AND current.resource = checked.resource
         WHERE COALESCE(current.used + current.reserved, 0) + checked.amount
           > checked.limit_value
       )
       ON CONFLICT(day, lane, resource) DO UPDATE SET
         used = scheduled_usage_daily.used + excluded.used,
         limit_value = excluded.limit_value,
         updated_at = excluded.updated_at
       RETURNING resource`,
    ).bind(
      SCHEDULED_QUEUE_DAILY_TARGET,
      Math.max(0, Math.trunc(estimate.rowsRead)),
      SCHEDULED_D1_READ_DAILY_TARGET,
      Math.max(0, Math.trunc(estimate.rowsWritten)),
      SCHEDULED_D1_WRITE_DAILY_TARGET,
      day,
      now,
      day,
    ).all<{ resource: string }>();
    return result.results.length === 3;
  }

  async getQueueUsagePercent() {
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    const row = await this.db.prepare(
      `SELECT COALESCE(SUM(used + reserved), 0) AS used
       FROM scheduled_usage_daily
       WHERE day = ? AND resource = 'queue_operations'`,
    ).bind(day).first<{ used: number | string }>();
    return Math.min(100, (Number(row?.used ?? 0) / SCHEDULED_QUEUE_DAILY_TARGET) * 100);
  }

  async getBackgroundUsagePercent() {
    const day = new Date(this.clock()).toISOString().slice(0, 10);
    const row = await this.db.prepare(
      `SELECT COALESCE(MAX(
         CASE WHEN limit_value > 0
           THEN ((used + reserved) * 100.0) / limit_value
           ELSE 0 END
       ), 0) AS usedPercent
       FROM scheduled_usage_daily
       WHERE day = ? AND resource IN (
         'queue_operations', 'd1_rows_read', 'd1_rows_written'
       )`,
    ).bind(day).first<{ usedPercent: number | string }>();
    return Math.min(100, Number(row?.usedPercent ?? 0));
  }

  async claimItem(itemId: string) {
    const now = this.clock();
    const leaseToken = this.createId();
    return this.db.prepare(
      `UPDATE scheduled_job_items
       SET status = 'running', attempts = attempts + 1,
           lease_token = ?, lease_until = ?, started_at = COALESCE(started_at, ?),
           updated_at = ?
       WHERE id = ?
         AND (status = 'queued' OR (status = 'running' AND lease_until < ?))
       RETURNING id, run_id, target_key, phase, lane, status, attempts,
                 lease_token, lease_until,
                 continuation_json, result_json, last_error_code, last_error,
                 available_at, updated_at`,
    ).bind(
      leaseToken,
      now + SCHEDULED_JOB_LEASE_MS,
      now,
      now,
      itemId,
      now,
    ).first<ScheduledJobItemRecord>();
  }

  async readItem(itemId: string) {
    return this.db.prepare(
      `SELECT id, run_id, target_key, phase, lane, status, attempts,
              lease_token, lease_until, continuation_json, result_json,
              last_error_code, last_error, available_at, updated_at
       FROM scheduled_job_items WHERE id = ?`,
    ).bind(itemId).first<ScheduledJobItemRecord>();
  }

  async completeItem(
    item: ScheduledJobItemRecord,
    outcome: {
      status: "succeeded" | "partial" | "failed" | "skipped" | "throttled";
      result?: unknown;
      errorCode?: string | null;
      error?: string | null;
    },
  ) {
    const now = this.clock();
    if (!item.lease_token) return false;
    const result = await this.db.prepare(
      `UPDATE scheduled_job_items
       SET status = ?, result_json = ?, last_error_code = ?, last_error = ?,
           finished_at = ?, updated_at = ?, lease_token = NULL,
           lease_until = NULL
       WHERE id = ? AND status = 'running' AND lease_token = ?`,
    ).bind(
      outcome.status,
      outcome.result === undefined ? null : JSON.stringify(outcome.result),
      outcome.errorCode ?? null,
      outcome.error ?? null,
      now,
      now,
      item.id,
      item.lease_token,
    ).run();
    if (Number(result.meta.changes ?? 0) === 0) return false;
    await this.refreshRun(item.run_id);
    return true;
  }

  async releaseItemForRetry(
    item: ScheduledJobItemRecord,
    errorCode: string,
    error: string,
  ) {
    const now = this.clock();
    if (!item.lease_token) return false;
    const result = await this.db.prepare(
      `UPDATE scheduled_job_items
       SET status = 'queued', available_at = ?, last_error_code = ?,
           last_error = ?, updated_at = ?, lease_token = NULL,
           lease_until = NULL
       WHERE id = ? AND status = 'running' AND lease_token = ?`,
    ).bind(
      now + 60_000,
      errorCode,
      error,
      now,
      item.id,
      item.lease_token,
    ).run();
    return Number(result.meta.changes ?? 0) > 0;
  }

  async markItemDeadLetter(itemId: string, error = "queue_retries_exhausted") {
    const now = this.clock();
    const item = await this.db.prepare(
      `SELECT id, run_id, target_key, phase, lane, status, attempts,
              continuation_json, result_json, last_error_code, last_error,
              available_at, updated_at
       FROM scheduled_job_items WHERE id = ?`,
    ).bind(itemId).first<ScheduledJobItemRecord>();
    if (!item) return;
    const result = await this.db.prepare(
      `UPDATE scheduled_job_items SET status = 'failed',
         last_error_code = 'queue_retries_exhausted', last_error = ?,
         finished_at = ?, updated_at = ?, lease_token = NULL,
         lease_until = NULL WHERE id = ? AND status IN ('queued', 'running')`,
    ).bind(error, now, now, itemId).run();
    if (Number(result.meta.changes ?? 0) === 0) return;
    await this.refreshRun(item.run_id);
  }

  async refreshRun(runId: string) {
    const now = this.clock();
    const rows = await this.db.prepare(
      `SELECT status, COUNT(*) AS count
       FROM scheduled_job_items WHERE run_id = ? GROUP BY status`,
    ).bind(runId).all<{ status: string; count: number }>();
    const progress = toProgress(rows.results);
    const hasPartial = rows.results.some((row) =>
      row.status === "partial" && Number(row.count) > 0
    );
    const partialCount = rows.results.find((row) => row.status === "partial")
      ?.count ?? 0;
    let effectiveProgress = progress;
    let hasEffectivePartial = hasPartial;
    if (hasPartial) {
      const [run, partialResult] = await Promise.all([
        this.readRun(runId),
        this.db.prepare(
          `SELECT i.id, i.target_key, i.phase, i.status, i.attempts,
                  i.result_json, i.last_error_code, i.last_error, i.updated_at,
                  EXISTS(
                    SELECT 1 FROM scheduled_outbox o
                    WHERE o.item_id = i.id
                      AND o.status IN ('pending', 'failed', 'dispatching')
                  ) AS retry_pending
           FROM scheduled_job_items i
           WHERE i.run_id = ? AND i.status = 'partial'`,
        ).bind(runId).all<PartialItemEvidenceRow>(),
      ]);
      if (run?.job_type === "youtube_feed_collection") {
        effectiveProgress = applyYouTubePartialProgress(
          progress,
          partialResult.results,
        );
        hasEffectivePartial = !canNormalizeYouTubePartials(
          run,
          Number(partialCount),
          partialResult.results,
        );
      }
    }
    const rawTerminal = progress.succeeded + progress.failed + progress.skipped +
      progress.throttled;
    const finished = progress.total > 0 && rawTerminal === progress.total;
    const status: ScheduledJobStatus = !finished
      ? "running"
      : hasEffectivePartial
        ? "partial"
      : effectiveProgress.failed > 0
        ? effectiveProgress.succeeded > 0 || effectiveProgress.skipped > 0
          ? "partial"
          : "failed"
        : effectiveProgress.throttled > 0
          ? "throttled"
          : effectiveProgress.succeeded > 0
            ? "succeeded"
            : "skipped";
    const completed = effectiveProgress.succeeded + effectiveProgress.failed +
      effectiveProgress.skipped + effectiveProgress.throttled;
    await this.db.prepare(
      `UPDATE scheduled_job_runs
       SET status = ?, started_at = COALESCE(started_at, ?),
           finished_at = ?, total_items = ?, completed_items = ?,
           failed_items = ?, skipped_items = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      status,
      now,
      finished ? now : null,
      effectiveProgress.total,
      completed,
      effectiveProgress.failed,
      effectiveProgress.skipped + effectiveProgress.throttled,
      now,
      runId,
    ).run();
  }

  async markRunThrottled(runId: string, reason: string) {
    const now = this.clock();
    await this.db.batch([
      this.db.prepare(
        `UPDATE scheduled_job_items SET status = 'throttled',
           last_error_code = 'admission_throttled', last_error = ?,
           finished_at = ?, updated_at = ?
         WHERE run_id = ? AND status = 'queued'`,
      ).bind(reason, now, now, runId),
      this.db.prepare(
        `UPDATE scheduled_outbox SET status = 'failed', last_error = ?,
           updated_at = ? WHERE run_id = ? AND status IN ('pending', 'failed')`,
      ).bind(reason, now, runId),
      this.db.prepare(
        `UPDATE scheduled_job_runs SET status = 'throttled', last_error = ?,
           finished_at = ?, updated_at = ? WHERE id = ?`,
      ).bind(reason, now, now, runId),
    ]);
  }

  async markRunFailed(
    runId: string,
    error: string,
    allowTerminalStatus = false,
  ) {
    const now = this.clock();
    await this.db.batch([
      this.db.prepare(
        `UPDATE scheduled_job_items SET status = 'failed',
           last_error_code = 'run_failed', last_error = ?,
           finished_at = ?, updated_at = ?
         WHERE run_id = ? AND status = 'queued'`,
      ).bind(error, now, now, runId),
      this.db.prepare(
        `UPDATE scheduled_outbox SET status = 'dispatched', last_error = ?,
           lease_token = NULL, lease_until = NULL, updated_at = ?
         WHERE run_id = ? AND status IN ('pending', 'failed', 'dispatching')`,
      ).bind(error, now, runId),
      this.db.prepare(
        `UPDATE scheduled_job_runs
         SET status = 'failed', last_error = ?, finished_at = ?, updated_at = ?
         WHERE id = ?
           AND (status IN ('queued', 'running') OR ? = 1)`,
      ).bind(error, now, now, runId, allowTerminalStatus ? 1 : 0),
    ]);
  }

  async readPhaseProgress(runId: string, phase: string) {
    const rows = await this.db.prepare(
      `SELECT status, COUNT(*) AS count
       FROM scheduled_job_items
       WHERE run_id = ? AND phase = ?
       GROUP BY status`,
    ).bind(runId, phase).all<{ status: string; count: number | string }>();
    return toProgress(rows.results);
  }

  async readSuccessfulPhaseResults(runId: string, phase: string) {
    const rows = await this.db.prepare(
      `SELECT result_json AS resultJson
       FROM scheduled_job_items
       WHERE run_id = ? AND phase = ? AND status = 'succeeded'
       ORDER BY id`,
    ).bind(runId, phase).all<{ resultJson: string | null }>();
    return rows.results.flatMap((row) => {
      if (!row.resultJson) return [];
      try {
        return [JSON.parse(row.resultJson) as unknown];
      } catch {
        return [];
      }
    });
  }

  async updateRunSummary(runId: string, summary: Record<string, unknown>) {
    await this.db.prepare(
      `UPDATE scheduled_job_runs SET summary_json = ?, updated_at = ? WHERE id = ?`,
    ).bind(JSON.stringify(summary), this.clock(), runId).run();
  }

  async readRunDto(runId: string) {
    const run = await this.readRun(runId);
    if (!run || !isScheduledJobType(run.job_type)) return null;
    const partialEvidence = run.job_type === "youtube_feed_collection"
      ? this.db.prepare(
        `SELECT i.id, i.target_key, i.phase, i.status, i.attempts,
                i.result_json, i.last_error_code, i.last_error, i.updated_at,
                EXISTS(
                  SELECT 1 FROM scheduled_outbox o
                  WHERE o.item_id = i.id
                    AND o.status IN ('pending', 'failed', 'dispatching')
                ) AS retry_pending
         FROM scheduled_job_items i
         WHERE i.run_id = ? AND i.status = 'partial'`,
      ).bind(runId).all<PartialItemEvidenceRow>()
      : Promise.resolve({ results: [] as PartialItemEvidenceRow[] });
    const xEvidence = run.job_type === "x_collection"
      ? this.db.prepare(
        `SELECT i.id, i.target_key, i.status, i.attempts, i.updated_at,
                i.last_error_code, i.last_error, i.result_json,
                EXISTS(SELECT 1 FROM scheduled_outbox o WHERE o.item_id = i.id AND i.attempts > 0
                  AND o.status IN ('pending', 'failed', 'dispatching')) AS retry_pending,
                (SELECT MIN(o.available_at) FROM scheduled_outbox o WHERE o.item_id = i.id AND i.attempts > 0
                  AND o.status IN ('pending', 'failed', 'dispatching')) AS next_retry_at
         FROM scheduled_job_items i WHERE i.run_id = ? AND i.phase = 'collect'
         ORDER BY i.target_key, i.id`,
      ).bind(runId).all<XCollectionItemEvidence>()
      : Promise.resolve({ results: [] as XCollectionItemEvidence[] });
    const [progressRows, failuresResult, partialResult, xResult] = await Promise.all([
      this.db.prepare(
        `SELECT status, COUNT(*) AS count
         FROM scheduled_job_items WHERE run_id = ? GROUP BY status`,
      ).bind(runId).all<{ status: string; count: number }>(),
      this.db.prepare(
        `SELECT i.id, i.target_key, i.phase, i.status, i.attempts,
                i.result_json, i.last_error_code, i.last_error, i.updated_at,
                EXISTS(
                  SELECT 1 FROM scheduled_outbox o
                  WHERE o.item_id = i.id
                    AND o.status IN ('pending', 'failed', 'dispatching')
                ) AS retry_pending
         FROM scheduled_job_items i
         WHERE i.run_id = ? AND i.status = 'failed'
         ORDER BY i.updated_at DESC
         LIMIT 20`,
      ).bind(runId).all<FailedItemEvidenceRow>(),
      partialEvidence,
      xEvidence,
    ]);
    // The YouTube planner creates one wrapper item per run. Read that wrapper
    // separately so the operator-visible failure list remains bounded.
    const partialItems = partialResult.results;
    const partialCount = Number(
      progressRows.results.find((row) => row.status === "partial")?.count ?? 0,
    );
    const normalizeYouTubePartial = canNormalizeYouTubePartials(
      run,
      partialCount,
      partialItems,
    );
    const progress = run.job_type === "youtube_feed_collection"
      ? applyYouTubePartialProgress(toProgress(progressRows.results), partialItems)
      : toProgress(progressRows.results);
    const failures: OperationRunFailureDto[] = [
      ...failuresResult.results.map((item) => ({
        itemId: item.id,
        targetKey: item.target_key,
        phase: item.phase,
        code: item.last_error_code,
        message: item.last_error ?? "Unknown scheduled job failure",
        attempts: item.attempts,
        lastAttemptAt: item.updated_at,
      })),
      ...partialItems
        .filter((item) => !isResolvedYouTubePartial(item))
        .map(toYouTubePartialFailure),
    ].slice(0, 20);
    const dto = toRunDto(
      normalizeYouTubePartial ? { ...run, status: "succeeded" } : run,
      progress,
      failures,
    );
    if (run.job_type === "x_collection") {
      dto.xCollection = { items: xResult.results.map(toXCollectionOperationItem) };
    }
    return dto;
  }

  async listRunDtos(input: {
    jobType?: ScheduledJobType;
    status?: ScheduledJobStatus;
    limit: number;
  }) {
    const conditions: string[] = [
      `r.job_type IN (${scheduledJobTypes.map(() => "?").join(", ")})`,
    ];
    const bindings: unknown[] = [...scheduledJobTypes];
    if (input.jobType) {
      conditions.push("r.job_type = ?");
      bindings.push(input.jobType);
    }
    if (input.status === "succeeded") {
      conditions.push(
        "(r.status = ? OR (r.job_type = 'youtube_feed_collection' AND r.status = 'partial'))",
      );
      bindings.push(input.status);
    } else if (input.status) {
      conditions.push("r.status = ?");
      bindings.push(input.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const readsNeedNormalization = input.status === "succeeded" ||
      input.status === "partial";
    const pageSize = readsNeedNormalization ? Math.max(input.limit, 50) : input.limit;
    const runs: OperationRunDto[] = [];
    let offset = 0;
    do {
      const rows = await this.db.prepare(
        `SELECT r.id FROM scheduled_job_runs r ${where}
         ORDER BY r.accepted_at DESC, r.id DESC LIMIT ? OFFSET ?`,
      ).bind(...bindings, pageSize, offset).all<{ id: string }>();
      const page = await Promise.all(
        rows.results.map((row) => this.readRunDto(row.id)),
      );
      runs.push(...page.filter(
        (run): run is OperationRunDto => run !== null &&
          (!input.status || run.status === input.status),
      ));
      offset += rows.results.length;
      if (!readsNeedNormalization || rows.results.length < pageSize) break;
    } while (runs.length < input.limit);
    return runs.slice(0, input.limit);
  }

  async listLatestRunDtosByJobType() {
    const rows = await this.db.prepare(
      `WITH ranked AS (
         SELECT r.id, r.job_type,
                ROW_NUMBER() OVER (
                  PARTITION BY r.job_type
                  ORDER BY r.accepted_at DESC, r.id DESC
                ) AS row_number
         FROM scheduled_job_runs r
         WHERE r.job_type IN (${scheduledJobTypes.map(() => "?").join(", ")})
       )
       SELECT id FROM ranked WHERE row_number = 1`,
    ).bind(...scheduledJobTypes).all<{ id: string }>();
    const runs = await Promise.all(
      rows.results.map((row) => this.readRunDto(row.id)),
    );
    return runs.filter((run): run is OperationRunDto => run !== null);
  }

  async readLatestSuccessfulRunTimes() {
    const rows = await this.db.prepare(
      `SELECT job_type AS jobType, MAX(finished_at) AS latestSuccessAt
       FROM scheduled_job_runs
       WHERE job_type IN (${scheduledJobTypes.map(() => "?").join(", ")})
         AND status = 'succeeded' AND finished_at IS NOT NULL
       GROUP BY job_type`,
    ).bind(...scheduledJobTypes).all<{
      jobType: ScheduledJobType;
      latestSuccessAt: number | string;
    }>();
    const latestByJobType = new Map<ScheduledJobType, number>();
    for (const row of rows.results) {
      if (!isScheduledJobType(row.jobType)) continue;
      latestByJobType.set(row.jobType, Number(row.latestSuccessAt));
    }

    // Older YouTube runs can retain a raw `partial` status even when their
    // nested source result proves that every target succeeded. Keep the
    // operator-facing latest-success timestamp aligned with readRunDto's
    // normalization without hydrating every historical run separately.
    const rawYouTubeSuccessAt = latestByJobType.get("youtube_feed_collection") ?? null;
    const partialRows = await this.db.prepare(
      `SELECT r.id AS run_id, r.finished_at, r.last_error,
              i.id, i.target_key, i.phase, i.status, i.attempts,
              i.result_json, i.last_error_code, i.last_error AS item_last_error,
              i.updated_at,
              EXISTS(
                SELECT 1 FROM scheduled_outbox o
                WHERE o.item_id = i.id
                  AND o.status IN ('pending', 'failed', 'dispatching')
              ) AS retry_pending
       FROM scheduled_job_runs r
       INNER JOIN scheduled_job_items i ON i.run_id = r.id
       WHERE r.job_type = 'youtube_feed_collection'
         AND r.status = 'partial'
         AND r.last_error IS NULL
         AND r.finished_at IS NOT NULL
         AND i.status = 'partial'
         AND (? IS NULL OR r.finished_at > ?)
       ORDER BY r.finished_at DESC, r.id DESC, i.id ASC`,
    ).bind(rawYouTubeSuccessAt, rawYouTubeSuccessAt).all<{
      run_id: string;
      finished_at: number | string;
      last_error: string | null;
      id: string;
      target_key: string;
      phase: string;
      status: string;
      attempts: number;
      result_json: string | null;
      last_error_code: string | null;
      item_last_error: string | null;
      updated_at: number;
      retry_pending: number;
    }>();
    const partialsByRun = new Map<string, {
      finishedAt: number;
      lastError: string | null;
      items: PartialItemEvidenceRow[];
    }>();
    for (const row of partialRows.results) {
      const current = partialsByRun.get(row.run_id) ?? {
        finishedAt: Number(row.finished_at),
        lastError: row.last_error,
        items: [],
      };
      current.items.push({
        id: row.id,
        target_key: row.target_key,
        phase: row.phase,
        status: "partial",
        attempts: row.attempts,
        result_json: row.result_json,
        last_error_code: row.last_error_code,
        last_error: row.item_last_error,
        updated_at: row.updated_at,
        retry_pending: row.retry_pending,
      });
      partialsByRun.set(row.run_id, current);
    }
    for (const candidate of partialsByRun.values()) {
      if (canNormalizeYouTubePartials(
        { job_type: "youtube_feed_collection", last_error: candidate.lastError },
        candidate.items.length,
        candidate.items,
      )) {
        latestByJobType.set(
          "youtube_feed_collection",
          Math.max(
            latestByJobType.get("youtube_feed_collection") ?? 0,
            candidate.finishedAt,
          ),
        );
      }
    }

    return [...latestByJobType].map(([jobType, latestSuccessAt]) => ({
      jobType,
      latestSuccessAt,
    }));
  }

  async retryRun(runId: string) {
    const current = await this.readRun(runId);
    if (!current) return { kind: "not_found" as const };
    if (
      !isScheduledJobType(current.job_type) ||
      !["failed", "partial", "throttled"].includes(current.status)
    ) {
      return {
        kind: "not_retryable" as const,
        status: current.status,
      };
    }
    const now = this.clock();
    await this.db.batch([
      this.db.prepare(
        `UPDATE scheduled_job_items
         SET status = 'queued', available_at = ?, last_error_code = NULL,
             last_error = NULL, finished_at = NULL, updated_at = ?
         WHERE run_id = ? AND status IN ('partial', 'failed', 'throttled')
           AND EXISTS (
             SELECT 1 FROM scheduled_job_runs r
             WHERE r.id = ? AND r.status IN ('failed', 'partial', 'throttled')
               AND (
                 COALESCE(r.last_error, '') NOT LIKE
                   'post_completion_reconciliation_%'
                 OR scheduled_job_items.last_error_code = 'run_failed'
               )
           )`,
      ).bind(now, now, runId, runId),
      this.db.prepare(
        `INSERT INTO scheduled_outbox (
           id, run_id, item_id, lane, event_type, status, attempts,
           available_at, created_at, updated_at
         ) SELECT lower(hex(randomblob(16))), i.run_id, i.id, i.lane,
                  CASE
                    WHEN COALESCE(r.last_error, '') LIKE
                      'post_completion_reconciliation_%'
                      AND i.status != 'queued'
                      THEN 'reconcile'
                    ELSE 'execute'
                  END,
                  'pending', 0, ?, ?, ?
           FROM scheduled_job_items i
           INNER JOIN scheduled_job_runs r ON r.id = i.run_id
           WHERE i.run_id = ?
             AND r.status IN ('failed', 'partial', 'throttled')
             AND (
               (
                 COALESCE(r.last_error, '') LIKE
                   'post_completion_reconciliation_%'
                 AND (
                   (
                     i.status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled')
                     AND COALESCE(i.last_error_code, '') != 'run_failed'
                   )
                   OR i.status = 'queued'
                 )
               )
               OR (
                 COALESCE(r.last_error, '') NOT LIKE
                   'post_completion_reconciliation_%'
                 AND i.status = 'queued'
               )
             )
         ON CONFLICT(item_id, event_type) DO UPDATE SET
           status = 'pending', available_at = excluded.available_at,
           last_error = NULL, updated_at = excluded.updated_at`,
      ).bind(now, now, now, runId),
      this.db.prepare(
        `UPDATE scheduled_job_runs SET status = 'queued', finished_at = NULL,
           last_error = NULL, updated_at = ? WHERE id = ?
           AND status IN ('failed', 'partial', 'throttled')`,
      ).bind(now, runId),
    ]);
    const run = await this.readRun(runId);
    if (!run) return { kind: "not_found" as const };
    return run.status === "queued"
      ? { kind: "accepted" as const, run }
      : { kind: "not_retryable" as const, status: run.status };
  }
}
