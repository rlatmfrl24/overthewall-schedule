import { type Env } from "../../../platform/types";

const DAY_MS = 24 * 60 * 60_000;
const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_LAST_PRUNE_SETTING_KEY = "data_retention_last_prune";
const D1_DATABASE_MAX_BYTES_SETTING_KEY = "d1_database_max_bytes";
const DEFAULT_D1_DATABASE_MAX_BYTES = 500 * 1024 * 1024;
const SCHEDULED_PRUNE_INTERVAL_MS = DAY_MS;

type RetentionCategory =
  | "usage_events"
  | "collection_runs"
  | "feed"
  | "logs"
  | "scheduled_operations";
type TimestampKind = "epoch_ms" | "sqlite_datetime";

type RetentionPolicy = {
  id: string;
  category: RetentionCategory;
  table: string;
  label: string;
  timestampColumn: string;
  timestampKind: TimestampKind;
  retentionDays: number;
  extraWhere?: string;
};

export type DataRetentionPolicyStatus = {
  id: string;
  category: RetentionCategory;
  table: string;
  label: string;
  timestampColumn: string;
  retentionDays: number;
  cutoff: number;
  prunableRows: number;
  deletedRows: number;
};

export type DataRetentionPruneResult = {
  source: "scheduled" | "manual";
  dryRun: boolean;
  startedAt: number;
  finishedAt: number;
  totalPrunableRows: number;
  totalDeletedRows: number;
  policies: DataRetentionPolicyStatus[];
};

export type DataRetentionRunSummary = {
  runId: string;
  source: "scheduled" | "manual";
  status: "queued" | "running" | "succeeded" | "partial" | "failed" | "skipped" | "throttled";
  startedAt: number | null;
  finishedAt: number | null;
  totalDeletedRows: number;
  verifiedAt: number | null;
  remainingPrunableRows: number | null;
  verification: "verified" | "remaining" | "unavailable";
  policies: Array<{
    id: string;
    deletedRows: number;
    hasMore: boolean;
    remainingPrunableRows: number | null;
  }>;
};

export type DataRetentionStatusResult = DataRetentionPruneResult & {
  recentRuns: DataRetentionRunSummary[];
  capacity: {
    sizeBytes: number | null;
    maxBytes: number;
    usedPercent: number | null;
    status: "unavailable" | "ok" | "notice" | "warning" | "critical";
    thresholds: readonly [60, 75, 85];
  };
};

export type ScheduledDataRetentionPruneResult =
  | {
      skipped: true;
      lastRun: number | null;
      nextEligibleAt: number | null;
    }
  | ({
      skipped: false;
    } & DataRetentionPruneResult);

export const DATA_RETENTION_POLICIES = [
  {
    id: "scheduled-outbox",
    category: "scheduled_operations",
    table: "scheduled_outbox",
    label: "Completed scheduled outbox",
    timestampColumn: "dispatched_at",
    timestampKind: "epoch_ms",
    retentionDays: 7,
    extraWhere: "status = 'dispatched' AND dispatched_at IS NOT NULL",
  },
  {
    id: "scheduled-job-items",
    category: "scheduled_operations",
    table: "scheduled_job_items",
    label: "Completed scheduled job items",
    timestampColumn: "finished_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
    extraWhere:
      "status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled') AND finished_at IS NOT NULL",
  },
  {
    id: "scheduled-job-runs",
    category: "scheduled_operations",
    table: "scheduled_job_runs",
    label: "Scheduled job run summaries",
    timestampColumn: "finished_at",
    timestampKind: "epoch_ms",
    retentionDays: 90,
    extraWhere:
      "status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled') AND finished_at IS NOT NULL",
  },
  {
    id: "youtube-feed-videos",
    category: "feed",
    table: "youtube_feed_videos",
    label: "YouTube new-upload feed",
    timestampColumn: "published_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
  },
  {
    id: "youtube-api-cache",
    category: "feed",
    table: "youtube_api_cache",
    label: "YouTube API-derived cache",
    timestampColumn: "fetched_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
  },
  {
    id: "x-api-usage-events",
    category: "usage_events",
    table: "x_api_usage_events",
    label: "X API usage events",
    timestampColumn: "created_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
  },
  {
    id: "youtube-api-usage-events",
    category: "usage_events",
    table: "youtube_api_usage_events",
    label: "YouTube API usage events",
    timestampColumn: "created_at",
    timestampKind: "epoch_ms",
    retentionDays: 90,
  },
  {
    id: "x-collection-runs",
    category: "collection_runs",
    table: "x_collection_runs",
    label: "X collection runs",
    timestampColumn: "started_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
  },
  {
    id: "youtube-warmup-runs",
    category: "collection_runs",
    table: "youtube_warmup_runs",
    label: "YouTube warmup runs",
    timestampColumn: "started_at",
    timestampKind: "epoch_ms",
    retentionDays: 90,
  },
  {
    id: "auto-update-runs",
    category: "collection_runs",
    table: "auto_update_runs",
    label: "Auto update runs",
    timestampColumn: "started_at",
    timestampKind: "epoch_ms",
    retentionDays: 90,
  },
  {
    id: "naver-cafe-source-checks",
    category: "logs",
    table: "naver_cafe_source_checks",
    label: "Naver Cafe source checks",
    timestampColumn: "checked_at",
    timestampKind: "epoch_ms",
    retentionDays: 30,
  },
  {
    id: "update-logs",
    category: "logs",
    table: "update_logs",
    label: "Schedule update logs",
    timestampColumn: "created_at",
    timestampKind: "sqlite_datetime",
    retentionDays: 365,
  },
  {
    id: "admin-audit-logs",
    category: "logs",
    table: "admin_audit_logs",
    label: "Admin audit logs",
    timestampColumn: "created_at",
    timestampKind: "epoch_ms",
    retentionDays: 365,
  },
] as const satisfies readonly RetentionPolicy[];

const readLastScheduledPrune = async (env: Env) => {
  const row = await env.otw_db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(RETENTION_LAST_PRUNE_SETTING_KEY)
    .first<{ value: string | null }>();
  const parsed = Number.parseInt(row?.value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const writeLastScheduledPrune = async (env: Env, value: number) => {
  const now = String(Date.now());
  await env.otw_db
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .bind(RETENTION_LAST_PRUNE_SETTING_KEY, String(value), now)
    .run();
};

const readD1Capacity = async (
  env: Env,
): Promise<DataRetentionStatusResult["capacity"]> => {
  const [configuredLimit, probe] = await Promise.all([
    env.otw_db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .bind(D1_DATABASE_MAX_BYTES_SETTING_KEY)
      .first<{ value: string | null }>(),
    env.otw_db.prepare("SELECT 1 AS capacity_probe").all<{ capacity_probe: number }>(),
  ]);
  const parsedLimit = Number(configuredLimit?.value);
  const maxBytes = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? parsedLimit
    : DEFAULT_D1_DATABASE_MAX_BYTES;
  const sizeBytes = Number(probe.meta?.size_after);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return {
      sizeBytes: null,
      maxBytes,
      usedPercent: null,
      status: "unavailable",
      thresholds: [60, 75, 85],
    };
  }
  const usedPercent = Math.round((sizeBytes / maxBytes) * 10_000) / 100;
  return {
    sizeBytes,
    maxBytes,
    usedPercent,
    status: usedPercent >= 85
      ? "critical"
      : usedPercent >= 75
        ? "warning"
        : usedPercent >= 60
          ? "notice"
          : "ok",
    thresholds: [60, 75, 85],
  };
};

const getPolicyCutoff = (policy: RetentionPolicy, now: number) =>
  now - policy.retentionDays * DAY_MS;

const getPolicyWhereClause = (policy: RetentionPolicy) => {
  const timestampClause = policy.timestampKind === "sqlite_datetime"
    ? `${policy.timestampColumn} IS NOT NULL AND unixepoch(${policy.timestampColumn}) < ?`
    : `${policy.timestampColumn} < ?`;
  return policy.extraWhere
    ? `(${policy.extraWhere}) AND (${timestampClause})`
    : timestampClause;
};

const getPolicyBindValue = (policy: RetentionPolicy, cutoff: number) => {
  if (policy.timestampKind === "sqlite_datetime") {
    return Math.floor(cutoff / 1000);
  }
  return cutoff;
};

const readPrunableCount = async (
  env: Env,
  policy: RetentionPolicy,
  cutoff: number,
) => {
  const row = await env.otw_db
    .prepare(
      `SELECT COUNT(*) AS count FROM ${policy.table} WHERE ${getPolicyWhereClause(
        policy,
      )}`,
    )
    .bind(getPolicyBindValue(policy, cutoff))
    .first<{ count: number | string | null }>();
  return Number(row?.count ?? 0) || 0;
};

const deletePrunableRows = async (
  env: Env,
  policy: RetentionPolicy,
  cutoff: number,
) => {
  const result = await env.otw_db
    .prepare(`DELETE FROM ${policy.table} WHERE ${getPolicyWhereClause(policy)}`)
    .bind(getPolicyBindValue(policy, cutoff))
    .run();
  return Number(result.meta?.changes ?? 0) || 0;
};

export const runDataRetentionPolicyPrune = async (
  env: Env,
  policyId: string,
  limit = 250,
) => {
  const policy = DATA_RETENTION_POLICIES.find((item) => item.id === policyId);
  if (!policy) throw new Error(`Unknown retention policy: ${policyId}`);
  const now = Date.now();
  const cutoff = getPolicyCutoff(policy, now);
  const result = await env.otw_db.prepare(
    `DELETE FROM ${policy.table}
     WHERE rowid IN (
       SELECT rowid FROM ${policy.table}
       WHERE ${getPolicyWhereClause(policy)}
       ORDER BY ${policy.timestampColumn}
       LIMIT ?
     )`,
  ).bind(getPolicyBindValue(policy, cutoff), limit).run();
  const deletedRows = Number(result.meta?.changes ?? 0) || 0;
  return {
    policyId,
    cutoff,
    deletedRows,
    hasMore: deletedRows >= limit,
  };
};

const readRetentionPolicies = async (
  env: Env,
  now = Date.now(),
): Promise<DataRetentionPolicyStatus[]> => {
  const policies: DataRetentionPolicyStatus[] = [];
  for (const policy of DATA_RETENTION_POLICIES) {
    const cutoff = getPolicyCutoff(policy, now);
    policies.push({
      id: policy.id,
      category: policy.category,
      table: policy.table,
      label: policy.label,
      timestampColumn: policy.timestampColumn,
      retentionDays: policy.retentionDays,
      cutoff,
      prunableRows: await readPrunableCount(env, policy, cutoff),
      deletedRows: 0,
    });
  }
  return policies;
};

type RetentionRunRow = {
  id: string;
  source: "scheduled" | "manual";
  status: DataRetentionRunSummary["status"];
  started_at: number | null;
  finished_at: number | null;
  summary_json: string | null;
};

const parseRecord = (value: string | null): Record<string, unknown> | null => {
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

const readLegacyRunPolicies = async (env: Env, runId: string) => {
  const result = await env.otw_db.prepare(
    `SELECT target_key, result_json FROM scheduled_job_items
     WHERE run_id = ? AND phase = 'prune' AND status = 'succeeded'`,
  ).bind(runId).all<{ target_key: string; result_json: string | null }>();
  const grouped = new Map<string, { deletedRows: number; hasMore: boolean }>();
  for (const row of result.results) {
    const parsed = parseRecord(row.result_json);
    const id = typeof parsed?.policyId === "string" ? parsed.policyId : row.target_key.split(":")[0];
    const previous = grouped.get(id) ?? { deletedRows: 0, hasMore: false };
    grouped.set(id, {
      deletedRows: previous.deletedRows + (typeof parsed?.deletedRows === "number" ? parsed.deletedRows : 0),
      hasMore: previous.hasMore || parsed?.hasMore === true,
    });
  }
  return [...grouped.entries()].map(([id, value]) => ({
    id,
    ...value,
    remainingPrunableRows: null,
  }));
};

const readRecentRetentionRuns = async (env: Env): Promise<DataRetentionRunSummary[]> => {
  const result = await env.otw_db.prepare(
    `SELECT id, source, status, started_at, finished_at, summary_json
     FROM scheduled_job_runs WHERE job_type = 'retention_prune'
     ORDER BY accepted_at DESC LIMIT 5`,
  ).all<RetentionRunRow>();
  return Promise.all(result.results.map(async (run) => {
    const persisted = parseRecord(run.summary_json)?.retentionPrune;
    if (typeof persisted === "object" && persisted !== null) {
      const summary = persisted as Omit<DataRetentionRunSummary, "runId" | "source" | "status" | "startedAt" | "finishedAt">;
      return { ...summary, runId: run.id, source: run.source, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at };
    }
    const policies = await readLegacyRunPolicies(env, run.id);
    return {
      runId: run.id,
      source: run.source,
      status: run.status,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      totalDeletedRows: policies.reduce((total, policy) => total + policy.deletedRows, 0),
      verifiedAt: null,
      remainingPrunableRows: null,
      verification: "unavailable" as const,
      policies,
    };
  }));
};

export const getDataRetentionStatus = async (
  env: Env,
  now = Date.now(),
): Promise<DataRetentionStatusResult> => {
  const policies = await readRetentionPolicies(env, now);
  return {
    source: "manual",
    dryRun: true,
    startedAt: now,
    finishedAt: Date.now(),
    totalPrunableRows: policies.reduce((total, policy) => total + policy.prunableRows, 0),
    totalDeletedRows: 0,
    policies,
    recentRuns: await readRecentRetentionRuns(env),
    capacity: await readD1Capacity(env),
  };
};

export const summarizeDataRetentionRun = async (
  env: Env,
  runId: string,
): Promise<Omit<DataRetentionRunSummary, "runId" | "source" | "status" | "startedAt" | "finishedAt">> => {
  const policies = await readLegacyRunPolicies(env, runId);
  const currentPolicies = await readRetentionPolicies(env);
  const currentById = new Map(currentPolicies.map((policy) => [policy.id, policy.prunableRows]));
  const verifiedAt = Date.now();
  const verifiedPolicies = policies.map((policy) => ({
    ...policy,
    remainingPrunableRows: currentById.get(policy.id) ?? 0,
  }));
  const remainingPrunableRows = verifiedPolicies.reduce(
    (total, policy) => total + (policy.remainingPrunableRows ?? 0),
    0,
  );
  return {
    totalDeletedRows: verifiedPolicies.reduce((total, policy) => total + policy.deletedRows, 0),
    verifiedAt,
    remainingPrunableRows,
    verification: remainingPrunableRows === 0 ? "verified" : "remaining",
    policies: verifiedPolicies,
  };
};

export const runDataRetentionPrune = async (
  env: Env,
  options: { source: "scheduled" | "manual"; dryRun?: boolean },
): Promise<DataRetentionPruneResult> => {
  const startedAt = Date.now();
  const policies: DataRetentionPolicyStatus[] = [];

  for (const policy of DATA_RETENTION_POLICIES) {
    const cutoff = getPolicyCutoff(policy, startedAt);
    const prunableRows = await readPrunableCount(env, policy, cutoff);
    const deletedRows = options.dryRun
      ? 0
      : await deletePrunableRows(env, policy, cutoff);
    policies.push({
      id: policy.id,
      category: policy.category,
      table: policy.table,
      label: policy.label,
      timestampColumn: policy.timestampColumn,
      retentionDays: policy.retentionDays,
      cutoff,
      prunableRows,
      deletedRows,
    });
  }

  const finishedAt = Date.now();
  if (options.source === "scheduled" && !options.dryRun) {
    await writeLastScheduledPrune(env, finishedAt);
  }

  return {
    source: options.source,
    dryRun: Boolean(options.dryRun),
    startedAt,
    finishedAt,
    totalPrunableRows: policies.reduce(
      (total, policy) => total + policy.prunableRows,
      0,
    ),
    totalDeletedRows: policies.reduce(
      (total, policy) => total + policy.deletedRows,
      0,
    ),
    policies,
  };
};

export const runScheduledDataRetentionPrune = async (
  env: Env,
): Promise<ScheduledDataRetentionPruneResult> => {
  const now = Date.now();
  const lastRun = await readLastScheduledPrune(env);
  if (lastRun && now - lastRun < SCHEDULED_PRUNE_INTERVAL_MS) {
    return {
      skipped: true,
      lastRun,
      nextEligibleAt: lastRun + SCHEDULED_PRUNE_INTERVAL_MS,
    };
  }

  return {
    skipped: false,
    ...(await runDataRetentionPrune(env, {
      source: "scheduled",
    })),
  };
};

export const DATA_RETENTION_POLICY_SUMMARY = {
  usageEventsRetentionDays: { x: 30, youtube: 90 },
  collectionRunsRetentionDays: { x: 30, other: 90 },
  feedPostRetention: { x: "permanent", naverCafe: "permanent" },
  dailyUsageRetention: "permanent",
  logsRetentionDays: 365,
  scheduledIntervalSeconds: DAY_SECONDS,
};
