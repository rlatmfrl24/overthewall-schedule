import type {
  OperationRunDto,
  OperationRunFailureDto,
  OperationRunProgressDto,
  ScheduledJobSource,
  ScheduledJobStatus,
  ScheduledJobType,
} from "@contracts/scheduled-operations";
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

  private readRunByIdempotencyKey(idempotencyKey: string) {
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
         WHERE ${where}
           (o.status IN ('pending', 'failed')
             OR (o.status = 'dispatching' AND o.lease_until < ?))
           AND o.available_at <= ?
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
    const terminal = progress.succeeded + progress.failed + progress.skipped +
      progress.throttled;
    const finished = progress.total > 0 && terminal === progress.total;
    const status: ScheduledJobStatus = !finished
      ? "running"
      : hasPartial
        ? "partial"
      : progress.failed > 0
        ? progress.succeeded > 0 || progress.skipped > 0
          ? "partial"
          : "failed"
        : progress.throttled > 0
          ? "throttled"
          : progress.succeeded > 0
            ? "succeeded"
            : "skipped";
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
      progress.total,
      terminal,
      progress.failed,
      progress.skipped + progress.throttled,
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
    if (!run) return null;
    const [progressRows, failuresResult] = await Promise.all([
      this.db.prepare(
        `SELECT status, COUNT(*) AS count
         FROM scheduled_job_items WHERE run_id = ? GROUP BY status`,
      ).bind(runId).all<{ status: string; count: number }>(),
      this.db.prepare(
        `SELECT id, target_key, phase, last_error_code, last_error, attempts,
                updated_at
         FROM scheduled_job_items
         WHERE run_id = ? AND status = 'failed'
         ORDER BY updated_at DESC LIMIT 20`,
      ).bind(runId).all<{
        id: string;
        target_key: string;
        phase: string;
        last_error_code: string | null;
        last_error: string | null;
        attempts: number;
        updated_at: number;
      }>(),
    ]);
    const failures: OperationRunFailureDto[] = failuresResult.results.map(
      (item) => ({
        itemId: item.id,
        targetKey: item.target_key,
        phase: item.phase,
        code: item.last_error_code,
        message: item.last_error ?? "Unknown scheduled job failure",
        attempts: item.attempts,
        lastAttemptAt: item.updated_at,
      }),
    );
    return toRunDto(run, toProgress(progressRows.results), failures);
  }

  async listRunDtos(input: {
    jobType?: ScheduledJobType;
    status?: ScheduledJobStatus;
    limit: number;
  }) {
    const conditions: string[] = [];
    const bindings: unknown[] = [];
    if (input.jobType) {
      conditions.push("job_type = ?");
      bindings.push(input.jobType);
    }
    if (input.status) {
      conditions.push("status = ?");
      bindings.push(input.status);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await this.db.prepare(
      `SELECT id FROM scheduled_job_runs ${where}
       ORDER BY accepted_at DESC LIMIT ?`,
    ).bind(...bindings, input.limit).all<{ id: string }>();
    const runs = await Promise.all(rows.results.map((row) => this.readRunDto(row.id)));
    return runs.filter((run): run is OperationRunDto => run !== null);
  }

  async retryRun(runId: string) {
    const current = await this.readRun(runId);
    if (!current) return { kind: "not_found" as const };
    if (!["failed", "partial", "throttled"].includes(current.status)) {
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
         WHERE run_id = ? AND status IN ('failed', 'throttled')
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
