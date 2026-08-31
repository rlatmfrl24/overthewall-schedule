import { type Env } from "../../../platform/types";

const DAY_MS = 24 * 60 * 60_000;
const DAY_SECONDS = 24 * 60 * 60;
const RETENTION_LAST_PRUNE_SETTING_KEY = "data_retention_last_prune";
const SCHEDULED_PRUNE_INTERVAL_MS = DAY_MS;

type RetentionCategory =
  | "usage_events"
  | "collection_runs"
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
      "status IN ('succeeded', 'failed', 'skipped', 'throttled') AND finished_at IS NOT NULL",
  },
  {
    id: "scheduled-job-runs",
    category: "scheduled_operations",
    table: "scheduled_job_runs",
    label: "Scheduled job run summaries",
    timestampColumn: "finished_at",
    timestampKind: "epoch_ms",
    retentionDays: 180,
    extraWhere:
      "status IN ('succeeded', 'partial', 'failed', 'skipped', 'throttled') AND finished_at IS NOT NULL",
  },
  {
    id: "scheduled-usage-daily",
    category: "scheduled_operations",
    table: "scheduled_usage_daily",
    label: "Scheduled resource usage ledger",
    timestampColumn: "day",
    timestampKind: "sqlite_datetime",
    retentionDays: 180,
  },
  {
    id: "x-api-usage-events",
    category: "usage_events",
    table: "x_api_usage_events",
    label: "X API usage events",
    timestampColumn: "created_at",
    timestampKind: "epoch_ms",
    retentionDays: 90,
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
    retentionDays: 180,
  },
  {
    id: "youtube-warmup-runs",
    category: "collection_runs",
    table: "youtube_warmup_runs",
    label: "YouTube warmup runs",
    timestampColumn: "started_at",
    timestampKind: "epoch_ms",
    retentionDays: 180,
  },
  {
    id: "auto-update-runs",
    category: "collection_runs",
    table: "auto_update_runs",
    label: "Auto update runs",
    timestampColumn: "started_at",
    timestampKind: "epoch_ms",
    retentionDays: 180,
  },
  {
    id: "naver-cafe-source-checks",
    category: "logs",
    table: "naver_cafe_source_checks",
    label: "Naver Cafe source checks",
    timestampColumn: "checked_at",
    timestampKind: "epoch_ms",
    retentionDays: 180,
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

export const getDataRetentionStatus = async (
  env: Env,
  now = Date.now(),
): Promise<DataRetentionPruneResult> => {
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
  return {
    source: "manual",
    dryRun: true,
    startedAt: now,
    finishedAt: Date.now(),
    totalPrunableRows: policies.reduce(
      (total, policy) => total + policy.prunableRows,
      0,
    ),
    totalDeletedRows: 0,
    policies,
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
  usageEventsRetentionDays: 90,
  collectionRunsRetentionDays: 180,
  logsRetentionDays: 365,
  scheduledIntervalSeconds: DAY_SECONDS,
};
