import type { XPostItem } from "../../../platform/types";
import {
  getNextUtcDayStart,
  getXComplianceRetryAt,
  isTerminalXComplianceError,
  validateXComplianceStorageUrl,
  X_COMPLIANCE_BATCH_SIZE,
  X_COMPLIANCE_CYCLE_MS,
  X_COMPLIANCE_DAILY_BUDGET_MICROS,
  X_COMPLIANCE_POLL_DELAY_MS,
  X_COMPLIANCE_REQUEST_COST_MICROS,
} from "../domain/x-compliance-policy";

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const KST_OFFSET_MS = 9 * HOUR_MS;
const D1_MAX_BIND_PARAMETERS = 100;
const X_METRIC_ERROR_FIXED_BINDINGS = 3;
const X_METRIC_ERROR_CHUNK_SIZE =
  D1_MAX_BIND_PARAMETERS - X_METRIC_ERROR_FIXED_BINDINGS;

type D1 = Pick<D1Database, "prepare">;

type MemberRow = { uid: number | string; name: string; url_twitter: string | null };
type FactRow = {
  post_id: string;
  member_uid: number | string;
  member_name_snapshot: string;
  post_type: "post" | "reply" | "quote";
  created_at: number | string;
  first_seen_at: number | string;
  media_count: number | string;
  link_count: number | string;
  hidden_at: number | string | null;
  hidden_reason: string | null;
  initial_snapshot_completed_at: number | string | null;
  after_24h_snapshot_completed_at: number | string | null;
  next_metrics_at: number | string | null;
  last_metrics_error: string | null;
};

export type XHistoryPostDto = {
  postId: string;
  memberUid: number;
  memberName: string;
  postType: "post" | "reply" | "quote";
  createdAt: number;
  firstSeenAt: number;
  mediaCount: number;
  linkCount: number;
  status: "visible" | "redacted";
  hiddenAt: number | null;
  hiddenReason: string | null;
  snapshot: { initialAt: number | null; after24hAt: number | null };
};

const settingIsEnabled = async (db: D1, key: string) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key).first<{ value: string | null }>();
  return row?.value === "true";
};

const normalizeHandle = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

const handleFromUrl = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const value = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_]{1,15}$/.test(value) ? normalizeHandle(value) : null;
  } catch {
    return /^[A-Za-z0-9_]{1,15}$/.test(url) ? normalizeHandle(url) : null;
  }
};

const toPostType = (post: XPostItem): "post" | "reply" | "quote" =>
  post.reply ? "reply" : post.quote ? "quote" : "post";

const asNumber = (value: number | string | null | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const kstDate = (timestamp: number) =>
  new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);

const toHistoryPost = (row: FactRow): XHistoryPostDto => ({
  postId: row.post_id,
  memberUid: asNumber(row.member_uid),
  memberName: row.member_name_snapshot,
  postType: row.post_type,
  createdAt: asNumber(row.created_at),
  firstSeenAt: asNumber(row.first_seen_at),
  mediaCount: asNumber(row.media_count),
  linkCount: asNumber(row.link_count),
  status: row.hidden_at === null ? "visible" : "redacted",
  hiddenAt: row.hidden_at === null ? null : asNumber(row.hidden_at),
  hiddenReason: row.hidden_reason,
  snapshot: {
    initialAt: row.initial_snapshot_completed_at === null ? null : asNumber(row.initial_snapshot_completed_at),
    after24hAt: row.after_24h_snapshot_completed_at === null ? null : asNumber(row.after_24h_snapshot_completed_at),
  },
});

const findMemberByHandle = async (db: D1, handle: string) => {
  const rows = await db.prepare(
    "SELECT uid, name, url_twitter FROM members WHERE is_deprecated IS NULL OR is_deprecated = 0",
  ).all<MemberRow>();
  const normalized = normalizeHandle(handle);
  return rows.results.find((row) => handleFromUrl(row.url_twitter) === normalized) ?? null;
};

export const recordXPostFacts = async (
  db: D1,
  handle: string,
  posts: readonly XPostItem[],
  timestamp = Date.now(),
) => {
  if (posts.length === 0 || !(await settingIsEnabled(db, "x_history_analytics_enabled"))) {
    return { recorded: 0, skipped: posts.length };
  }
  const member = await findMemberByHandle(db, handle);
  if (!member) return { recorded: 0, skipped: posts.length };
  let recorded = 0;
  for (const post of posts) {
    const createdAt = Date.parse(post.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    await db.prepare(
      `INSERT INTO x_post_facts (
         post_id, member_uid, member_name_snapshot, post_type, created_at,
         first_seen_at, media_count, link_count, edit_root_post_id,
         superseded_by_post_id, hidden_at, hidden_reason,
         initial_snapshot_completed_at, after_24h_snapshot_completed_at,
         next_metrics_at, last_metrics_error, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, NULL, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         member_uid = excluded.member_uid,
         member_name_snapshot = excluded.member_name_snapshot,
         post_type = excluded.post_type,
         media_count = excluded.media_count,
         link_count = excluded.link_count,
         updated_at = excluded.updated_at`,
    ).bind(
      post.id,
      asNumber(member.uid),
      member.name,
      toPostType(post),
      createdAt,
      timestamp,
      post.media.length,
      post.links?.length ?? 0,
      post.id,
      createdAt + DAY_MS,
      timestamp,
    ).run();
    recorded += 1;
  }
  return { recorded, skipped: posts.length - recorded };
};

const rebuildDailyMetric = async (db: D1, memberUid: number, date: string, timestamp: number) => {
  await db.prepare(
    `INSERT INTO x_member_daily_metrics (
       kst_date, member_uid, post_count, reply_count, quote_count,
       media_post_count, link_post_count, initial_like_count,
       initial_reply_count, initial_repost_count, initial_quote_count,
       after_24h_like_count, after_24h_reply_count, after_24h_repost_count,
       after_24h_quote_count, snapshot_covered_count, deleted_count, recalculated_at
     )
     SELECT ?, ?,
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL),
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL AND f.post_type = 'reply'),
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL AND f.post_type = 'quote'),
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL AND f.media_count > 0),
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL AND f.link_count > 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND i.snapshot_kind = 'initial' THEN i.like_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND i.snapshot_kind = 'initial' THEN i.reply_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND i.snapshot_kind = 'initial' THEN i.repost_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND i.snapshot_kind = 'initial' THEN i.quote_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND a.snapshot_kind = 'after_24h' THEN a.like_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND a.snapshot_kind = 'after_24h' THEN a.reply_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND a.snapshot_kind = 'after_24h' THEN a.repost_count ELSE 0 END), 0),
       COALESCE(SUM(CASE WHEN f.hidden_at IS NULL AND a.snapshot_kind = 'after_24h' THEN a.quote_count ELSE 0 END), 0),
       COUNT(*) FILTER (WHERE f.hidden_at IS NULL AND i.snapshot_kind = 'initial'),
       COUNT(*) FILTER (WHERE f.hidden_at IS NOT NULL), ?
     FROM x_post_facts f
     LEFT JOIN x_post_metric_snapshots i ON i.post_id = f.post_id AND i.snapshot_kind = 'initial'
     LEFT JOIN x_post_metric_snapshots a ON a.post_id = f.post_id AND a.snapshot_kind = 'after_24h'
     WHERE f.member_uid = ? AND date((f.created_at + ?) / 1000, 'unixepoch') = ?
     ON CONFLICT(kst_date, member_uid) DO UPDATE SET
       post_count = excluded.post_count, reply_count = excluded.reply_count,
       quote_count = excluded.quote_count, media_post_count = excluded.media_post_count,
       link_post_count = excluded.link_post_count, initial_like_count = excluded.initial_like_count,
       initial_reply_count = excluded.initial_reply_count, initial_repost_count = excluded.initial_repost_count,
       initial_quote_count = excluded.initial_quote_count, after_24h_like_count = excluded.after_24h_like_count,
       after_24h_reply_count = excluded.after_24h_reply_count, after_24h_repost_count = excluded.after_24h_repost_count,
       after_24h_quote_count = excluded.after_24h_quote_count, snapshot_covered_count = excluded.snapshot_covered_count,
       deleted_count = excluded.deleted_count, recalculated_at = excluded.recalculated_at`,
  ).bind(date, memberUid, timestamp, memberUid, KST_OFFSET_MS, date).run();
};

const rebuildAffectedDailyMetrics = async (db: D1, postIds: readonly string[], timestamp: number) => {
  const uniquePostIds = [...new Set(postIds.filter(Boolean))];
  if (uniquePostIds.length === 0) return;
  const targets = new Map<string, { memberUid: number; date: string }>();
  for (
    let index = 0;
    index < uniquePostIds.length;
    index += D1_MAX_BIND_PARAMETERS
  ) {
    const chunk = uniquePostIds.slice(
      index,
      index + D1_MAX_BIND_PARAMETERS,
    );
    const rows = await db.prepare(
      `SELECT member_uid, created_at FROM x_post_facts
       WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(...chunk).all<{ member_uid: number | string; created_at: number | string }>();
    for (const row of rows.results) {
      const memberUid = asNumber(row.member_uid);
      const date = kstDate(asNumber(row.created_at));
      targets.set(`${memberUid}:${date}`, { memberUid, date });
    }
  }
  for (const target of targets.values()) await rebuildDailyMetric(db, target.memberUid, target.date, timestamp);
};

export const redactXPostHistory = async (db: D1, postIds: readonly string[], reason: "admin" | "compliance", timestamp = Date.now()) => {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) return { redacted: 0 };
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    await db.prepare(
      `UPDATE x_post_facts SET hidden_at = ?, hidden_reason = ?,
         next_metrics_at = NULL, last_metrics_error = NULL, updated_at = ?
       WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(timestamp, reason, timestamp, ...chunk).run();
    await db.prepare(
      `DELETE FROM x_post_metric_snapshots WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(...chunk).run();
  }
  await rebuildAffectedDailyMetrics(db, ids, timestamp);
  return { redacted: ids.length };
};

export const applyXMetricSnapshots = async (
  db: D1,
  snapshots: Array<{ postId: string; kind: "initial" | "after_24h"; capturedAt: number; metrics: { likeCount: number; replyCount: number; repostCount: number; quoteCount: number } }>,
) => {
  if (snapshots.length === 0) return { applied: 0 };
  const now = Date.now();
  for (const snapshot of snapshots) {
    await db.prepare(
      `INSERT INTO x_post_metric_snapshots (
         post_id, snapshot_kind, captured_at, like_count, reply_count, repost_count, quote_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id, snapshot_kind) DO UPDATE SET captured_at = excluded.captured_at,
         like_count = excluded.like_count, reply_count = excluded.reply_count,
         repost_count = excluded.repost_count, quote_count = excluded.quote_count`,
    ).bind(snapshot.postId, snapshot.kind, snapshot.capturedAt, snapshot.metrics.likeCount,
      snapshot.metrics.replyCount, snapshot.metrics.repostCount, snapshot.metrics.quoteCount).run();
    await db.prepare(
      `UPDATE x_post_facts SET
         initial_snapshot_completed_at = CASE WHEN ? = 'initial' THEN ? ELSE initial_snapshot_completed_at END,
         after_24h_snapshot_completed_at = CASE WHEN ? = 'after_24h' THEN ? ELSE after_24h_snapshot_completed_at END,
         next_metrics_at = CASE WHEN ? = 'initial' THEN created_at + ? ELSE NULL END,
         last_metrics_error = NULL, updated_at = ? WHERE post_id = ?`,
    ).bind(snapshot.kind, snapshot.capturedAt, snapshot.kind, snapshot.capturedAt,
      snapshot.kind, DAY_MS, now, snapshot.postId).run();
  }
  await rebuildAffectedDailyMetrics(db, snapshots.map((item) => item.postId), now);
  return { applied: snapshots.length };
};

export const readDueXMetricFacts = async (db: D1, limit = 100, timestamp = Date.now()) => {
  const rows = await db.prepare(
    `SELECT post_id, member_uid, member_name_snapshot, post_type, created_at, first_seen_at,
            media_count, link_count, hidden_at, hidden_reason, initial_snapshot_completed_at,
            after_24h_snapshot_completed_at, next_metrics_at, last_metrics_error
     FROM x_post_facts WHERE hidden_at IS NULL AND next_metrics_at IS NOT NULL
       AND next_metrics_at <= ? ORDER BY next_metrics_at ASC LIMIT ?`,
  ).bind(timestamp, Math.max(1, Math.min(limit, 100))).all<FactRow>();
  return rows.results.map(toHistoryPost);
};

export const deferXMetricFacts = async (
  db: D1,
  postIds: string[],
  errorCode: string,
  nextMetricsAt: number,
  timestamp = Date.now(),
) => {
  for (
    let index = 0;
    index < postIds.length;
    index += X_METRIC_ERROR_CHUNK_SIZE
  ) {
    const chunk = postIds.slice(index, index + X_METRIC_ERROR_CHUNK_SIZE);
    await db.prepare(
      `UPDATE x_post_facts SET last_metrics_error = ?, next_metrics_at = ?, updated_at = ?
       WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(
      errorCode.slice(0, 200),
      nextMetricsAt,
      timestamp,
      ...chunk,
    ).run();
  }
};

export const runXMetricRefresh = async (
  db: D1,
  readMetrics: (postIds: string[]) => Promise<Map<string, { likeCount: number; replyCount: number; repostCount: number; quoteCount: number }>>,
  timestamp = Date.now(),
) => {
  if (!(await settingIsEnabled(db, "x_metrics_snapshot_enabled"))) {
    return { status: "skipped" as const, reason: "feature_disabled", attempted: 0, succeeded: 0, failed: 0 };
  }
  const due = await readDueXMetricFacts(db, 100, timestamp);
  if (due.length === 0) return { status: "skipped" as const, reason: "no_due_metrics", attempted: 0, succeeded: 0, failed: 0 };
  try {
    const metrics = await readMetrics(due.map((item) => item.postId));
    const snapshots = due.flatMap((fact) => {
      const value = metrics.get(fact.postId);
      if (!value) return [];
      return [{ postId: fact.postId, kind: fact.snapshot.initialAt === null ? "initial" as const : "after_24h" as const, capturedAt: timestamp, metrics: value }];
    });
    await applyXMetricSnapshots(db, snapshots);
    const returnedPostIds = new Set(snapshots.map((snapshot) => snapshot.postId));
    const missingPostIds = due
      .map((fact) => fact.postId)
      .filter((postId) => !returnedPostIds.has(postId));
    await deferXMetricFacts(
      db,
      missingPostIds,
      "not_returned",
      timestamp + DAY_MS,
      timestamp,
    );
    return {
      status: snapshots.length === due.length ? "succeeded" as const : "partial" as const,
      attempted: due.length,
      succeeded: snapshots.length,
      failed: due.length - snapshots.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "x_metrics_refresh_failed";
    const postIds = due.map((item) => item.postId);
    await deferXMetricFacts(db, postIds, message, timestamp + HOUR_MS, timestamp);
    return { status: "failed" as const, attempted: due.length, succeeded: 0, failed: due.length, errorCode: message };
  }
};

export const readXHistoryPosts = async (db: D1, options: { memberUid?: number; from?: number; to?: number; cursor?: { createdAt: number; postId: string }; limit: number }) => {
  const where: string[] = [];
  const bindings: Array<number | string> = [];
  if (options.memberUid) { where.push("member_uid = ?"); bindings.push(options.memberUid); }
  if (options.from) { where.push("created_at >= ?"); bindings.push(options.from); }
  if (options.to) { where.push("created_at <= ?"); bindings.push(options.to); }
  if (options.cursor) { where.push("(created_at < ? OR (created_at = ? AND post_id < ?))"); bindings.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.postId); }
  const rows = await db.prepare(
    `SELECT post_id, member_uid, member_name_snapshot, post_type, created_at, first_seen_at,
            media_count, link_count, hidden_at, hidden_reason, initial_snapshot_completed_at,
            after_24h_snapshot_completed_at, next_metrics_at, last_metrics_error
     FROM x_post_facts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, post_id DESC LIMIT ?`,
  ).bind(...bindings, options.limit + 1).all<FactRow>();
  const hasMore = rows.results.length > options.limit;
  const posts = rows.results.slice(0, options.limit).map(toHistoryPost);
  const last = posts.at(-1);
  return { posts, hasMore, nextCursor: hasMore && last ? `${last.createdAt}:${last.postId}` : null };
};

export const readXHistorySummary = async (db: D1, from: string, to: string) => {
  const rows = await db.prepare(
    `SELECT kst_date AS kstDate, member_uid AS memberUid, post_count AS postCount,
            reply_count AS replyCount, quote_count AS quoteCount,
            media_post_count AS mediaPostCount, link_post_count AS linkPostCount,
            initial_like_count AS initialLikeCount, after_24h_like_count AS after24hLikeCount,
            snapshot_covered_count AS snapshotCoveredCount, deleted_count AS deletedCount
     FROM x_member_daily_metrics WHERE kst_date >= ? AND kst_date <= ?
     ORDER BY kst_date DESC, member_uid ASC`,
  ).bind(from, to).all<Record<string, unknown>>();
  return rows.results;
};

export const readXHistoryHealth = async (db: D1, timestamp = Date.now()) => {
  const [due, latest, budget, jobs] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM x_post_facts WHERE hidden_at IS NULL AND next_metrics_at <= ?").bind(timestamp).first<{ count: number | string }>(),
    db.prepare("SELECT MAX(last_success_at) AS lastSuccessAt FROM x_post_sources").first<{ lastSuccessAt: number | string | null }>(),
    db.prepare("SELECT COALESCE(SUM(estimated_cost_micros), 0) AS used FROM x_api_usage_events WHERE created_at >= ?").bind(Date.UTC(new Date(timestamp).getUTCFullYear(), new Date(timestamp).getUTCMonth(), new Date(timestamp).getUTCDate())).first<{ used: number | string }>(),
    db.prepare("SELECT status, next_check_at AS nextCheckAt, error_code AS errorCode FROM x_compliance_jobs ORDER BY created_at DESC LIMIT 1").first<Record<string, unknown>>(),
  ]);
  return { metricBacklog: asNumber(due?.count), lastCollectionSuccessAt: latest?.lastSuccessAt === null ? null : asNumber(latest?.lastSuccessAt), budgetUsedMicros: asNumber(budget?.used), latestCompliance: jobs ?? null };
};

type ComplianceJobRow = {
  id: string;
  provider_job_id: string | null;
  status: "created" | "uploading" | "uploaded" | "pending" | "complete" | "applied" | "failed";
  input_json: string | null;
  upload_url: string | null;
  download_url: string | null;
  uploaded_at: number | string | null;
  attempts: number | string;
  error_code: string | null;
};

const X_API_URL = "https://api.x.com/2";

class ComplianceStorageUrlError extends Error {
  readonly detail: string;
  providerJobId: string | null = null;

  constructor(code: string, detail: string) {
    super(code);
    this.detail = detail;
  }
}

const safeJson = <T>(value: string | null, fallback: T): T => {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const requireComplianceTransferUrl = (
  value: string | null,
  providerJobId: string,
  operation: "upload" | "download",
) => {
  const validation = validateXComplianceStorageUrl(value, {
    providerJobId,
    operation,
  });
  if (!validation.ok) {
    throw new ComplianceStorageUrlError(
      validation.code,
      validation.detail,
    );
  }
  return validation.url;
};

const updateComplianceJob = async (
  db: D1,
  id: string,
  fields: Record<string, string | number | null>,
) => {
  const columns = Object.keys(fields);
  await db.prepare(
    `UPDATE x_compliance_jobs SET ${columns.map((key) => `${key} = ?`).join(", ")}, updated_at = ? WHERE id = ?`,
  ).bind(...columns.map((key) => fields[key]), Date.now(), id).run();
};

const readComplianceJob = async (db: D1, timestamp: number) => db.prepare(
  `SELECT id, provider_job_id, status, input_json, upload_url, download_url,
          uploaded_at, attempts, error_code
   FROM x_compliance_jobs
   WHERE status IN ('created', 'uploading', 'uploaded', 'pending', 'complete', 'failed')
     AND next_check_at IS NOT NULL AND next_check_at <= ?
   ORDER BY created_at ASC LIMIT 1`,
).bind(timestamp).first<ComplianceJobRow>();

const createComplianceShard = async (db: D1, timestamp: number) => {
  const unresolved = await db.prepare(
    `SELECT id FROM x_compliance_jobs
     WHERE status IN ('created', 'uploading', 'uploaded', 'pending', 'complete')
        OR (status = 'failed' AND next_check_at IS NOT NULL)
     LIMIT 1`,
  ).first<{ id: string }>();
  if (unresolved) return null;
  const lastCycle = await db.prepare("SELECT value FROM settings WHERE key = 'x_compliance_last_cycle_at'")
    .first<{ value: string | null }>();
  if (timestamp - asNumber(lastCycle?.value) < X_COMPLIANCE_CYCLE_MS) return null;
  const ids = await db.prepare(
    `SELECT id FROM x_posts WHERE hidden_at IS NULL AND content_removed_at IS NULL
     ORDER BY first_seen_at ASC LIMIT ?`,
  ).bind(X_COMPLIANCE_BATCH_SIZE).all<{ id: string }>();
  if (ids.results.length === 0) return null;
  const id = crypto.randomUUID();
  const input = ids.results.map((row) => row.id);
  await db.prepare(
    `INSERT INTO x_compliance_jobs (
       id, provider_job_id, status, input_count, input_json, upload_url, download_url,
       created_at, next_check_at, attempts, error_code, error_detail, updated_at
     ) VALUES (?, NULL, 'created', ?, ?, NULL, NULL, ?, ?, 0, NULL, NULL, ?)`,
  ).bind(id, input.length, JSON.stringify(input), timestamp, timestamp, timestamp).run();
  return readComplianceJob(db, timestamp);
};

const reserveComplianceRequest = async (db: D1, timestamp: number) => {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const budgetSetting = await db.prepare("SELECT value FROM settings WHERE key = 'x_collection_daily_budget_cents'")
    .first<{ value: string | null }>();
  const totalLimit = Math.max(1, asNumber(budgetSetting?.value) || 100) * 10_000;
  const reserve = async (lane: string, resource: string, limit: number) => db.prepare(
    `INSERT INTO scheduled_usage_daily (day, lane, resource, reserved, used, limit_value, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(day, lane, resource) DO UPDATE SET
       reserved = scheduled_usage_daily.reserved + excluded.reserved,
       limit_value = excluded.limit_value, updated_at = excluded.updated_at
     WHERE scheduled_usage_daily.used + scheduled_usage_daily.reserved + excluded.reserved <= excluded.limit_value
     RETURNING reserved`,
  ).bind(day, lane, resource, X_COMPLIANCE_REQUEST_COST_MICROS, limit, timestamp)
    .first<{ reserved: number | string }>();
  const global = await reserve("all", "x_api_cost_micros", totalLimit);
  if (!global) throw new Error("x_compliance_total_budget_exhausted");
  const compliance = await reserve("x", "x_compliance_cost_micros", X_COMPLIANCE_DAILY_BUDGET_MICROS);
  if (!compliance) {
    await db.prepare(
      `UPDATE scheduled_usage_daily SET reserved = MAX(0, reserved - ?), updated_at = ?
       WHERE day = ? AND lane = 'all' AND resource = 'x_api_cost_micros'`,
    ).bind(X_COMPLIANCE_REQUEST_COST_MICROS, timestamp, day).run();
    throw new Error("x_compliance_budget_exhausted");
  }
  return async (endpoint: string, status: number) => {
    await db.prepare(
      `UPDATE scheduled_usage_daily SET reserved = MAX(0, reserved - ?), used = used + ?, updated_at = ?
       WHERE day = ? AND resource IN ('x_api_cost_micros', 'x_compliance_cost_micros')`,
    ).bind(X_COMPLIANCE_REQUEST_COST_MICROS, X_COMPLIANCE_REQUEST_COST_MICROS, Date.now(), day).run();
    await db.prepare(
      `INSERT INTO x_api_usage_events (operation, endpoint, resource_type, resource_count, estimated_cost_micros, status, created_at, detail)
       VALUES ('compliance', ?, 'request', 1, ?, ?, ?, ?)`,
    ).bind(endpoint, X_COMPLIANCE_REQUEST_COST_MICROS, status, Date.now(), JSON.stringify({ source: "x_compliance" })).run();
  };
};

const xFetch = async (db: D1, path: string, bearerToken: string, init: RequestInit = {}) => {
  const settle = await reserveComplianceRequest(db, Date.now());
  let status = 0;
  try {
    const response = await fetch(`${X_API_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json", ...init.headers },
    });
    status = response.status;
    if (!response.ok) throw new Error(`x_compliance_http_${response.status}`);
    return response;
  } finally {
    await settle(path, status);
  }
};

const extractProviderJob = (value: unknown) => {
  const data = value && typeof value === "object" && "data" in value
    ? (value as { data?: unknown }).data : value;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : null;
  const uploadUrl = typeof record.upload_url === "string" ? record.upload_url : null;
  return id ? { id, uploadUrl } : null;
};

const extractComplianceStatus = (value: unknown) => {
  const data = value && typeof value === "object" && "data" in value
    ? (value as { data?: unknown }).data : value;
  if (!data || typeof data !== "object") return { status: "pending", downloadUrl: null as string | null };
  const record = data as Record<string, unknown>;
  return {
    status: typeof record.status === "string" ? record.status.toLowerCase() : "pending",
    downloadUrl: typeof record.download_url === "string" ? record.download_url : null,
  };
};

export const parseComplianceResultIds = (value: string) => value.split(/\r?\n/).flatMap((line) => {
  if (!line.trim()) return [];
  try {
    const row = JSON.parse(line) as Record<string, unknown>;
    if (row.action !== "delete") return [];
    if (
      typeof row.reason === "string" &&
      !["deleted", "bounced", "protected", "suspended"].includes(row.reason)
    ) return [];
    const id = typeof row.id === "string" ? row.id
      : typeof row.tweet_id === "string" ? row.tweet_id : null;
    return id ? [id] : [];
  } catch { return []; }
});

export const runXCompliance = async (db: D1, bearerToken: string | undefined, timestamp = Date.now()) => {
  if (!(await settingIsEnabled(db, "x_compliance_enabled"))) {
    return { status: "skipped" as const, reason: "feature_disabled" };
  }
  if (!bearerToken?.trim()) return { status: "failed" as const, errorCode: "missing_bearer_token" };
  let job = await readComplianceJob(db, timestamp);
  if (!job) job = await createComplianceShard(db, timestamp);
  if (!job) return { status: "skipped" as const, reason: "not_due_or_blocked" };
  try {
    if (job.status === "failed") {
      const resumedStatus = job.download_url
        ? "complete"
        : job.provider_job_id && job.uploaded_at
          ? "pending"
          : job.provider_job_id && job.upload_url
            ? "uploading"
            : "created";
      await updateComplianceJob(db, job.id, {
        status: resumedStatus,
        error_code: null,
        error_detail: null,
        next_check_at: timestamp,
      });
      job = { ...job, status: resumedStatus, error_code: null };
    }
    if (job.status === "created") {
      const created = extractProviderJob(await (await xFetch(db, "/compliance/jobs", bearerToken, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "tweets", resumable: false }),
      })).json());
      if (!created) throw new Error("compliance_create_contract_invalid");
      let uploadUrl: string;
      try {
        uploadUrl = requireComplianceTransferUrl(
          created.uploadUrl,
          created.id,
          "upload",
        );
      } catch (error) {
        if (error instanceof ComplianceStorageUrlError) {
          error.providerJobId = created.id;
        }
        throw error;
      }
      const attempts = asNumber(job.attempts) + 1;
      await updateComplianceJob(db, job.id, { provider_job_id: created.id, upload_url: uploadUrl, status: "uploading", upload_started_at: timestamp, attempts, next_check_at: timestamp });
      // X currently expires the upload URL after 15 minutes. Upload in the
      // same execution instead of waiting for the next hourly scheduler pass.
      job = {
        ...job,
        provider_job_id: created.id,
        upload_url: uploadUrl,
        status: "uploading",
        attempts,
      };
    }
    if (job.status === "uploading") {
      if (!job.provider_job_id) throw new Error("compliance_provider_job_missing");
      const uploadUrl = requireComplianceTransferUrl(
        job.upload_url,
        job.provider_job_id,
        "upload",
      );
      const ids = safeJson<string[]>(job.input_json, []);
      const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: `${ids.join("\n")}\n` });
      if (!response.ok) throw new Error(`compliance_upload_http_${response.status}`);
      await updateComplianceJob(db, job.id, { status: "uploaded", uploaded_at: timestamp, next_check_at: timestamp + X_COMPLIANCE_POLL_DELAY_MS });
      return { status: "partial" as const, phase: "uploaded" };
    }
    if (job.status === "uploaded" || job.status === "pending") {
      if (!job.provider_job_id) throw new Error("compliance_provider_job_missing");
      const result = extractComplianceStatus(await (await xFetch(db, `/compliance/jobs/${encodeURIComponent(job.provider_job_id)}`, bearerToken)).json());
      if (result.status === "failed") {
        throw new Error("compliance_provider_job_failed");
      }
      if (result.status !== "complete" && result.status !== "completed") {
        await updateComplianceJob(db, job.id, { status: "pending", last_polled_at: timestamp, next_check_at: timestamp + X_COMPLIANCE_POLL_DELAY_MS });
        return { status: "partial" as const, phase: "pending" };
      }
      await updateComplianceJob(db, job.id, { status: "complete", download_url: requireComplianceTransferUrl(result.downloadUrl, job.provider_job_id, "download"), last_polled_at: timestamp, next_check_at: timestamp });
      return { status: "partial" as const, phase: "complete" };
    }
    if (job.status === "complete") {
      if (!job.provider_job_id) throw new Error("compliance_provider_job_missing");
      const downloadUrl = requireComplianceTransferUrl(
        job.download_url,
        job.provider_job_id,
        "download",
      );
      const response = await fetch(downloadUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`compliance_download_http_${response.status}`);
      const redactedIds = parseComplianceResultIds(await response.text());
      await redactXPostHistory(db, redactedIds, "compliance", timestamp);
      for (let index = 0; index < redactedIds.length; index += 50) {
        const ids = redactedIds.slice(index, index + 50);
        await db.prepare(`UPDATE x_posts SET value = '{}', hidden_at = ?, hidden_reason = 'compliance', content_removed_at = ? WHERE id IN (${ids.map(() => "?").join(", ")})`)
          .bind(timestamp, timestamp, ...ids).run();
      }
      await updateComplianceJob(db, job.id, { status: "applied", downloaded_at: timestamp, applied_at: timestamp, next_check_at: null, error_code: null, error_detail: null });
      await db.prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('x_compliance_last_cycle_at', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).bind(String(timestamp), String(timestamp)).run();
      return { status: "succeeded" as const, phase: "applied", redacted: redactedIds.length };
    }
    return { status: "skipped" as const, reason: "terminal_job" };
  } catch (error) {
    const code = error instanceof Error ? error.message : "x_compliance_failed";
    if (["x_compliance_total_budget_exhausted", "x_compliance_budget_exhausted"].includes(code)) {
      await updateComplianceJob(db, job.id, {
        error_code: code,
        error_detail: code,
        next_check_at: getNextUtcDayStart(timestamp),
      });
      return { status: "throttled" as const, errorCode: code };
    }
    const attempts = asNumber(job.attempts) + 1;
    const nextCheckAt = getXComplianceRetryAt(code, attempts, timestamp);
    const detail = error instanceof ComplianceStorageUrlError
      ? error.detail
      : nextCheckAt === null && !isTerminalXComplianceError(code)
        ? `retry_limit_reached:${code}`
        : code;
    const fields: Record<string, string | number | null> = {
      status: "failed",
      error_code: code.slice(0, 120),
      error_detail: detail.slice(0, 900),
      next_check_at: nextCheckAt,
      attempts,
    };
    if (error instanceof ComplianceStorageUrlError && error.providerJobId) {
      fields.provider_job_id = error.providerJobId;
    }
    await updateComplianceJob(db, job.id, fields);
    return { status: "failed" as const, errorCode: code };
  }
};
