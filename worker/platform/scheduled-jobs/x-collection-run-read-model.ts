import type { XCollectionOperationItemDto, ScheduledJobStatus } from "@contracts/scheduled-operations";
import type { XReferenceHydrationResultDto } from "@contracts/x-posts";
import type { XNewlyStoredPost } from "@contracts/x-collection";

export interface XCollectionItemEvidence {
  id: string;
  target_key: string;
  status: ScheduledJobStatus;
  attempts: number;
  updated_at: number;
  last_error_code: string | null;
  last_error: string | null;
  result_json: string | null;
  retry_pending: number;
  next_retry_at: number | null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const optionalText = (value: unknown) => typeof value === "string" ? value : null;

function parseNewlyStoredPosts(data: Record<string, unknown>): XNewlyStoredPost[] | undefined {
  const value = data.newlyStoredPosts;
  if (!Array.isArray(value) || value.length > (data.mode === "rss_candidates" ? 100 : 1000) ||
    !count(data.postsStored) || new Set(value.map(post => record(post)?.id)).size !== value.length) return undefined;
  const posts: XNewlyStoredPost[] = [];
  for (const entry of value) {
    const post = record(entry);
    if (!post || typeof post.id !== "string" || !/^\d{1,25}$/.test(post.id) || typeof post.createdAt !== "string" || !Number.isFinite(Date.parse(post.createdAt)) || !count(post.storedAt)) return undefined;
    posts.push({ id: post.id, createdAt: post.createdAt, storedAt: post.storedAt });
  }
  return posts;
}

function parseHydration(value: unknown): XReferenceHydrationResultDto | null {
  const data = record(value);
  if (!data || !["complete", "deferred", "failed"].includes(String(data.status))) return null;
  const keys = ["scanned", "hydrated", "authorsResolved", "deferred", "failed", "terminal", "coalesced"] as const;
  if (!keys.every((key) => count(data[key]))) return null;
  return {
    ...(data.scope === "quotes" ? { scope: "quotes" as const } : {}),
    status: data.status as XReferenceHydrationResultDto["status"],
    scanned: data.scanned as number,
    hydrated: data.hydrated as number,
    authorsResolved: data.authorsResolved as number,
    deferred: data.deferred as number,
    failed: data.failed as number,
    terminal: data.terminal as number,
    coalesced: data.coalesced as number,
    retryAt: count(data.retryAt) ? data.retryAt : null,
    errorCode: optionalText(data.errorCode),
  };
}

export function toXCollectionOperationItem(row: XCollectionItemEvidence): XCollectionOperationItemDto {
  let data: Record<string, unknown> | null = null;
  try { data = record(JSON.parse(row.result_json ?? "null")); } catch { /* Old or incomplete evidence stays unknown. */ }
  const validCollection = data && ["success", "failed", "skipped"].includes(String(data.status)) &&
    ["checkedHandles", "refreshedHandles", "postsReturned", "postsStored"].every((key) => count(data[key]));
  const rss = record(data?.rss) ?? (data?.mode === "rss_candidates" ? data : null);
  const pendingCandidates = rss?.pendingCandidates ?? rss?.pending;
  const validRss = rss && count(rss.rawCount) && count(rss.candidatesFound) && count(pendingCandidates) && typeof rss.windowReduced === "boolean" && (rss.nextAttemptAt === null || count(rss.nextAttemptAt));
  const newlyStoredPosts = data ? parseNewlyStoredPosts(data) : undefined;
  return {
    itemId: row.id,
    targetKey: row.target_key,
    status: row.status,
    attempts: row.attempts,
    updatedAt: row.updated_at,
    errorCode: row.last_error_code,
    error: row.last_error,
    retryPending: Number(row.retry_pending) > 0,
    nextRetryAt: row.next_retry_at,
    collection: validCollection && data ? {
      ...(data.provider === "fxembed" || data.provider === "x_api" ? { provider: data.provider } : {}),
      ...(data.mode === "timeline" || data.mode === "rss_candidates" ? { mode: data.mode } : {}),
      ...(count(data.paidApiCalls) ? { paidApiCalls: data.paidApiCalls } : {}),
      ...(newlyStoredPosts === undefined ? {} : { newlyStoredPosts }),
      ...(validRss && rss ? { rss: { rawCount: rss.rawCount as number, candidatesFound: rss.candidatesFound as number, pendingCandidates: pendingCandidates as number, nextAttemptAt: rss.nextAttemptAt as number | null, windowReduced: rss.windowReduced as boolean } } : {}),
      ...(["regular", "pending", "fallback"].includes(String(data.scope)) ? { scope: data.scope as "regular" | "pending" | "fallback" } : {}),
      ...(count(data.pendingSources) ? { pendingSources: data.pendingSources } : {}),
      status: data.status as "success" | "skipped" | "failed",
      checkedHandles: data.checkedHandles as number,
      refreshedHandles: data.refreshedHandles as number,
      postsReturned: data.postsReturned as number,
      postsStored: data.postsStored as number,
      error: optionalText(data.error),
    } : null,
    referenceHydration: parseHydration(data?.referenceHydration),
  };
}
