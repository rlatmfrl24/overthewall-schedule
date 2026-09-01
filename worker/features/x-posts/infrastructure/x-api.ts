import { pMap } from "../../../platform/http-helpers";
import type {
  XLinkedPostPreviewItem,
  XPostItem,
  XPostLinkItem,
  XPostMediaItem,
} from "../../../platform/types";
import {
  clearLinkPreviewCacheForTests,
  enrichLinksWithPreviews,
} from "./link-preview";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";

type XApiUser = {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
  protected?: boolean;
};

type XUsersByUsernamesResponse = {
  data?: XApiUser[];
  errors?: Array<{ detail?: string; title?: string; value?: string }>;
};

type XTimelinePost = {
  id: string;
  text?: string;
  created_at?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{
    type?: "quoted" | "replied_to" | "retweeted";
    id?: string;
  }>;
  public_metrics?: {
    like_count?: number;
    reply_count?: number;
    retweet_count?: number;
    quote_count?: number;
  };
  attachments?: {
    media_keys?: string[];
  };
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
      display_url?: string;
      unwound_url?: string;
      title?: string;
      description?: string;
      images?: Array<{
        url?: string;
        width?: number;
        height?: number;
      }>;
    }>;
  };
};

type XTimelineMedia = {
  media_key: string;
  type?: string;
  url?: string;
  preview_image_url?: string;
  width?: number;
  height?: number;
  alt_text?: string;
};

type XUserTimelineResponse = {
  data?: XTimelinePost[];
  includes?: {
    media?: XTimelineMedia[];
  };
};

type XTweetLookupPost = XTimelinePost & {
  author_id?: string;
};

type XTweetLookupResponse = {
  data?: XTweetLookupPost[];
  includes?: {
    users?: XApiUser[];
    media?: XTimelineMedia[];
  };
};

type XCacheDb = Pick<D1Database, "prepare">;

type XCacheRow = {
  value: string;
  fetched_at: number | string;
  expires_at: number | string;
};

type D1CacheEntry<T> = {
  value: T;
  fetchedAt: number;
  expiresAt: number;
  staleUsable: boolean;
};

type CachedXUser = {
  fetchedAt: number;
  expiresAt: number;
  user: XApiUser | null;
};

type CachedXPostsEntry = {
  fetchedAt: number;
  expiresAt: number;
  userId: string | null;
  posts: XPostItem[];
};

type StoredXPostsEntry = CachedXPostsEntry & {
  lastCheckedAt: number | null;
  lastSeenPostId: string | null;
  lastError: string | null;
};

type StoredXPostsWriteResult = {
  ok: boolean;
  count: number;
  error: string | null;
};

type CachedXPostsWriteEntry = CachedXPostsEntry & {
  postsStored: number;
  storageError: string | null;
};

type XStoredPostRow = {
  id: string;
  handle: string;
  user_id: string | null;
  username: string;
  value: string;
  created_at: string;
  fetched_at: number | string;
  hidden_at: number | string | null;
};

type XPostSourceRow = {
  handle: string;
  user_id: string | null;
  username: string | null;
  last_seen_post_id: string | null;
  last_checked_at: number | string;
  updated_at: number | string;
  last_error: string | null;
};

type XUserCacheValue = {
  user: XApiUser | null;
};

type XPostsCacheValue = {
  userId: string | null;
  posts: XPostItem[];
};

type XLinkedPostCacheValue = {
  post: XLinkedPostPreviewItem | null;
};

type XHandlePostsResult = {
  handle: string;
  userId: string | null;
  posts: XPostItem[];
  error: string | null;
  errorStatus?: number | null;
  errorDetail?: string | null;
  stale: boolean;
  postsStored?: number;
  storageError?: string | null;
};

type FetchXPostsForHandlesOptions = {
  bearerToken?: string | null;
  maxResults?: number;
  cacheDb?: XCacheDb;
  richXLinkPreviewEnabled?: boolean;
  forceRefresh?: boolean;
  refresh?: boolean;
  usageTracker?: XApiUsageTracker;
  usageSource?: string;
  forceRefreshPath?: string | null;
};

type XApiUsageOperation = "user_lookup" | "timeline" | "tweet_lookup";

type XApiUsageTracker = {
  apiCalls: number;
  estimatedCostMicros: number;
  reservedCostMicros: number;
  source?: string | null;
  forceRefreshPath?: string | null;
};

type CollectXPostsOptions = {
  bearerToken?: string | null;
  maxResults?: number;
  cacheDb?: XCacheDb;
  richXLinkPreviewEnabled?: boolean;
  source?: string;
};

type XApiResponseWithResources = {
  data?: unknown[];
  includes?: {
    users?: unknown[];
    media?: unknown[];
  };
};

export class XApiError extends Error {
  status: number;
  code: string | null;
  sourceStatus: number | null;
  detail: string | null;
  diagnostics: Array<{
    handle?: string;
    error: string | null;
    status: number | null;
    detail: string | null;
  }>;

  constructor(
    message: string,
    status: number,
    options: {
      code?: string | null;
      sourceStatus?: number | null;
      detail?: string | null;
      diagnostics?: Array<{
        handle?: string;
        error: string | null;
        status: number | null;
        detail: string | null;
      }>;
    } = {},
  ) {
    super(message);
    this.name = "XApiError";
    this.status = status;
    this.code = options.code ?? null;
    this.sourceStatus = options.sourceStatus ?? null;
    this.detail = options.detail ?? null;
    this.diagnostics = options.diagnostics ?? [];
  }
}

const X_API_BASE_URL = "https://api.x.com/2";
const X_API_BACKOFF_UNTIL_SETTING_KEY = "x_api_backoff_until";
const X_USER_LOOKUP_CACHE_POLICY = WORKER_CACHE_POLICY.x.userLookup;
const X_POSTS_CACHE_POLICY = WORKER_CACHE_POLICY.x.posts;
const X_LINKED_POST_LOOKUP_CACHE_POLICY =
  WORKER_CACHE_POLICY.x.linkedPostLookup;
const X_LINKED_POST_NEGATIVE_CACHE_TTL_MS = 15 * 60_000;
const X_POSTS_BATCH_CONCURRENCY = 4;
const X_ERROR_DETAIL_MAX_LENGTH = 900;
const X_LINKED_POST_PREVIEW_MAX_IDS = 10;
const X_STORED_POSTS_RETAIN_LIMIT = 20;
const X_REFERENCED_POST_PREVIEW_MAX_IDS = X_STORED_POSTS_RETAIN_LIMIT * 2;
const X_RELATION_COLLECTION_VERSION = "v3";
const X_RELATION_MARKER_TTL_MS = 10 * 365 * 24 * 60 * 60_000;
const X_COLLECTION_MAX_RESULTS = 5;
const X_COLLECTION_ACTIVE_CHECK_INTERVAL_MS = 2 * 60 * 60_000;
const X_COLLECTION_IDLE_CHECK_INTERVAL_MS = 12 * 60 * 60_000;
const X_COLLECTION_DORMANT_CHECK_INTERVAL_MS = 24 * 60 * 60_000;
const X_COLLECTION_ERROR_BACKOFF_MS = 6 * 60 * 60_000;
const X_COLLECTION_RATE_LIMIT_BACKOFF_MS = 60 * 60_000;
const X_DAILY_BUDGET_CENTS_DEFAULT = 100;
const X_POST_READ_COST_MICROS = 5_000;
const X_USER_READ_COST_MICROS = 10_000;
const X_MEDIA_READ_COST_MICROS = 5_000;

const X_USER_CACHE = new Map<string, CachedXUser>();
const X_POSTS_CACHE = new Map<string, CachedXPostsEntry>();
const X_POSTS_IN_FLIGHT = new Map<string, Promise<CachedXPostsWriteEntry>>();

const now = () => Date.now();

const isCacheFresh = (entry: { expiresAt: number }) => now() < entry.expiresAt;

const isCacheUsable = (
  entry: { fetchedAt: number },
  staleTtlMs: number,
) => now() - entry.fetchedAt < staleTtlMs;

const normalizeHandle = (handle: string) => handle.trim().toLowerCase();

const buildXPostUrl = (username: string, postId: string) =>
  `https://x.com/${username}/status/${postId}`;

const getUserCacheKey = (handle: string) =>
  `x:user:v1:${normalizeHandle(handle)}`;

const getPostsCacheKey = (
  handle: string,
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
) =>
  `x:posts:${X_POSTS_CACHE_POLICY.version}:${normalizeHandle(
    handle,
  )}:${maxResults}:${richXLinkPreviewEnabled ? "rich" : "plain"}`;

const getLinkedPostCacheKey = (id: string) => `x:linked-post:v1:${id}`;

const getRelationCollectionMarkerKey = (handle: string) =>
  `x:relations:${X_RELATION_COLLECTION_VERSION}:${normalizeHandle(handle)}`;

export const extractXHandleFromUrl = (value?: string | null): string | null => {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  if (/^[A-Za-z0-9_]{1,15}$/.test(normalized)) {
    return normalized;
  }

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com" && !host.endsWith(".twitter.com")) {
      return null;
    }

    const handle = decodeURIComponent(
      url.pathname.split("/").filter(Boolean)[0] ?? "",
    );
    if (
      !handle ||
      ["home", "i", "intent", "messages", "notifications", "search", "share"].includes(
        handle.toLowerCase(),
      ) ||
      !/^[A-Za-z0-9_]{1,15}$/.test(handle)
    ) {
      return null;
    }
    return handle;
  } catch {
    return null;
  }
};

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const results = (value as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const readD1Setting = async (
  cacheDb: XCacheDb | undefined,
  key: string,
): Promise<string | null> => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare("SELECT value FROM settings WHERE key = ?")
      .bind(key)
      .first<{ value: string | null }>();
    return row?.value ?? null;
  } catch (error) {
    console.warn("Failed to read X setting", error);
    return null;
  }
};

const writeD1Setting = async (
  cacheDb: XCacheDb | undefined,
  key: string,
  value: string,
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .bind(key, value, String(now()))
      .run();
  } catch (error) {
    console.warn("Failed to write X setting", error);
  }
};

const startOfUtcDay = (value = now()) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const readDailyUsageMicros = async (
  cacheDb: XCacheDb | undefined,
): Promise<number | null> => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare(
        `SELECT COALESCE(SUM(estimated_cost_micros), 0) AS total
         FROM x_api_usage_events
         WHERE created_at >= ?`,
      )
      .bind(startOfUtcDay())
      .first<{ total: number | string | null }>();
    const total = Number(row?.total ?? 0);
    return Number.isFinite(total) ? total : 0;
  } catch (error) {
    console.warn("Failed to read X API usage budget", error);
    return null;
  }
};

const readDailyBudgetMicros = async (cacheDb: XCacheDb | undefined) => {
  const value = await readD1Setting(cacheDb, "x_collection_daily_budget_cents");
  const cents = Number.parseInt(value ?? "", 10);
  const safeCents =
    Number.isFinite(cents) && cents > 0 ? cents : X_DAILY_BUDGET_CENTS_DEFAULT;
  return safeCents * 10_000;
};

const readXApiBackoffUntil = async (cacheDb: XCacheDb | undefined) => {
  const value = await readD1Setting(cacheDb, X_API_BACKOFF_UNTIL_SETTING_KEY);
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const assertXApiNotBackedOff = async (cacheDb: XCacheDb | undefined) => {
  const backoffUntil = await readXApiBackoffUntil(cacheDb);
  if (backoffUntil <= now()) return;

  throw new XApiError("X API rate limit backoff active", 429, {
    code: "rate_limited",
    sourceStatus: 429,
    detail: `X API calls are paused until ${new Date(backoffUntil).toISOString()}.`,
  });
};

const getXRateLimitResetAt = (response: Response) => {
  const resetSeconds = Number.parseInt(
    response.headers.get("x-rate-limit-reset") ?? "",
    10,
  );
  if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
    return resetSeconds * 1000;
  }

  const retryAfterSeconds = Number.parseInt(
    response.headers.get("retry-after") ?? "",
    10,
  );
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return now() + retryAfterSeconds * 1000;
  }

  return now() + X_COLLECTION_RATE_LIMIT_BACKOFF_MS;
};

const writeXApiBackoff = async (
  cacheDb: XCacheDb | undefined,
  response: Response,
) => {
  await writeD1Setting(
    cacheDb,
    X_API_BACKOFF_UNTIL_SETTING_KEY,
    String(getXRateLimitResetAt(response)),
  );
};

const getPositiveIntegerParam = (
  path: string,
  key: string,
  fallback: number,
) => {
  const query = path.split("?")[1] ?? "";
  const parsed = Number.parseInt(new URLSearchParams(query).get(key) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getCommaSeparatedParamCount = (path: string, key: string) => {
  const query = path.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(key);
  if (!value) return 0;
  return value.split(",").map((item) => item.trim()).filter(Boolean).length;
};

const estimateXApiRequestCostMicros = (
  operation: XApiUsageOperation,
  path: string,
) => {
  if (operation === "user_lookup") {
    return getCommaSeparatedParamCount(path, "usernames") * X_USER_READ_COST_MICROS;
  }

  if (operation === "tweet_lookup") {
    const idCount = getCommaSeparatedParamCount(path, "ids");
    return (
      idCount * X_POST_READ_COST_MICROS +
      idCount * X_USER_READ_COST_MICROS +
      idCount * X_MEDIA_READ_COST_MICROS
    );
  }

  const maxResults = getPositiveIntegerParam(
    path,
    "max_results",
    X_COLLECTION_MAX_RESULTS,
  );
  return maxResults * (X_POST_READ_COST_MICROS + X_MEDIA_READ_COST_MICROS);
};

type XApiBudgetSettlement = (actualUsedMicros?: number) => Promise<void>;
const noopXApiBudgetSettlement: XApiBudgetSettlement = async () => {};

const reserveXApiBudget = async (
  cacheDb: XCacheDb | undefined,
  estimatedCostMicros: number,
  usageTracker?: XApiUsageTracker,
) => {
  if (!cacheDb) return noopXApiBudgetSettlement;

  const usedMicros = await readDailyUsageMicros(cacheDb);
  if (usedMicros === null) return noopXApiBudgetSettlement;

  const budgetMicros = await readDailyBudgetMicros(cacheDb);
  const reservedMicros = usageTracker?.reservedCostMicros ?? 0;
  if (usedMicros + reservedMicros + estimatedCostMicros > budgetMicros) {
    throw new XApiError("X API daily budget exhausted", 429, {
      code: "budget_exceeded",
      detail: "X API daily budget has been exhausted for this UTC day.",
    });
  }

  if (estimatedCostMicros <= 0) return noopXApiBudgetSettlement;

  const timestamp = now();
  const day = new Date(timestamp).toISOString().slice(0, 10);
  let ledgerReserved = false;
  try {
    const reservation = await cacheDb.prepare(
      `INSERT INTO scheduled_usage_daily (
         day, lane, resource, reserved, used, limit_value, updated_at
       ) VALUES (?, 'all', 'x_api_cost_micros', ?, ?, ?, ?)
       ON CONFLICT(day, lane, resource) DO UPDATE SET
         reserved = scheduled_usage_daily.reserved + excluded.reserved,
         used = MAX(scheduled_usage_daily.used, excluded.used),
         limit_value = excluded.limit_value,
         updated_at = excluded.updated_at
       WHERE MAX(scheduled_usage_daily.used, excluded.used) +
               scheduled_usage_daily.reserved + excluded.reserved
             <= excluded.limit_value
       RETURNING reserved`,
    ).bind(
      day,
      estimatedCostMicros,
      usedMicros,
      budgetMicros,
      timestamp,
    ).first<{ reserved: number | string }>();
    if (!reservation) {
      const existing = await cacheDb.prepare(
        `SELECT limit_value AS limitValue FROM scheduled_usage_daily
         WHERE day = ? AND lane = 'all' AND resource = 'x_api_cost_micros'`,
      ).bind(day).first<{ limitValue: number | string }>();
      if (existing) {
        throw new XApiError("X API daily budget exhausted", 429, {
          code: "budget_exceeded",
          detail: "X API daily budget has been exhausted for this UTC day.",
        });
      }
    } else {
      ledgerReserved = true;
    }
  } catch (error) {
    if (error instanceof XApiError) throw error;
    console.warn("Failed to atomically reserve X API budget", error);
    // Older local fixtures can omit the scheduler ledger. The usage-event
    // check above remains a conservative fallback until migration 0068 is
    // present; production deploy is gated on that migration.
  }

  if (usageTracker) usageTracker.reservedCostMicros += estimatedCostMicros;
  return async (actualUsedMicros = 0) => {
    const settledMicros = Number.isFinite(actualUsedMicros)
      ? Math.max(0, Math.trunc(actualUsedMicros))
      : 0;
    if (usageTracker) {
      usageTracker.reservedCostMicros = Math.max(
        0,
        usageTracker.reservedCostMicros - estimatedCostMicros,
      );
    }
    if (!ledgerReserved) return;
    try {
      await cacheDb.prepare(
        `UPDATE scheduled_usage_daily
         SET reserved = MAX(0, reserved - ?), used = used + ?, updated_at = ?
         WHERE day = ? AND lane = 'all' AND resource = 'x_api_cost_micros'`,
      ).bind(
        estimatedCostMicros,
        settledMicros,
        now(),
        day,
      ).run();
    } catch (error) {
      console.warn("Failed to settle X API budget reservation", error);
    }
  };
};

const estimateXApiUsage = (
  operation: XApiUsageOperation,
  response: XApiResponseWithResources,
) => {
  const dataCount = Array.isArray(response.data) ? response.data.length : 0;
  const mediaCount = Array.isArray(response.includes?.media)
    ? response.includes.media.length
    : 0;
  const userCount =
    operation === "tweet_lookup"
      ? Array.isArray(response.includes?.users)
        ? response.includes.users.length
        : 0
      : operation === "user_lookup"
        ? dataCount
        : 0;
  const postCount = operation === "user_lookup" ? 0 : dataCount;
  const estimatedCostMicros =
    postCount * X_POST_READ_COST_MICROS +
    userCount * X_USER_READ_COST_MICROS +
    mediaCount * X_MEDIA_READ_COST_MICROS;

  return {
    postCount,
    userCount,
    mediaCount,
    resourceCount: postCount + userCount + mediaCount,
    estimatedCostMicros,
  };
};

const writeXApiUsageEvent = async (
  cacheDb: XCacheDb | undefined,
  operation: XApiUsageOperation,
  endpoint: string,
  status: number,
  response: XApiResponseWithResources | null,
  usageTracker?: XApiUsageTracker,
  unmeasuredCostMicros = 0,
) => {
  const estimate = response
    ? estimateXApiUsage(operation, response)
    : {
        postCount: 0,
        userCount: 0,
        mediaCount: 0,
        resourceCount: 0,
        estimatedCostMicros: Math.max(0, Math.trunc(unmeasuredCostMicros)),
      };
  if (usageTracker) {
    usageTracker.apiCalls += 1;
    usageTracker.estimatedCostMicros += estimate.estimatedCostMicros;
  }

  if (!cacheDb) return estimate.estimatedCostMicros;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_api_usage_events (
           operation, endpoint, resource_type, resource_count,
           estimated_cost_micros, status, created_at, detail
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        operation,
        endpoint.slice(0, 500),
        "mixed",
        estimate.resourceCount,
        estimate.estimatedCostMicros,
        status,
        now(),
        JSON.stringify({
          posts: estimate.postCount,
          users: estimate.userCount,
          media: estimate.mediaCount,
          source: usageTracker?.source ?? null,
          forceRefreshPath: usageTracker?.forceRefreshPath ?? null,
          costBasis: response
            ? "measured_resources"
            : estimate.estimatedCostMicros > 0
              ? "conservative_request_estimate"
              : "no_measurable_resources",
        }),
      )
      .run();
  } catch (error) {
    console.warn("Failed to write X API usage event", error);
  }
  return estimate.estimatedCostMicros;
};

const redactXErrorDetail = (value: string) =>
  value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/\[\d{8,}\]/g, "[redacted]")
    .replace(/\b(account|client|user)\s+\d{8,}\b/gi, "$1 [redacted]");

const truncateXErrorDetail = (value: string) => {
  const normalized = redactXErrorDetail(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= X_ERROR_DETAIL_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, X_ERROR_DETAIL_MAX_LENGTH)}...`;
};

const getStringField = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const collectXErrorMessages = (value: unknown): string[] => {
  if (!value || typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const directMessages = [
    record.title,
    record.detail,
    record.reason,
    record.error,
    record.message,
    record.type,
  ]
    .map(getStringField)
    .filter((item): item is string => Boolean(item));

  const nestedMessages = Array.isArray(record.errors)
    ? record.errors.flatMap((item) => collectXErrorMessages(item))
    : [];

  return [...directMessages, ...nestedMessages];
};

const summarizeXApiErrorBody = (body: string, fallback: string) => {
  const trimmed = body.trim();
  if (!trimmed) return fallback;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const messages = Array.from(new Set(collectXErrorMessages(parsed)));
    if (messages.length > 0) {
      return truncateXErrorDetail(messages.join(" | "));
    }
  } catch {
    // Fall through to the raw body summary below.
  }

  return truncateXErrorDetail(trimmed);
};

const requestXApi = async <T>(
  path: string,
  bearerToken: string,
  options: {
    cacheDb?: XCacheDb;
    operation?: XApiUsageOperation;
    usageTracker?: XApiUsageTracker;
  } = {},
): Promise<T> => {
  let settleBudgetReservation: XApiBudgetSettlement = noopXApiBudgetSettlement;
  let actualUsedMicros = 0;
  let reservedCostMicros = 0;
  let requestDispatched = false;
  let responseStatus = 0;
  let usageRecorded = false;
  if (options.operation) {
    await assertXApiNotBackedOff(options.cacheDb);
    reservedCostMicros = estimateXApiRequestCostMicros(
      options.operation,
      path,
    );
    settleBudgetReservation = await reserveXApiBudget(
      options.cacheDb,
      reservedCostMicros,
      options.usageTracker,
    );
  }

  try {
    requestDispatched = true;
    const response = await fetch(`${X_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
      },
    });
    responseStatus = response.status;

    if (!response.ok) {
      if (response.status === 429) {
        await writeXApiBackoff(options.cacheDb, response);
      }
      if (options.operation) {
        actualUsedMicros = await writeXApiUsageEvent(
          options.cacheDb,
          options.operation,
          path,
          response.status,
          null,
          options.usageTracker,
          reservedCostMicros,
        );
        usageRecorded = true;
      }
      const body = await response.text().catch(() => "");
      const fallback = `X API request failed with status ${response.status}`;
      const detail = summarizeXApiErrorBody(body, fallback);
      throw new XApiError(
        fallback,
        response.status,
        {
          code:
            response.status === 429
              ? "rate_limited"
              : `x_api_${response.status}`,
          sourceStatus: response.status,
          detail,
        },
      );
    }

    const data = (await response.json()) as T;
    if (options.operation) {
      actualUsedMicros = await writeXApiUsageEvent(
        options.cacheDb,
        options.operation,
        path,
        response.status,
        data as XApiResponseWithResources,
        options.usageTracker,
      );
      usageRecorded = true;
    }

    return data;
  } catch (error) {
    if (options.operation && requestDispatched && !usageRecorded) {
      actualUsedMicros = await writeXApiUsageEvent(
        options.cacheDb,
        options.operation,
        path,
        responseStatus,
        null,
        options.usageTracker,
        reservedCostMicros,
      );
    }
    throw error;
  } finally {
    await settleBudgetReservation(actualUsedMicros);
  }
};

const readD1Cache = async <T>(
  cacheDb: XCacheDb | undefined,
  key: string,
  staleTtlMs: number,
): Promise<D1CacheEntry<T> | null> => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare(
        "SELECT value, fetched_at, expires_at FROM x_api_cache WHERE key = ?",
      )
      .bind(key)
      .first<XCacheRow>();

    if (!row) return null;

    const fetchedAt = Number(row.fetched_at);
    const expiresAt = Number(row.expires_at);
    if (!Number.isFinite(fetchedAt) || !Number.isFinite(expiresAt)) {
      return null;
    }

    const entry = {
      value: JSON.parse(row.value) as T,
      fetchedAt,
      expiresAt,
      staleUsable: now() - fetchedAt < staleTtlMs,
    };

    return entry.staleUsable ? entry : null;
  } catch (error) {
    console.warn("Failed to read X API cache", error);
    return null;
  }
};

const writeD1Cache = async <T>(
  cacheDb: XCacheDb | undefined,
  key: string,
  type: "user" | "posts" | "linked_post" | "relation_version",
  value: T,
  fetchedAt: number,
  ttlMs: number,
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_api_cache (key, type, value, fetched_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           type = excluded.type,
           value = excluded.value,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`,
      )
      .bind(key, type, JSON.stringify(value), fetchedAt, fetchedAt + ttlMs)
      .run();
  } catch (error) {
    console.warn("Failed to write X API cache", error);
  }
};

const hasCurrentRelationCollectionMarker = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
) => {
  if (!cacheDb) return true;

  const cached = await readD1Cache<{ version: string }>(
    cacheDb,
    getRelationCollectionMarkerKey(handle),
    X_RELATION_MARKER_TTL_MS,
  );
  return cached?.value.version === X_RELATION_COLLECTION_VERSION;
};

const writeCurrentRelationCollectionMarker = (
  cacheDb: XCacheDb | undefined,
  handle: string,
) =>
  writeD1Cache(
    cacheDb,
    getRelationCollectionMarkerKey(handle),
    "relation_version",
    { version: X_RELATION_COLLECTION_VERSION },
    now(),
    X_RELATION_MARKER_TTL_MS,
  );

const readStoredPostSource = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
): Promise<XPostSourceRow | null> => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare(
        `SELECT handle, user_id, username, last_seen_post_id, last_checked_at,
                updated_at, last_error
         FROM x_post_sources
         WHERE handle = ?`,
      )
      .bind(normalizeHandle(handle))
      .first<XPostSourceRow>();
    return row ?? null;
  } catch (error) {
    console.warn("Failed to read stored X post source", error);
    return null;
  }
};

const normalizeStoredXPost = (post: XPostItem): XPostItem =>
  post.reply
    ? {
        ...post,
        reply: {
          ...post.reply,
          post: post.reply.post ?? null,
        },
      }
    : post;

const parseStoredXPost = (row: XStoredPostRow): XPostItem | null => {
  try {
    return normalizeStoredXPost(JSON.parse(row.value) as XPostItem);
  } catch (error) {
    console.warn("Failed to parse stored X post", { id: row.id, error });
    return null;
  }
};

export const readStoredXReplyReference = async (
  cacheDb: XCacheDb | undefined,
  sourcePostId: string,
): Promise<{ handle: string; replyToPostId: string } | null> => {
  if (!cacheDb) return null;

  try {
    const row = await cacheDb
      .prepare(
        `SELECT id, handle, user_id, username, value, created_at, fetched_at, hidden_at
         FROM x_posts
         WHERE id = ? AND hidden_at IS NULL`,
      )
      .bind(sourcePostId)
      .first<XStoredPostRow>();
    if (!row) return null;

    const post = parseStoredXPost(row);
    if (!post?.reply?.postId) return null;

    return {
      handle: normalizeHandle(row.handle),
      replyToPostId: post.reply.postId,
    };
  } catch (error) {
    console.warn("Failed to read stored X reply reference", error);
    return null;
  }
};

const sortXPostsDesc = (posts: XPostItem[]) =>
  [...posts].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const mergeXPosts = (...postGroups: XPostItem[][]) => {
  const byId = new Map<string, XPostItem>();
  for (const post of postGroups.flat()) {
    if (!byId.has(post.id)) {
      byId.set(post.id, post);
    }
  }
  return sortXPostsDesc(Array.from(byId.values()));
};

const shouldUseFreshStoredPosts = (entry: StoredXPostsEntry) =>
  entry.lastCheckedAt !== null &&
  now() - entry.lastCheckedAt < X_POSTS_CACHE_POLICY.freshTtlMs;

const readStoredPosts = async (
  handle: string,
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
): Promise<StoredXPostsEntry | null> => {
  if (!cacheDb) return null;

  const normalizedHandle = normalizeHandle(handle);
  try {
    const [source, rowsResult] = await Promise.all([
      readStoredPostSource(cacheDb, normalizedHandle),
      cacheDb
        .prepare(
          `SELECT id, handle, user_id, username, value, created_at, fetched_at, hidden_at
           FROM x_posts
           WHERE handle = ? AND hidden_at IS NULL
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(normalizedHandle, maxResults)
        .all<XStoredPostRow>(),
    ]);

    const rows = getD1Results<XStoredPostRow>(rowsResult);
    const posts = rows
      .map(parseStoredXPost)
      .filter((post): post is XPostItem => post !== null);
    if (!source && posts.length === 0) return null;

    const latestFetchedAt = rows.reduce((latest, row) => {
      const value = Number(row.fetched_at);
      return Number.isFinite(value) ? Math.max(latest, value) : latest;
    }, 0);
    const lastCheckedAt = source ? Number(source.last_checked_at) : latestFetchedAt;
    const safeLastCheckedAt = Number.isFinite(lastCheckedAt)
      ? lastCheckedAt
      : null;
    const fetchedAt = safeLastCheckedAt ?? latestFetchedAt;
    const responsePosts = richXLinkPreviewEnabled
      ? posts
      : stripStoredXLinkedPostPreviews(posts);

    return {
      fetchedAt,
      expiresAt: fetchedAt + X_POSTS_CACHE_POLICY.freshTtlMs,
      userId: source?.user_id ?? rows[0]?.user_id ?? null,
      posts: responsePosts,
      lastCheckedAt: safeLastCheckedAt,
      lastSeenPostId:
        source?.last_seen_post_id ?? sortXPostsDesc(posts)[0]?.id ?? null,
      lastError: source?.last_error ?? null,
    };
  } catch (error) {
    console.warn("Failed to read stored X posts", error);
    return null;
  }
};

const trimStoredPosts = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  retainLimit: number,
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `DELETE FROM x_posts
         WHERE handle = ?
           AND id NOT IN (
             SELECT id FROM x_posts
             WHERE handle = ?
             ORDER BY created_at DESC, id DESC
             LIMIT ?
           )`,
      )
      .bind(normalizeHandle(handle), normalizeHandle(handle), retainLimit)
      .run();
  } catch (error) {
    console.warn("Failed to trim stored X posts", error);
  }
};

const writeStoredPosts = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  user: XApiUser,
  posts: XPostItem[],
  fetchedAt: number,
): Promise<StoredXPostsWriteResult> => {
  if (!cacheDb || posts.length === 0) {
    return { ok: true, count: 0, error: null };
  }

  const normalizedHandle = normalizeHandle(handle);
  try {
    const placeholders = posts.map(() =>
      "(?, ?, ?, ?, ?, ?, ?, NULL)"
    ).join(", ");
    const bindings = posts.flatMap((post) => [
      post.id,
      normalizedHandle,
      user.id,
      post.username,
      JSON.stringify(post),
      post.createdAt,
      fetchedAt,
    ]);
    await cacheDb
      .prepare(
        `INSERT INTO x_posts (
           id, handle, user_id, username, value, created_at, fetched_at, hidden_at
         ) VALUES ${placeholders}
         ON CONFLICT(id) DO UPDATE SET
           handle = excluded.handle,
           user_id = excluded.user_id,
           username = excluded.username,
           value = excluded.value,
           created_at = excluded.created_at,
           fetched_at = excluded.fetched_at,
           hidden_at = NULL`,
      )
      .bind(...bindings)
      .run();
    await trimStoredPosts(cacheDb, normalizedHandle, X_STORED_POSTS_RETAIN_LIMIT);
    return { ok: true, count: posts.length, error: null };
  } catch (error) {
    console.warn("Failed to write stored X posts", error);
    return {
      ok: false,
      count: 0,
      error: error instanceof Error ? error.message : "stored_post_write_failed",
    };
  }
};

const writeStoredPostSource = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  user: XApiUser,
  lastSeenPostId: string | null,
  checkedAt: number,
  lastError: string | null = null,
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_post_sources (
           handle, user_id, username, last_seen_post_id, last_checked_at,
           updated_at, last_error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(handle) DO UPDATE SET
           user_id = excluded.user_id,
           username = excluded.username,
           last_seen_post_id = COALESCE(excluded.last_seen_post_id, x_post_sources.last_seen_post_id),
           last_checked_at = excluded.last_checked_at,
           updated_at = excluded.updated_at,
           last_error = excluded.last_error`,
      )
      .bind(
        normalizeHandle(handle),
        user.id,
        user.username,
        lastSeenPostId,
        checkedAt,
        checkedAt,
        lastError,
      )
      .run();
  } catch (error) {
    console.warn("Failed to write stored X post source", error);
  }
};

const writeStoredPostSourceError = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  lastError: string | null,
) => {
  if (!cacheDb || !lastError) return;

  const checkedAt = now();
  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_post_sources (
           handle, user_id, username, last_seen_post_id, last_checked_at,
           updated_at, last_error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(handle) DO UPDATE SET
           last_checked_at = excluded.last_checked_at,
           updated_at = excluded.updated_at,
           last_error = excluded.last_error`,
      )
      .bind(normalizeHandle(handle), null, null, null, checkedAt, checkedAt, lastError)
      .run();
  } catch (error) {
    console.warn("Failed to write stored X post source error", error);
  }
};

const getCachedUser = async (
  handle: string,
  cacheDb?: XCacheDb,
): Promise<CachedXUser | null> => {
  const normalizedHandle = normalizeHandle(handle);
  const cached = X_USER_CACHE.get(normalizedHandle);
  if (cached && isCacheFresh(cached)) {
    return cached;
  }

  const persisted = await readD1Cache<XUserCacheValue>(
    cacheDb,
    getUserCacheKey(normalizedHandle),
    X_USER_LOOKUP_CACHE_POLICY.staleTtlMs,
  );
  if (!persisted) {
    return cached && isCacheUsable(cached, X_USER_LOOKUP_CACHE_POLICY.staleTtlMs)
      ? cached
      : null;
  }
  if (
    cached &&
    cached.fetchedAt > persisted.fetchedAt &&
    isCacheUsable(cached, X_USER_LOOKUP_CACHE_POLICY.staleTtlMs)
  ) {
    return cached;
  }

  const entry = {
    fetchedAt: persisted.fetchedAt,
    expiresAt: persisted.expiresAt,
    user: persisted.value.user,
  };
  X_USER_CACHE.set(normalizedHandle, entry);
  return entry;
};

const setCachedUser = async (
  handle: string,
  user: XApiUser | null,
  cacheDb?: XCacheDb,
) => {
  const normalizedHandle = normalizeHandle(handle);
  const fetchedAt = now();
  const ttlMs = user
    ? X_USER_LOOKUP_CACHE_POLICY.freshTtlMs
    : X_USER_LOOKUP_CACHE_POLICY.notFoundTtlMs;
  const entry = {
    fetchedAt,
    expiresAt: fetchedAt + ttlMs,
    user,
  };

  X_USER_CACHE.set(normalizedHandle, entry);
  await writeD1Cache<XUserCacheValue>(
    cacheDb,
    getUserCacheKey(normalizedHandle),
    "user",
    { user },
    fetchedAt,
    ttlMs,
  );
};

const getCachedPosts = async (
  handle: string,
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
): Promise<CachedXPostsEntry | null> => {
  const cacheKey = getPostsCacheKey(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
  );
  const cached = X_POSTS_CACHE.get(cacheKey);
  if (cached && isCacheFresh(cached)) {
    return cached;
  }

  const persisted = await readD1Cache<XPostsCacheValue>(
    cacheDb,
    cacheKey,
    X_POSTS_CACHE_POLICY.staleTtlMs,
  );
  if (!persisted) {
    return cached && isCacheUsable(cached, X_POSTS_CACHE_POLICY.staleTtlMs)
      ? cached
      : null;
  }
  if (
    cached &&
    cached.fetchedAt > persisted.fetchedAt &&
    isCacheUsable(cached, X_POSTS_CACHE_POLICY.staleTtlMs)
  ) {
    return cached;
  }

  const entry = {
    fetchedAt: persisted.fetchedAt,
    expiresAt: persisted.expiresAt,
    userId: persisted.value.userId,
    posts: persisted.value.posts.map(normalizeStoredXPost),
  };
  X_POSTS_CACHE.set(cacheKey, entry);
  return entry;
};

const setCachedPosts = async (
  handle: string,
  user: XApiUser,
  posts: XPostItem[],
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
  lastSeenPostId?: string | null,
  postsToStore: XPostItem[] = posts,
): Promise<CachedXPostsWriteEntry> => {
  const fetchedAt = now();
  const entry = {
    fetchedAt,
    expiresAt: fetchedAt + X_POSTS_CACHE_POLICY.freshTtlMs,
    userId: user.id,
    posts,
  };
  const cacheKey = getPostsCacheKey(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
  );

  X_POSTS_CACHE.set(cacheKey, entry);
  await writeD1Cache<XPostsCacheValue>(
    cacheDb,
    cacheKey,
    "posts",
    { userId: user.id, posts },
    fetchedAt,
    X_POSTS_CACHE_POLICY.freshTtlMs,
  );
  const storedPostsWrite = await writeStoredPosts(
    cacheDb,
    handle,
    user,
    postsToStore,
    fetchedAt,
  );
  if (storedPostsWrite.ok) {
    await writeStoredPostSource(
      cacheDb,
      handle,
      user,
      lastSeenPostId ?? sortXPostsDesc(posts)[0]?.id ?? null,
      fetchedAt,
    );
  }

  return {
    ...entry,
    postsStored: storedPostsWrite.count,
    storageError: storedPostsWrite.ok ? null : "x_post_storage_failed",
  };
};

const makeCachedPostsResult = (
  handle: string,
  cached: CachedXPostsEntry,
  stale: boolean,
  errorInfo: Pick<
    XHandlePostsResult,
    "error" | "errorStatus" | "errorDetail"
  > = { error: null },
): XHandlePostsResult => ({
  handle,
  userId: cached.userId,
  posts: cached.posts,
  ...errorInfo,
  stale,
  postsStored: 0,
  storageError: null,
});

const fetchXUsersByHandles = async (
  handles: string[],
  bearerToken: string,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
): Promise<Map<string, XApiUser | null>> => {
  const requestedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter(Boolean)),
  );
  const result = new Map<string, XApiUser | null>();
  const staleFallbacks = new Map<string, CachedXUser>();
  const handlesToFetch: string[] = [];

  for (const handle of requestedHandles) {
    const cached = await getCachedUser(handle, cacheDb);
    if (cached && isCacheFresh(cached)) {
      result.set(handle, cached.user);
      continue;
    }

    if (cached) {
      staleFallbacks.set(handle, cached);
    }
    handlesToFetch.push(handle);
  }

  if (handlesToFetch.length === 0) {
    return result;
  }

  const params = new URLSearchParams({
    usernames: handlesToFetch.join(","),
    "user.fields": "id,name,username,protected",
  });

  try {
    const response = await requestXApi<XUsersByUsernamesResponse>(
      `/users/by?${params}`,
      bearerToken,
      {
        cacheDb,
        operation: "user_lookup",
        usageTracker,
      },
    );
    const fetchedByHandle = new Map(
      (response.data ?? []).map((user) => [normalizeHandle(user.username), user]),
    );

    for (const handle of handlesToFetch) {
      const user = fetchedByHandle.get(handle) ?? null;
      await setCachedUser(handle, user, cacheDb);
      result.set(handle, user);
    }
  } catch (error) {
    let hasMissingFallback = false;
    for (const handle of handlesToFetch) {
      const cached = staleFallbacks.get(handle);
      if (cached) {
        result.set(handle, cached.user);
      } else {
        hasMissingFallback = true;
      }
    }

    if (hasMissingFallback) {
      throw error;
    }
  }

  return result;
};

const normalizeXMetrics = (metrics: XTimelinePost["public_metrics"] = {}) => ({
  likeCount: metrics.like_count ?? 0,
  replyCount: metrics.reply_count ?? 0,
  repostCount: metrics.retweet_count ?? 0,
  quoteCount: metrics.quote_count ?? 0,
});

const normalizeXMediaItems = (
  mediaKeys: string[] | undefined,
  mediaByKey: Map<string, XTimelineMedia>,
): XPostMediaItem[] =>
  (mediaKeys ?? [])
    .map((mediaKey): XPostMediaItem | null => {
      const item = mediaByKey.get(mediaKey);
      if (!item) return null;

      return {
        mediaKey,
        type: item.type ?? "unknown",
        url: item.url ?? null,
        previewImageUrl: item.preview_image_url ?? null,
        width: item.width ?? null,
        height: item.height ?? null,
        altText: item.alt_text ?? null,
      };
    })
    .filter((item): item is XPostMediaItem => item !== null);

export const normalizeXTimelineResponse = (
  response: XUserTimelineResponse,
  username: string,
): XPostItem[] => {
  const mediaByKey = new Map(
    (response.includes?.media ?? []).map((media) => [media.media_key, media]),
  );

  return (response.data ?? []).map((post) => {
    const media = normalizeXMediaItems(post.attachments?.media_keys, mediaByKey);
    const links = (post.entities?.urls ?? [])
      .map((item): XPostLinkItem | null => {
        if (!item.url) return null;
        const resolvedUrl = item.unwound_url ?? item.expanded_url ?? item.url;
        const imageUrl =
          item.images?.find((image) => Boolean(image.url))?.url ?? null;

        return {
          url: item.url,
          expandedUrl: item.expanded_url ?? item.unwound_url ?? null,
          displayUrl: item.display_url ?? null,
          resolvedUrl,
          title: item.title ?? null,
          description: item.description ?? null,
          imageUrl,
        };
      })
      .filter((item): item is XPostLinkItem => item !== null);
    const quoteReference = post.referenced_tweets?.find(
      (reference) => reference.type === "quoted" && Boolean(reference.id),
    );
    const replyReference = post.referenced_tweets?.find(
      (reference) => reference.type === "replied_to" && Boolean(reference.id),
    );

    return {
      id: post.id,
      text: post.text ?? "",
      createdAt: post.created_at ?? new Date(0).toISOString(),
      url: buildXPostUrl(username, post.id),
      username,
      metrics: normalizeXMetrics(post.public_metrics),
      media,
      links,
      quote: quoteReference?.id
        ? { postId: quoteReference.id, post: null }
        : null,
      reply: replyReference?.id
        ? {
            postId: replyReference.id,
            conversationId: post.conversation_id ?? null,
            post: null,
          }
        : null,
    };
  });
};

const enrichXPostsWithLinkPreviews = async (posts: XPostItem[]) =>
  pMap(
    posts,
    async (post) => {
      if (!post.links || post.links.length === 0) return post;
      return {
        ...post,
        links: await enrichLinksWithPreviews(post.links),
      };
    },
    X_POSTS_BATCH_CONCURRENCY,
  );

const extractXStatusIdFromUrl = (value: string | null | undefined) => {
  if (!value) return null;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const statusIndex = segments.findIndex((segment) => {
      const normalized = segment.toLowerCase();
      return normalized === "status" || normalized === "statuses";
    });
    if (statusIndex < 0) return null;

    const id = segments[statusIndex + 1]?.match(/^\d{5,25}/)?.[0] ?? null;
    return id;
  } catch {
    return null;
  }
};

const extractLinkedXStatusId = (link: XPostLinkItem, sourcePostId: string) => {
  const candidates = [link.resolvedUrl, link.expandedUrl, link.url];
  for (const candidate of candidates) {
    const id = extractXStatusIdFromUrl(candidate);
    if (id && id !== sourcePostId) return id;
  }
  return null;
};

const inferMissingXQuoteReferences = (posts: XPostItem[]) =>
  posts.map((post) => {
    if (post.quote) return post;

    const quotePostId = (post.links ?? [])
      .map((link) => extractLinkedXStatusId(link, post.id))
      .find((id): id is string => Boolean(id));
    return quotePostId
      ? {
          ...post,
          quote: { postId: quotePostId, post: null },
        }
      : post;
  });

const collectLinkedXStatusIds = (posts: XPostItem[]) => {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const post of posts) {
    for (const link of post.links ?? []) {
      if (ids.length >= X_LINKED_POST_PREVIEW_MAX_IDS) return ids;

      const id = extractLinkedXStatusId(link, post.id);
      if (id && id === post.quote?.postId) continue;
      if (!id || seen.has(id)) continue;

      seen.add(id);
      ids.push(id);
    }
  }

  return ids;
};

const stripStoredXLinkedPostPreviews = (posts: XPostItem[]) =>
  posts.map((post) => {
    if (!post.links || post.links.length === 0) return post;

    return {
      ...post,
      links: post.links.map((link) => {
        const isXPostLink =
          Boolean(link.linkedPost) ||
          Boolean(extractLinkedXStatusId(link, post.id));
        if (!isXPostLink) return link;

        const rest = { ...link };
        delete rest.linkedPost;
        return {
          ...rest,
          previewStatus: "skipped" as const,
        };
      }),
    };
  });

const getLinkedPostImageUrl = (post: XLinkedPostPreviewItem) => {
  const media = post.media.find((item) => item.url || item.previewImageUrl);
  return media?.url ?? media?.previewImageUrl ?? null;
};

const getLinkedPostTitle = (post: XLinkedPostPreviewItem) =>
  post.name ? `${post.name} (@${post.username})` : `@${post.username}`;

const normalizeLinkedXPost = (
  post: XTweetLookupPost,
  usersById: Map<string, XApiUser>,
  mediaByKey: Map<string, XTimelineMedia>,
): XLinkedPostPreviewItem | null => {
  const user = post.author_id ? usersById.get(post.author_id) : null;
  if (user?.protected) return null;

  const username = user?.username ?? "i";
  const url = user?.username
    ? buildXPostUrl(user.username, post.id)
    : `https://x.com/i/web/status/${post.id}`;

  return {
    id: post.id,
    text: post.text ?? "",
    createdAt: post.created_at ?? null,
    url,
    username,
    name: user?.name ?? null,
    profileImageUrl: user?.profile_image_url ?? null,
    metrics: normalizeXMetrics(post.public_metrics),
    media: normalizeXMediaItems(post.attachments?.media_keys, mediaByKey),
  };
};

const fetchLinkedXPostsByIds = async (
  ids: string[],
  bearerToken: string,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
  maxIds = X_LINKED_POST_PREVIEW_MAX_IDS,
): Promise<Map<string, XLinkedPostPreviewItem>> => {
  const requestedIds = Array.from(new Set(ids.filter(Boolean))).slice(
    0,
    maxIds,
  );
  if (requestedIds.length === 0) return new Map();

  const result = new Map<string, XLinkedPostPreviewItem>();
  const idsToFetch: string[] = [];

  for (const id of requestedIds) {
    const cached = await readD1Cache<XLinkedPostCacheValue>(
      cacheDb,
      getLinkedPostCacheKey(id),
      X_LINKED_POST_LOOKUP_CACHE_POLICY.freshTtlMs,
    );
    if (cached) {
      if (cached.value.post) {
        result.set(id, cached.value.post);
        continue;
      }
      if (now() - cached.fetchedAt < X_LINKED_POST_NEGATIVE_CACHE_TTL_MS) {
        continue;
      }
    }
    idsToFetch.push(id);
  }

  if (idsToFetch.length === 0) return result;
  if (!bearerToken.trim()) {
    throw new XApiError("X_BEARER_TOKEN is not configured", 502, {
      code: "missing_bearer_token",
      detail: "X_BEARER_TOKEN is not configured for this worker.",
    });
  }

  const params = new URLSearchParams({
    ids: idsToFetch.join(","),
    "tweet.fields": "created_at,public_metrics,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "name,username,profile_image_url,protected",
    "media.fields": "url,preview_image_url,type,width,height,alt_text",
  });

  const response = await requestXApi<XTweetLookupResponse>(
    `/tweets?${params}`,
    bearerToken,
    {
      cacheDb,
      operation: "tweet_lookup",
      usageTracker,
    },
  );
  const usersById = new Map(
    (response.includes?.users ?? []).map((user) => [user.id, user]),
  );
  const mediaByKey = new Map(
    (response.includes?.media ?? []).map((media) => [media.media_key, media]),
  );
  const fetchedIds = new Set<string>();

  for (const post of response.data ?? []) {
    fetchedIds.add(post.id);
    const normalized = normalizeLinkedXPost(post, usersById, mediaByKey);
    if (normalized) {
      result.set(post.id, normalized);
      await writeD1Cache<XLinkedPostCacheValue>(
        cacheDb,
        getLinkedPostCacheKey(post.id),
        "linked_post",
        { post: normalized },
        now(),
        X_LINKED_POST_LOOKUP_CACHE_POLICY.freshTtlMs,
      );
    } else {
      await writeD1Cache<XLinkedPostCacheValue>(
        cacheDb,
        getLinkedPostCacheKey(post.id),
        "linked_post",
        { post: null },
        now(),
        X_LINKED_POST_NEGATIVE_CACHE_TTL_MS,
      );
    }
  }

  for (const id of idsToFetch) {
    if (fetchedIds.has(id)) continue;
    await writeD1Cache<XLinkedPostCacheValue>(
      cacheDb,
      getLinkedPostCacheKey(id),
      "linked_post",
      { post: null },
      now(),
      X_LINKED_POST_NEGATIVE_CACHE_TTL_MS,
    );
  }

  return result;
};

export const fetchXPostPreviewById = async (
  postId: string,
  options: {
    bearerToken?: string | null;
    cacheDb?: XCacheDb;
    usageSource?: string;
  } = {},
) => {
  const usageTracker: XApiUsageTracker = {
    apiCalls: 0,
    estimatedCostMicros: 0,
    reservedCostMicros: 0,
    source: options.usageSource ?? "reply-context",
    forceRefreshPath: null,
  };
  const previews = await fetchLinkedXPostsByIds(
    [postId],
    options.bearerToken?.trim() ?? "",
    options.cacheDb,
    usageTracker,
  );
  return previews.get(postId) ?? null;
};

const mergeLinkedXPostPreview = (
  link: XPostLinkItem,
  linkedPost: XLinkedPostPreviewItem,
): XPostLinkItem => ({
  ...link,
  resolvedUrl: linkedPost.url,
  domain: "x.com",
  title: getLinkedPostTitle(linkedPost),
  description: linkedPost.text || null,
  imageUrl: getLinkedPostImageUrl(linkedPost),
  siteName: "X",
  previewStatus: "ready",
  linkedPost,
});

const enrichXPostsWithLinkedPostPreviews = async (
  posts: XPostItem[],
  bearerToken: string,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
) => {
  const linkedStatusIds = collectLinkedXStatusIds(posts);
  if (linkedStatusIds.length === 0) return posts;

  let previews: Map<string, XLinkedPostPreviewItem>;
  try {
    previews = await fetchLinkedXPostsByIds(
      linkedStatusIds,
      bearerToken,
      cacheDb,
      usageTracker,
    );
  } catch (error) {
    console.warn("Failed to enrich X linked post previews", error);
    return posts;
  }

  if (previews.size === 0) return posts;

  return posts.map((post) => {
    if (!post.links || post.links.length === 0) return post;

    return {
      ...post,
      links: post.links.map((link) => {
        const id = extractLinkedXStatusId(link, post.id);
        const linkedPost = id ? previews.get(id) : null;
        return linkedPost ? mergeLinkedXPostPreview(link, linkedPost) : link;
      }),
    };
  });
};

const enrichXPostsWithReferencedPosts = async (
  posts: XPostItem[],
  bearerToken: string,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
) => {
  const postsWithInferredQuotes = inferMissingXQuoteReferences(posts);
  const referenceIds = Array.from(
    new Set(
      postsWithInferredQuotes.flatMap((post) => [
        post.quote && !post.quote.post ? post.quote.postId : null,
        post.reply && !post.reply.post ? post.reply.postId : null,
      ]),
    ),
  )
    .filter((id): id is string => Boolean(id))
    .slice(0, X_REFERENCED_POST_PREVIEW_MAX_IDS);
  if (referenceIds.length === 0) return posts;

  let previews: Map<string, XLinkedPostPreviewItem>;
  try {
    previews = await fetchLinkedXPostsByIds(
      referenceIds,
      bearerToken,
      cacheDb,
      usageTracker,
      X_REFERENCED_POST_PREVIEW_MAX_IDS,
    );
  } catch (error) {
    console.warn("Failed to enrich referenced X posts", error);
    return postsWithInferredQuotes;
  }

  return postsWithInferredQuotes.map((post) => {
    const quotedPost =
      post.quote && !post.quote.post
        ? previews.get(post.quote.postId)
        : null;
    const repliedToPost =
      post.reply && !post.reply.post
        ? previews.get(post.reply.postId)
        : null;
    if (!quotedPost && !repliedToPost) return post;

    return {
      ...post,
      quote:
        post.quote && quotedPost
          ? { ...post.quote, post: quotedPost }
          : post.quote,
      reply:
        post.reply && repliedToPost
          ? { ...post.reply, post: repliedToPost }
          : post.reply,
    };
  });
};

const enrichNewXPostsWithLinkPreviews = async (
  posts: XPostItem[],
  bearerToken: string,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
) => {
  const postsWithInferredQuotes = inferMissingXQuoteReferences(posts);
  const postsWithLinkPreviews = await enrichXPostsWithLinkPreviews(
    postsWithInferredQuotes,
  );
  if (!richXLinkPreviewEnabled) {
    return postsWithLinkPreviews;
  }

  return enrichXPostsWithLinkedPostPreviews(
    postsWithLinkPreviews,
    bearerToken,
    cacheDb,
    usageTracker,
  );
};

const fetchXPostsForUser = async (
  handle: string,
  user: XApiUser,
  bearerToken: string,
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
  staleFallback?: CachedXPostsEntry,
  usageTracker?: XApiUsageTracker,
  forceRefresh = false,
): Promise<{
  posts: XPostItem[];
  error: string | null;
  errorStatus?: number | null;
  errorDetail?: string | null;
  stale: boolean;
  postsStored: number;
  storageError: string | null;
}> => {
  const hasRelationMarker = await hasCurrentRelationCollectionMarker(
    cacheDb,
    handle,
  );
  const relationCollectionLimit = hasRelationMarker
    ? maxResults
    : Math.max(maxResults, X_STORED_POSTS_RETAIN_LIMIT);
  const stored = await readStoredPosts(
    handle,
    relationCollectionLimit,
    richXLinkPreviewEnabled,
    cacheDb,
  );
  if (
    hasRelationMarker &&
    !forceRefresh &&
    stored &&
    shouldUseFreshStoredPosts(stored)
  ) {
    return {
      posts: stored.posts,
      error: null,
      stale: false,
      postsStored: 0,
      storageError: null,
    };
  }

  const cacheKey = getPostsCacheKey(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
  );
  const cached = await getCachedPosts(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
    cacheDb,
  );
  const collectionLimit =
    !hasRelationMarker &&
    Boolean((stored?.posts.length ?? 0) > 0 || (cached?.posts.length ?? 0) > 0)
      ? relationCollectionLimit
      : maxResults;

  if (hasRelationMarker && !forceRefresh && cached && isCacheFresh(cached)) {
    return {
      posts: cached.posts,
      error: null,
      stale: false,
      postsStored: 0,
      storageError: null,
    };
  }

  const activeFallback = stored ?? staleFallback ?? cached ?? null;
  const inFlight = X_POSTS_IN_FLIGHT.get(cacheKey);
  if (inFlight) {
    try {
      const entry = await inFlight;
      return {
        posts: entry.posts,
        error: null,
        stale: false,
        postsStored: entry.postsStored,
        storageError: entry.storageError,
      };
    } catch (error) {
      if (activeFallback) {
        return {
          posts: activeFallback.posts,
          ...describeXError(error),
          stale: true,
          postsStored: 0,
          storageError: null,
        };
      }
      throw error;
    }
  }

  const params = new URLSearchParams({
    max_results: String(collectionLimit),
    exclude: "retweets",
    "tweet.fields":
      "created_at,public_metrics,attachments,entities,referenced_tweets,conversation_id,in_reply_to_user_id",
    expansions: "attachments.media_keys",
    "media.fields": "url,preview_image_url,type,width,height,alt_text",
  });
  const sinceId =
    stored?.lastSeenPostId ??
    sortXPostsDesc(activeFallback?.posts ?? [])[0]?.id ??
    null;
  if (hasRelationMarker && sinceId) {
    params.set("since_id", sinceId);
  }

  const request = (async () => {
    const response = await requestXApi<XUserTimelineResponse>(
      `/users/${user.id}/tweets?${params}`,
      bearerToken,
      {
        cacheDb,
        operation: "timeline",
        usageTracker,
      },
    );
    const posts = await enrichNewXPostsWithLinkPreviews(
      normalizeXTimelineResponse(response, user.username),
      bearerToken,
      richXLinkPreviewEnabled,
      cacheDb,
      usageTracker,
    );
    const mergedPostsForStorage = (
      await enrichXPostsWithReferencedPosts(
        mergeXPosts(
          posts,
          stored?.posts ?? activeFallback?.posts ?? [],
        ),
        bearerToken,
        cacheDb,
        usageTracker,
      )
    ).slice(0, collectionLimit);
    const responsePosts = mergedPostsForStorage.slice(0, maxResults);
    const lastSeenPostId =
      sortXPostsDesc(posts)[0]?.id ??
      sinceId ??
      mergedPostsForStorage[0]?.id ??
      null;
    const entry = await setCachedPosts(
      handle,
      user,
      responsePosts,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
      lastSeenPostId,
      mergedPostsForStorage,
    );
    if (!hasRelationMarker && entry.storageError === null) {
      await writeCurrentRelationCollectionMarker(cacheDb, handle);
    }
    return entry;
  })();

  X_POSTS_IN_FLIGHT.set(cacheKey, request);

  try {
    const entry = await request;
    return {
      posts: entry.posts,
      error: null,
      stale: false,
      postsStored: entry.postsStored,
      storageError: entry.storageError,
    };
  } catch (error) {
    if (activeFallback) {
      return {
        posts: activeFallback.posts,
        ...describeXError(error),
        stale: true,
        postsStored: 0,
        storageError: null,
      };
    }
    throw error;
  } finally {
    X_POSTS_IN_FLIGHT.delete(cacheKey);
  }
};

const formatXError = (error: unknown) => {
  if (error instanceof XApiError) {
    if (error.code) return error.code;
    if (error.status === 429) return "rate_limited";
    if (error.status >= 500) return "x_api_unavailable";
    return `x_api_${error.status}`;
  }
  return "x_api_error";
};

const describeXError = (
  error: unknown,
): Pick<XHandlePostsResult, "error" | "errorStatus" | "errorDetail"> => {
  if (error instanceof XApiError) {
    return {
      error: formatXError(error),
      errorStatus: error.sourceStatus ?? error.status,
      errorDetail: error.detail ?? error.message,
    };
  }

  return {
    error: "x_api_error",
    errorStatus: null,
    errorDetail: error instanceof Error ? error.message : null,
  };
};

const isRecoverableExternalError = (error: string | null) =>
  Boolean(
    error &&
      error !== "user_not_found" &&
      error !== "protected_user" &&
      error !== "budget_exceeded",
  );

const getErrorDiagnostics = (byHandle: XHandlePostsResult[]) =>
  byHandle
    .filter((item) => isRecoverableExternalError(item.error))
    .map((item) => ({
      handle: item.handle,
      error: item.error,
      status: item.errorStatus ?? null,
      detail: item.errorDetail ?? null,
    }));

const buildResult = (byHandle: XHandlePostsResult[]) => {
  const hasOnlyExternalErrors =
    byHandle.length > 0 &&
    byHandle.every(
      (item) =>
        item.posts.length === 0 && isRecoverableExternalError(item.error),
    );

  if (hasOnlyExternalErrors) {
    const diagnostics = getErrorDiagnostics(byHandle);
    const first = diagnostics[0] ?? {
      error: "x_api_error",
      status: null,
      detail: null,
    };

    if (byHandle.every((item) => item.error === "missing_bearer_token")) {
      throw new XApiError("X bearer token not configured", 500, {
        code: "missing_bearer_token",
        detail: "X_BEARER_TOKEN is not configured for this worker.",
        diagnostics,
      });
    }
    if (byHandle.every((item) => item.error === "rate_limited")) {
      throw new XApiError("X API rate limit exceeded", 429, {
        code: "rate_limited",
        sourceStatus: first.status,
        detail: first.detail,
        diagnostics,
      });
    }

    const code = first.error ?? "x_api_error";
    throw new XApiError(
      first.detail
        ? `Failed to fetch X posts (${code}: ${first.detail})`
        : `Failed to fetch X posts (${code})`,
      502,
      {
        code,
        sourceStatus: first.status,
        detail: first.detail,
        diagnostics,
      },
    );
  }

  const posts = byHandle
    .flatMap((item) => item.posts)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return {
    posts,
    byHandle,
  };
};

export const fetchXPostsForHandles = async (
  handles: string[],
  options: FetchXPostsForHandlesOptions = {},
) => {
  const {
    bearerToken,
    cacheDb,
    maxResults = 10,
    richXLinkPreviewEnabled = false,
    forceRefresh = false,
    refresh = true,
    usageTracker,
    usageSource,
    forceRefreshPath,
  } = options;
  const normalizedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter(Boolean)),
  );
  const token = bearerToken?.trim();
  const resultByHandle = new Map<string, XHandlePostsResult>();
  const stalePostsByHandle = new Map<string, CachedXPostsEntry>();
  const handlesToRefresh: string[] = [];
  const activeUsageTracker = usageTracker ?? {
    apiCalls: 0,
    estimatedCostMicros: 0,
    reservedCostMicros: 0,
    source: usageSource ?? null,
    forceRefreshPath: forceRefresh ? forceRefreshPath ?? "unknown" : null,
  };
  if (usageTracker) {
    usageTracker.source ??= usageSource ?? null;
    usageTracker.forceRefreshPath ??= forceRefresh
      ? forceRefreshPath ?? "unknown"
      : null;
  }

  for (const handle of normalizedHandles) {
    const hasRelationMarker = await hasCurrentRelationCollectionMarker(
      cacheDb,
      handle,
    );
    const cached = await getCachedPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (
      hasRelationMarker &&
      !forceRefresh &&
      cached &&
      isCacheFresh(cached)
    ) {
      resultByHandle.set(handle, makeCachedPostsResult(handle, cached, false));
      continue;
    }

    if (cached && isCacheUsable(cached, X_POSTS_CACHE_POLICY.staleTtlMs)) {
      stalePostsByHandle.set(handle, cached);
    }

    const stored = await readStoredPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (
      hasRelationMarker &&
      !forceRefresh &&
      stored &&
      shouldUseFreshStoredPosts(stored)
    ) {
      resultByHandle.set(handle, makeCachedPostsResult(handle, stored, false));
      continue;
    }
    if (stored) {
      resultByHandle.set(handle, makeCachedPostsResult(handle, stored, true));
      stalePostsByHandle.set(handle, stored);
    }

    if (!refresh) {
      if (!resultByHandle.has(handle)) {
        resultByHandle.set(handle, {
          handle,
          userId: null,
          posts: [],
          error: null,
          stale: false,
        });
      }
      continue;
    }
    handlesToRefresh.push(handle);
  }

  if (!token) {
    for (const handle of handlesToRefresh) {
      const cached = stalePostsByHandle.get(handle);
      resultByHandle.set(
        handle,
        cached
          ? makeCachedPostsResult(handle, cached, true, {
              error: "missing_bearer_token",
              errorStatus: null,
              errorDetail: "X_BEARER_TOKEN is not configured for this worker.",
            })
          : {
              handle,
              userId: null,
              posts: [],
              error: "missing_bearer_token",
              errorStatus: null,
              errorDetail: "X_BEARER_TOKEN is not configured for this worker.",
              stale: false,
            },
      );
    }

    return buildResult(
      normalizedHandles.map((handle) => resultByHandle.get(handle)!),
    );
  }

  let usersByHandle: Map<string, XApiUser | null> | null = null;

  try {
    usersByHandle = await fetchXUsersByHandles(
      handlesToRefresh,
      token,
      cacheDb,
      activeUsageTracker,
    );
  } catch (error) {
    const errorInfo = describeXError(error);
    for (const handle of handlesToRefresh) {
      const cached = stalePostsByHandle.get(handle);
      resultByHandle.set(
        handle,
        cached
          ? makeCachedPostsResult(handle, cached, true, errorInfo)
          : {
              handle,
              userId: null,
              posts: [],
              ...errorInfo,
              stale: false,
            },
      );
    }
  }

  if (usersByHandle) {
    const fetchedResults = await pMap(
      handlesToRefresh,
      async (handle): Promise<XHandlePostsResult> => {
        const user = usersByHandle.get(handle) ?? null;
        if (!user) {
          return {
            handle,
            userId: null,
            posts: [],
            error: "user_not_found",
            stale: false,
          };
        }

        if (user.protected) {
          return {
            handle,
            userId: user.id,
            posts: [],
            error: "protected_user",
            stale: false,
          };
        }

        try {
          const {
            posts,
            error,
            errorStatus,
            errorDetail,
            stale,
            postsStored,
            storageError,
          } =
            await fetchXPostsForUser(
              handle,
              user,
              token,
              maxResults,
              richXLinkPreviewEnabled,
              cacheDb,
              stalePostsByHandle.get(handle),
              activeUsageTracker,
              forceRefresh,
            );
          return {
            handle,
            userId: user.id,
            posts,
            error,
            errorStatus,
            errorDetail,
            stale,
            postsStored,
            storageError,
          };
        } catch (error) {
          return {
            handle,
            userId: user.id,
            posts: [],
            ...describeXError(error),
            stale: false,
          };
        }
      },
      X_POSTS_BATCH_CONCURRENCY,
    );

    for (const item of fetchedResults) {
      resultByHandle.set(item.handle, item);
    }
  }

  return buildResult(
    normalizedHandles.map((handle) => resultByHandle.get(handle)!),
  );
};

const writeXCollectionRun = async (
  cacheDb: XCacheDb | undefined,
  data: {
    source: string;
    startedAt: number;
    finishedAt: number;
    checkedHandles: number;
    refreshedHandles: number;
    postsReturned: number;
    postsStored: number;
    apiCalls: number;
    estimatedCostMicros: number;
    status: "success" | "skipped" | "failed";
    error?: string | null;
  },
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_collection_runs (
           source, started_at, finished_at, checked_handles, refreshed_handles,
           posts_returned, posts_stored, api_calls, estimated_cost_micros,
           status, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        data.source,
        data.startedAt,
        data.finishedAt,
        data.checkedHandles,
        data.refreshedHandles,
        data.postsReturned,
        data.postsStored,
        data.apiCalls,
        data.estimatedCostMicros,
        data.status,
        data.error ?? null,
      )
      .run();
  } catch (error) {
    console.warn("Failed to write X collection run", error);
  }
};

const getCollectionFailureError = (byHandle: XHandlePostsResult[]) => {
  const storageError = byHandle.find((item) => item.storageError)?.storageError;
  if (storageError) return storageError;
  if (byHandle.some((item) => item.error === "budget_exceeded")) {
    return "budget_exceeded";
  }
  const refreshError = byHandle.find(
    (item) => item.error && !["user_not_found", "protected_user"].includes(item.error),
  )?.error;
  if (refreshError) return refreshError;
  if (byHandle.some((item) => item.stale)) {
    return "stale_fallback_used";
  }
  return null;
};

const getNewestStoredPostTime = (entry: StoredXPostsEntry) =>
  sortXPostsDesc(entry.posts)
    .map((post) => new Date(post.createdAt).getTime())
    .find((time) => Number.isFinite(time)) ?? null;

const getCollectionRefreshIntervalMs = (entry: StoredXPostsEntry) => {
  if (entry.lastError === "rate_limited") {
    return X_COLLECTION_RATE_LIMIT_BACKOFF_MS;
  }
  if (entry.lastError === "budget_exceeded") {
    return X_COLLECTION_DORMANT_CHECK_INTERVAL_MS;
  }
  if (isRecoverableExternalError(entry.lastError)) {
    return X_COLLECTION_ERROR_BACKOFF_MS;
  }

  const newestPostTime = getNewestStoredPostTime(entry);
  if (!newestPostTime) {
    return X_COLLECTION_DORMANT_CHECK_INTERVAL_MS;
  }

  const newestPostAgeMs = now() - newestPostTime;
  if (newestPostAgeMs >= 7 * 24 * 60 * 60_000) {
    return X_COLLECTION_DORMANT_CHECK_INTERVAL_MS;
  }
  if (newestPostAgeMs >= 24 * 60 * 60_000) {
    return X_COLLECTION_IDLE_CHECK_INTERVAL_MS;
  }
  return X_COLLECTION_ACTIVE_CHECK_INTERVAL_MS;
};

const shouldRefreshCollectionHandle = (entry: StoredXPostsEntry | null) => {
  if (!entry || entry.lastCheckedAt === null) return true;
  return now() - entry.lastCheckedAt >= getCollectionRefreshIntervalMs(entry);
};

const getXCollectionHandlesToRefresh = async (
  handles: string[],
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
) => {
  if (!cacheDb) return handles;

  const handlesToRefresh: string[] = [];
  for (const handle of handles) {
    const stored = await readStoredPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (shouldRefreshCollectionHandle(stored)) {
      handlesToRefresh.push(handle);
    }
  }
  return handlesToRefresh;
};

const writeXCollectionSourceErrors = async (
  cacheDb: XCacheDb | undefined,
  byHandle: XHandlePostsResult[],
) => {
  await Promise.all(
    byHandle
      .filter((item) => item.error)
      .map((item) => writeStoredPostSourceError(cacheDb, item.handle, item.error)),
  );
};

export const collectXPostsForHandles = async (
  handles: string[],
  options: CollectXPostsOptions = {},
) => {
  const {
    bearerToken,
    cacheDb,
    maxResults = X_COLLECTION_MAX_RESULTS,
    richXLinkPreviewEnabled = false,
    source = "scheduled",
  } = options;
  const startedAt = now();
  const normalizedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter(Boolean)),
  );
  const tracker: XApiUsageTracker = {
    apiCalls: 0,
    estimatedCostMicros: 0,
    reservedCostMicros: 0,
    source,
    forceRefreshPath: `collection:${source}`,
  };

  const enabled = (await readD1Setting(cacheDb, "x_collection_enabled")) !== "false";
  if (!enabled || normalizedHandles.length === 0) {
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: 0,
      estimatedCostMicros: 0,
      status: "skipped" as const,
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      ...result,
    });
    return result;
  }

  const token = bearerToken?.trim();
  if (!token) {
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: 0,
      estimatedCostMicros: 0,
      status: "failed" as const,
      error: "missing_bearer_token",
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      ...result,
    });
    return result;
  }

  try {
    // A manual run is an explicit operator recovery action. It must still obey
    // the global rate-limit backoff and daily budget in requestXApi, but it
    // must not be turned into a no-op by the adaptive scheduled cooldown.
    const handlesToRefresh = source === "manual"
      ? normalizedHandles
      : await getXCollectionHandlesToRefresh(
        normalizedHandles,
        maxResults,
        richXLinkPreviewEnabled,
        cacheDb,
      );

    if (handlesToRefresh.length === 0) {
      const result = {
        checkedHandles: normalizedHandles.length,
        refreshedHandles: 0,
        postsReturned: 0,
        postsStored: 0,
        apiCalls: 0,
        estimatedCostMicros: 0,
        status: "skipped" as const,
        error: "all_handles_cooldown",
      };
      await writeXCollectionRun(cacheDb, {
        source,
        startedAt,
        finishedAt: now(),
        ...result,
      });
      return result;
    }

    const content = await fetchXPostsForHandles(handlesToRefresh, {
      bearerToken: token,
      cacheDb,
      maxResults,
      richXLinkPreviewEnabled,
      forceRefresh: true,
      refresh: true,
      usageTracker: tracker,
    });
    await writeXCollectionSourceErrors(cacheDb, content.byHandle);
    const refreshedHandles = content.byHandle.filter(
      (item) => !item.error && !item.stale && !item.storageError,
    ).length;
    const postsStored = content.byHandle.reduce(
      (total, item) => total + (item.postsStored ?? 0),
      0,
    );
    const failureError = getCollectionFailureError(content.byHandle);
    const status = failureError === "budget_exceeded"
      ? ("skipped" as const)
      : failureError
        ? ("failed" as const)
        : ("success" as const);
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles,
      postsReturned: content.posts.length,
      postsStored,
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      status,
      ...(failureError ? { error: failureError } : {}),
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      ...result,
    });
    return result;
  } catch (error) {
    if (error instanceof XApiError) {
      await Promise.all(
        error.diagnostics.flatMap((item) =>
          item.handle && item.error
            ? [writeStoredPostSourceError(cacheDb, item.handle, item.error)]
            : [],
        ),
      );
    }
    const failureError = formatXError(error);
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      status: failureError === "budget_exceeded"
        ? ("skipped" as const)
        : ("failed" as const),
      error: failureError,
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      ...result,
    });
    return result;
  }
};

export const clearXServiceCachesForTests = () => {
  X_USER_CACHE.clear();
  X_POSTS_CACHE.clear();
  X_POSTS_IN_FLIGHT.clear();
  clearLinkPreviewCacheForTests();
};
