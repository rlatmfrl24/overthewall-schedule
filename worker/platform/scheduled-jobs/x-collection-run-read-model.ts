import type { XCollectionOperationItemDto, ScheduledJobStatus } from "@contracts/scheduled-operations";
import type { XReferenceHydrationResultDto } from "@contracts/x-posts";

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

function parseHydration(value: unknown): XReferenceHydrationResultDto | null {
  const data = record(value);
  if (!data || !["complete", "deferred", "failed"].includes(String(data.status))) return null;
  const keys = ["scanned", "hydrated", "authorsResolved", "deferred", "failed", "terminal", "coalesced"] as const;
  if (!keys.every((key) => count(data[key]))) return null;
  return {
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
