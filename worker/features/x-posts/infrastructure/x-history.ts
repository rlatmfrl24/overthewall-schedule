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
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
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
      timestamp,
    ).run();
    recorded += 1;
  }
  return { recorded, skipped: posts.length - recorded };
};

export const redactXPostHistory = async (db: D1, postIds: readonly string[], reason: "admin" | "compliance", timestamp = Date.now()) => {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) return { redacted: 0 };
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    await db.prepare(
      `UPDATE x_post_facts SET hidden_at = ?, hidden_reason = ?, updated_at = ?
       WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(timestamp, reason, timestamp, ...chunk).run();
  }
  return { redacted: ids.length };
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
            media_count, link_count, hidden_at, hidden_reason
     FROM x_post_facts ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, post_id DESC LIMIT ?`,
  ).bind(...bindings, options.limit + 1).all<FactRow>();
  const hasMore = rows.results.length > options.limit;
  const posts = rows.results.slice(0, options.limit).map(toHistoryPost);
  const last = posts.at(-1);
  return { posts, hasMore, nextCursor: hasMore && last ? `${last.createdAt}:${last.postId}` : null };
};

export const readXHistoryHealth = async (db: D1, timestamp = Date.now()) => {
  const [latest, budget, jobs] = await Promise.all([
    db.prepare("SELECT MAX(last_success_at) AS lastSuccessAt FROM x_post_sources").first<{ lastSuccessAt: number | string | null }>(),
    db.prepare("SELECT COALESCE(SUM(estimated_cost_micros), 0) AS used FROM x_api_usage_events WHERE created_at >= ?").bind(Date.UTC(new Date(timestamp).getUTCFullYear(), new Date(timestamp).getUTCMonth(), new Date(timestamp).getUTCDate())).first<{ used: number | string }>(),
    db.prepare("SELECT status, next_check_at AS nextCheckAt, error_code AS errorCode FROM x_compliance_jobs ORDER BY created_at DESC LIMIT 1").first<Record<string, unknown>>(),
  ]);
  return { lastCollectionSuccessAt: latest?.lastSuccessAt === null ? null : asNumber(latest?.lastSuccessAt), budgetUsedMicros: asNumber(budget?.used), latestCompliance: jobs ?? null };
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
  const cadence = await db.prepare(
    `SELECT
       (SELECT value FROM settings WHERE key = 'x_compliance_last_cycle_at') AS lastCycleAt,
       (SELECT MAX(created_at) FROM x_compliance_jobs) AS lastAttemptAt`,
  ).first<{ lastCycleAt: string | null; lastAttemptAt: number | string | null }>();
  const cadenceAnchor = Math.max(
    asNumber(cadence?.lastCycleAt),
    asNumber(cadence?.lastAttemptAt),
  );
  if (timestamp - cadenceAnchor < X_COMPLIANCE_CYCLE_MS) return null;
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
