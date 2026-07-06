import { pMap } from "../utils/helpers";
import type {
  XLinkedPostPreviewItem,
  XPostItem,
  XPostLinkItem,
  XPostMediaItem,
} from "../types";
import {
  clearLinkPreviewCacheForTests,
  enrichLinksWithPreviews,
} from "./link-preview";

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
};

type XApiUsageOperation = "user_lookup" | "timeline" | "tweet_lookup";

type XApiUsageTracker = {
  apiCalls: number;
  estimatedCostMicros: number;
  reservedCostMicros: number;
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
const X_USER_LOOKUP_TTL_MS = 30 * 24 * 60 * 60_000;
const X_USER_NOT_FOUND_TTL_MS = 24 * 60 * 60_000;
const X_USER_LOOKUP_STALE_TTL_MS = 90 * 24 * 60 * 60_000;
const X_POSTS_TTL_MS = 60 * 60_000;
const X_POSTS_STALE_TTL_MS = 24 * 60 * 60_000;
const X_LINKED_POST_LOOKUP_TTL_MS = 7 * 24 * 60 * 60_000;
const X_POSTS_CACHE_VERSION = "v3";
const X_POSTS_BATCH_CONCURRENCY = 4;
const X_ERROR_DETAIL_MAX_LENGTH = 900;
const X_LINKED_POST_PREVIEW_MAX_IDS = 10;
const X_STORED_POSTS_RETAIN_LIMIT = 20;
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
  `x:posts:${X_POSTS_CACHE_VERSION}:${normalizeHandle(
    handle,
  )}:${maxResults}:${richXLinkPreviewEnabled ? "rich" : "plain"}`;

const getLinkedPostCacheKey = (id: string) => `x:linked-post:v1:${id}`;

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

const reserveXApiBudget = async (
  cacheDb: XCacheDb | undefined,
  estimatedCostMicros: number,
  usageTracker?: XApiUsageTracker,
) => {
  if (!cacheDb) return () => {};

  const usedMicros = await readDailyUsageMicros(cacheDb);
  if (usedMicros === null) return () => {};

  const budgetMicros = await readDailyBudgetMicros(cacheDb);
  const reservedMicros = usageTracker?.reservedCostMicros ?? 0;
  if (usedMicros + reservedMicros + estimatedCostMicros > budgetMicros) {
    throw new XApiError("X API daily budget exhausted", 429, {
      code: "budget_exceeded",
      detail: "X API daily budget has been exhausted for this UTC day.",
    });
  }

  if (!usageTracker || estimatedCostMicros <= 0) return () => {};

  usageTracker.reservedCostMicros += estimatedCostMicros;
  return () => {
    usageTracker.reservedCostMicros = Math.max(
      0,
      usageTracker.reservedCostMicros - estimatedCostMicros,
    );
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
) => {
  if (!cacheDb) return;

  const estimate = response
    ? estimateXApiUsage(operation, response)
    : {
        postCount: 0,
        userCount: 0,
        mediaCount: 0,
        resourceCount: 0,
        estimatedCostMicros: 0,
      };
  if (usageTracker) {
    usageTracker.apiCalls += 1;
    usageTracker.estimatedCostMicros += estimate.estimatedCostMicros;
  }

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
        }),
      )
      .run();
  } catch (error) {
    console.warn("Failed to write X API usage event", error);
  }
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
  let releaseBudgetReservation = () => {};
  if (options.operation) {
    await assertXApiNotBackedOff(options.cacheDb);
    releaseBudgetReservation = await reserveXApiBudget(
      options.cacheDb,
      estimateXApiRequestCostMicros(options.operation, path),
      options.usageTracker,
    );
  }

  try {
    const response = await fetch(`${X_API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        await writeXApiBackoff(options.cacheDb, response);
      }
      if (options.operation) {
        await writeXApiUsageEvent(
          options.cacheDb,
          options.operation,
          path,
          response.status,
          null,
          options.usageTracker,
        );
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
      await writeXApiUsageEvent(
        options.cacheDb,
        options.operation,
        path,
        response.status,
        data as XApiResponseWithResources,
        options.usageTracker,
      );
    }

    return data;
  } finally {
    releaseBudgetReservation();
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
  type: "user" | "posts" | "linked_post",
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

const parseStoredXPost = (row: XStoredPostRow): XPostItem | null => {
  try {
    return JSON.parse(row.value) as XPostItem;
  } catch (error) {
    console.warn("Failed to parse stored X post", { id: row.id, error });
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
  entry.lastCheckedAt !== null && now() - entry.lastCheckedAt < X_POSTS_TTL_MS;

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
      expiresAt: fetchedAt + X_POSTS_TTL_MS,
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
  let count = 0;
  try {
    for (const post of posts) {
      await cacheDb
        .prepare(
          `INSERT INTO x_posts (id, handle, user_id, username, value, created_at, fetched_at, hidden_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(id) DO UPDATE SET
             handle = excluded.handle,
             user_id = excluded.user_id,
             username = excluded.username,
             value = excluded.value,
             created_at = excluded.created_at,
             fetched_at = excluded.fetched_at,
             hidden_at = NULL`,
        )
        .bind(
          post.id,
          normalizedHandle,
          user.id,
          post.username,
          JSON.stringify(post),
          post.createdAt,
          fetchedAt,
        )
        .run();
      count += 1;
    }
    await trimStoredPosts(cacheDb, normalizedHandle, X_STORED_POSTS_RETAIN_LIMIT);
    return { ok: true, count, error: null };
  } catch (error) {
    console.warn("Failed to write stored X posts", error);
    return {
      ok: false,
      count,
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
        `UPDATE x_post_sources
         SET last_checked_at = ?, updated_at = ?, last_error = ?
         WHERE handle = ?`,
      )
      .bind(checkedAt, checkedAt, lastError, normalizeHandle(handle))
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
    X_USER_LOOKUP_STALE_TTL_MS,
  );
  if (!persisted) {
    return cached && isCacheUsable(cached, X_USER_LOOKUP_STALE_TTL_MS)
      ? cached
      : null;
  }
  if (
    cached &&
    cached.fetchedAt > persisted.fetchedAt &&
    isCacheUsable(cached, X_USER_LOOKUP_STALE_TTL_MS)
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
  const ttlMs = user ? X_USER_LOOKUP_TTL_MS : X_USER_NOT_FOUND_TTL_MS;
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
    X_POSTS_STALE_TTL_MS,
  );
  if (!persisted) {
    return cached && isCacheUsable(cached, X_POSTS_STALE_TTL_MS)
      ? cached
      : null;
  }
  if (
    cached &&
    cached.fetchedAt > persisted.fetchedAt &&
    isCacheUsable(cached, X_POSTS_STALE_TTL_MS)
  ) {
    return cached;
  }

  const entry = {
    fetchedAt: persisted.fetchedAt,
    expiresAt: persisted.expiresAt,
    userId: persisted.value.userId,
    posts: persisted.value.posts,
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
): Promise<CachedXPostsWriteEntry> => {
  const fetchedAt = now();
  const entry = {
    fetchedAt,
    expiresAt: fetchedAt + X_POSTS_TTL_MS,
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
    X_POSTS_TTL_MS,
  );
  const storedPostsWrite = await writeStoredPosts(
    cacheDb,
    handle,
    user,
    posts,
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
): XHandlePostsResult => ({
  handle,
  userId: cached.userId,
  posts: cached.posts,
  error: null,
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

    return {
      id: post.id,
      text: post.text ?? "",
      createdAt: post.created_at ?? new Date(0).toISOString(),
      url: buildXPostUrl(username, post.id),
      username,
      metrics: normalizeXMetrics(post.public_metrics),
      media,
      links,
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

const collectLinkedXStatusIds = (posts: XPostItem[]) => {
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const post of posts) {
    for (const link of post.links ?? []) {
      if (ids.length >= X_LINKED_POST_PREVIEW_MAX_IDS) return ids;

      const id = extractLinkedXStatusId(link, post.id);
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
): Promise<Map<string, XLinkedPostPreviewItem>> => {
  const requestedIds = Array.from(new Set(ids.filter(Boolean))).slice(
    0,
    X_LINKED_POST_PREVIEW_MAX_IDS,
  );
  if (requestedIds.length === 0) return new Map();

  const result = new Map<string, XLinkedPostPreviewItem>();
  const idsToFetch: string[] = [];

  for (const id of requestedIds) {
    const cached = await readD1Cache<XLinkedPostCacheValue>(
      cacheDb,
      getLinkedPostCacheKey(id),
      X_LINKED_POST_LOOKUP_TTL_MS,
    );
    if (cached) {
      if (cached.value.post) {
        result.set(id, cached.value.post);
      }
      continue;
    }
    idsToFetch.push(id);
  }

  if (idsToFetch.length === 0) return result;

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
        X_LINKED_POST_LOOKUP_TTL_MS,
      );
    } else {
      await writeD1Cache<XLinkedPostCacheValue>(
        cacheDb,
        getLinkedPostCacheKey(post.id),
        "linked_post",
        { post: null },
        now(),
        X_LINKED_POST_LOOKUP_TTL_MS,
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
      X_LINKED_POST_LOOKUP_TTL_MS,
    );
  }

  return result;
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

const enrichXPostsWithPreviews = async (
  posts: XPostItem[],
  bearerToken: string,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
  usageTracker?: XApiUsageTracker,
) => {
  const postsWithLinkPreviews = await enrichXPostsWithLinkPreviews(posts);
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
  stale: boolean;
  postsStored: number;
  storageError: string | null;
}> => {
  const stored = await readStoredPosts(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
    cacheDb,
  );
  if (!forceRefresh && stored && shouldUseFreshStoredPosts(stored)) {
    return {
      posts: stored.posts,
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

  if (!forceRefresh && cached && isCacheFresh(cached)) {
    return {
      posts: cached.posts,
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
        stale: false,
        postsStored: entry.postsStored,
        storageError: entry.storageError,
      };
    } catch (error) {
      if (activeFallback) {
        return {
          posts: activeFallback.posts,
          stale: true,
          postsStored: 0,
          storageError: null,
        };
      }
      throw error;
    }
  }

  const params = new URLSearchParams({
    max_results: String(maxResults),
    exclude: "retweets,replies",
    "tweet.fields": "created_at,public_metrics,attachments,entities",
    expansions: "attachments.media_keys",
    "media.fields": "url,preview_image_url,type,width,height,alt_text",
  });
  const sinceId =
    stored?.lastSeenPostId ??
    sortXPostsDesc(activeFallback?.posts ?? [])[0]?.id ??
    null;
  if (sinceId) {
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
    const posts = await enrichXPostsWithPreviews(
      normalizeXTimelineResponse(response, user.username),
      bearerToken,
      richXLinkPreviewEnabled,
      cacheDb,
      usageTracker,
    );
    const mergedPosts = mergeXPosts(
      posts,
      stored?.posts ?? activeFallback?.posts ?? [],
    ).slice(0, maxResults);
    const lastSeenPostId =
      sortXPostsDesc(posts)[0]?.id ?? sinceId ?? mergedPosts[0]?.id ?? null;
    return setCachedPosts(
      handle,
      user,
      mergedPosts,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
      lastSeenPostId,
    );
  })();

  X_POSTS_IN_FLIGHT.set(cacheKey, request);

  try {
    const entry = await request;
    return {
      posts: entry.posts,
      stale: false,
      postsStored: entry.postsStored,
      storageError: entry.storageError,
    };
  } catch (error) {
    if (activeFallback) {
      return {
        posts: activeFallback.posts,
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
  };

  for (const handle of normalizedHandles) {
    const cached = await getCachedPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (!forceRefresh && cached && isCacheFresh(cached)) {
      resultByHandle.set(handle, makeCachedPostsResult(handle, cached, false));
      continue;
    }

    if (cached && isCacheUsable(cached, X_POSTS_STALE_TTL_MS)) {
      stalePostsByHandle.set(handle, cached);
    }

    const stored = await readStoredPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (!forceRefresh && stored && shouldUseFreshStoredPosts(stored)) {
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
          ? makeCachedPostsResult(handle, cached, true)
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
          ? makeCachedPostsResult(handle, cached, true)
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
          const { posts, stale, postsStored, storageError } =
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
            error: null,
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
    const handlesToRefresh = await getXCollectionHandlesToRefresh(
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
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles,
      postsReturned: content.posts.length,
      postsStored,
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      status: failureError ? ("failed" as const) : ("success" as const),
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
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      status: "failed" as const,
      error: error instanceof Error ? error.message : "unknown_error",
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
