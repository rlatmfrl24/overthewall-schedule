import { officialXPostContext, type XPostWriteContext } from "../domain/merge-x-post";
import type { SiteId } from "@contracts/site-definition";
import type { XApiGateway, XApiGatewayRequest } from "@contracts/x-activity";
import type { XCollectionScope, XNewlyStoredPost } from "@contracts/x-collection";
import { collectionCadenceAnchor } from "../../../platform/collection-cadence";
import { publicationHiddenSql } from "../../content-access";
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
import { filterArchivedXReferences, readStoredXPreview } from "./x-reference-store";
import { commitStoredPosts } from "./x-post-writer";
import { prepareXReferenceRedaction } from "./x-reference-redaction";
import { fxRssWriteFenceSql, type FxRssWriteFence } from "./fx-rss-write-fence";
import { reserveXReferenceBudget, XReferenceBudgetError } from "./x-reference-budget";
import { readXTimelineGapBoundary, isXTimelineGapPayload, readXTimelineGapBatch, writeXTimelineGapCheckpoint, xTimelineGapRequestId, xTimelineTokenFingerprint, X_TIMELINE_GAP_BATCH_SIZE, X_TIMELINE_GAP_MAX_PAGES, type XTimelineGapCheckpoint } from "./x-timeline-gaps";
import { hasXCollectionD1Room } from "./rss-d1-budget";

export type XApiUser = {
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
  note_tweet?: { text?: string; entities?: XTimelinePost["entities"] };
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
  meta?: { next_token?: string; result_count?: number };
  errors?: unknown[];
};

type XTweetLookupPost = XTimelinePost & {
  author_id?: string;
};

export type XTweetLookupResponse = {
  data?: XTweetLookupPost[];
  includes?: {
    users?: XApiUser[];
    media?: XTimelineMedia[];
  };
  errors?: Array<{ resource_id?: string; value?: string; type?: string; resource_type?: string }>;
};

type XCacheDb = Pick<D1Database, "prepare"> & { batch?: (statements: D1PreparedStatement[]) => Promise<D1Result<unknown>[]> };

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
  cadenceAnchorAt: number | null;
  lastSeenPostId: string | null;
  lastError: string | null;
  collectionStartedAt: number | null;
  initializationCompletedAt: number | null;
  syncPaginationToken: string | null;
  syncBasePostId: string | null;
  syncNewestPostId: string | null;
};

type StoredXPostsWriteResult = {
  ok: boolean;
  count: number;
  insertedIds: string[];
  error: string | null;
};

type CachedXPostsWriteEntry = CachedXPostsEntry & {
  postsStored: number;
  newlyStoredPosts?: XNewlyStoredPost[];
  storageError: string | null;
  providerError?: ReturnType<typeof describeXError>;
};

type XStoredPostRow = {
  source_authority?: string | null;
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
  fx_last_success_at?: number | null;
  handle: string;
  user_id: string | null;
  username: string | null;
  last_seen_post_id: string | null;
  last_checked_at: number | string;
  last_success_at?: number | string | null;
  cadence_anchor_at?: number | string | null;
  updated_at: number | string;
  last_error: string | null;
  collection_started_at: number | string | null;
  initialization_completed_at: number | string | null;
  sync_pagination_token: string | null;
  sync_base_post_id: string | null;
  sync_newest_post_id: string | null;
};

type XUserCacheValue = {
  user: XApiUser | null;
};

type XPostsCacheValue = {
  userId: string | null;
  posts: XPostItem[];
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
  newlyStoredPosts?: XNewlyStoredPost[];
  storageError?: string | null;
};

type FetchXPostsForHandlesOptions = {
  gateway?: XApiGateway;
  scheduledFor?: number | null;
  siteId?: SiteId;
  storedPage?: import("@contracts/member-posts").MemberPostsPageRequest;
  bearerToken?: string | null;
  maxResults?: number;
  cacheDb?: XCacheDb;
  richXLinkPreviewEnabled?: boolean;
  forceRefresh?: boolean;
  refresh?: boolean;
  usageTracker?: XApiUsageTracker;
  continuationMaxResults?: number;
  effectiveIntervalMinutes?: number;
};

type XApiUsageOperation = "user_lookup" | "timeline" | "tweet_lookup";

export type XApiUsageTracker = {
  officialSyncOriginScope?: XCollectionScope;
  officialSyncLeaseToken?: string;
  gateway?: XApiGateway;
  recoveryAnchorAt?: number;
  apiCalls: number;
  estimatedCostMicros: number;
  reservedCostMicros: number;
  uniqueResources: number;
  previewDeferred: number;
  authorCacheHits: number;
  authorCacheMisses: number;
  source?: string | null;
  forceRefreshPath?: string | null;
  purpose?: "collection" | "reference_preview";
  gapSweep?: "pending" | "complete";
  gapProgress?: boolean;
  timelineReplay?: NonNullable<XTimelineGapCheckpoint["request"]>;
};

type CollectXPostsOptions = {
  timelineReplay?: XApiUsageTracker["timelineReplay"];
  officialSyncOriginScope?: XCollectionScope;
  officialSyncLeaseToken?: string;
  scheduledEligibilityConfirmed?: boolean;
  gateway?: XApiGateway;
  recoveryAnchorAt?: number;
  scheduledFor?: number | null;
  siteId?: SiteId;
  bearerToken?: string | null;
  maxResults?: number;
  cacheDb?: XCacheDb;
  richXLinkPreviewEnabled?: boolean;
  source?: string;
  optimizerEnabled?: boolean;
  effectiveIntervalMinutes?: number;
  coalescedHandles?: number;
  afterTimeline?: (tracker: XApiUsageTracker) => Promise<import("@contracts/x-posts").XReferenceHydrationResultDto | undefined>;
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
  retryGatewayRequest: boolean;
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
      retryGatewayRequest?: boolean;
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
    this.retryGatewayRequest = options.retryGatewayRequest ?? false;
    this.diagnostics = options.diagnostics ?? [];
  }
}

const X_API_BASE_URL = "https://api.x.com/2";
const X_API_BACKOFF_UNTIL_SETTING_KEY = "x_api_backoff_until";
const X_USER_LOOKUP_CACHE_POLICY = WORKER_CACHE_POLICY.x.userLookup;
const X_POSTS_CACHE_POLICY = WORKER_CACHE_POLICY.x.posts;
const X_POSTS_BATCH_CONCURRENCY = 4;
const X_ERROR_DETAIL_MAX_LENGTH = 900;
const X_COLLECTION_MAX_RESULTS = 25;
const X_COLLECTION_ACTIVE_CHECK_INTERVAL_MS = 2 * 60 * 60_000;
const X_COLLECTION_IDLE_CHECK_INTERVAL_MS = 12 * 60 * 60_000;
const X_COLLECTION_DORMANT_CHECK_INTERVAL_MS = 24 * 60 * 60_000;
const X_COLLECTION_ERROR_BACKOFF_MS = 6 * 60 * 60_000;
const X_COLLECTION_CONTINUATION_CHECK_INTERVAL_MS = 15 * 60_000;
const X_COLLECTION_RATE_LIMIT_BACKOFF_MS = 60 * 60_000;
const X_DAILY_BUDGET_CENTS_DEFAULT = 100;
const X_POST_READ_COST_MICROS = 5_000;
const X_USER_READ_COST_MICROS = 10_000;
const X_MEDIA_READ_COST_MICROS = 5_000;

const X_USER_CACHE = new Map<string, CachedXUser>();
const X_POSTS_CACHE = new Map<string, CachedXPostsEntry>();
const X_POSTS_IN_FLIGHT = new Map<string, Promise<CachedXPostsWriteEntry>>();
export const invalidateXPostMemoryCache = () => X_POSTS_CACHE.clear();

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
    throw new XApiError("X backoff persistence failed", 503, { code: "budget_unavailable" });
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

export const normalizeDailyBudgetMicros = (value: string | null | undefined) => {
  const cents = Number.parseInt(value ?? "", 10);
  const safeCents =
    Number.isFinite(cents) && cents > 0 ? cents : X_DAILY_BUDGET_CENTS_DEFAULT;
  return Math.min(100, safeCents) * 10_000;
};

export const readDailyBudgetMicros = async (cacheDb: XCacheDb | undefined) => {
  const value = cacheDb ? (await cacheDb.prepare("SELECT value FROM settings WHERE key = ?")
    .bind("x_collection_daily_budget_cents").first<{ value: string | null }>())?.value : null;
  return normalizeDailyBudgetMicros(value);
};

export async function readSiteXBudget(db: XCacheDb) {
  const day = new Date(now()).toISOString().slice(0,10);
  const row = await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'").bind(day).first<{ used: number; reserved: number }>();
  const start = Date.parse(`${day}T00:00:00Z`);
  const total = row ? row.used : await db.prepare("SELECT COALESCE(SUM(estimated_cost_micros),0) AS used FROM x_api_usage_events WHERE created_at>=? AND created_at<?").bind(start,start+86_400_000).first<number>("used");
  return { day, used: Number(total ?? 0), reserved: Number(row?.reserved ?? 0) };
}

const readXApiBackoffUntil = async (cacheDb: XCacheDb | undefined) => {
  const value = cacheDb ? (await cacheDb.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(X_API_BACKOFF_UNTIL_SETTING_KEY).first<{ value: string | null }>())?.value : null;
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

const getCommaSeparatedParams = (path: string, key: string) => {
  const query = path.split("?")[1] ?? "";
  const value = new URLSearchParams(query).get(key);
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
};

export const estimateXApiRequestCostMicros = (
  operation: XApiUsageOperation,
  path: string,
) => {
  if (operation === "user_lookup") {
    return Math.max(
      getCommaSeparatedParamCount(path, "usernames"),
      getCommaSeparatedParamCount(path, "ids"),
    ) * X_USER_READ_COST_MICROS;
  }

  if (operation === "tweet_lookup") {
    const idCount = getCommaSeparatedParamCount(path, "ids");
    const expansions = getCommaSeparatedParams(path, "expansions");
    const includesUsers = expansions.some((value) =>
      value === "author_id" ||
      value === "entities.mentions.username" ||
      value.endsWith(".author_id") ||
      value.endsWith("_user_id")
    );
    const includesMedia = expansions.includes("attachments.media_keys");
    return (
      idCount * X_POST_READ_COST_MICROS +
      (includesUsers ? idCount * X_USER_READ_COST_MICROS : 0) +
      (includesMedia ? idCount * X_MEDIA_READ_COST_MICROS : 0)
    );
  }

  const maxResults = getPositiveIntegerParam(
    path,
    "max_results",
    X_COLLECTION_MAX_RESULTS,
  );
  return maxResults * (X_POST_READ_COST_MICROS + X_MEDIA_READ_COST_MICROS);
};

export const estimateXSharedApiReservationMicros = (operation: XApiGatewayRequest["operation"], path: string, requestedEstimate = 0) => {
  const query = new URLSearchParams(path.split("?")[1]);
  const ids = query.get("ids")?.split(",").filter(Boolean).length ?? 0;
  const count = operation === "timeline" ? Number(query.get("max_results") ?? 25) : ids;
  const mediaReserve = query.get("expansions")?.split(",").includes("attachments.media_keys") ? count * 15_000 : 0;
  return Math.max(estimateXApiRequestCostMicros(operation,path) + mediaReserve, requestedEstimate);
};

export const getXTimelinePageSize = (requested: number, remainingMicros: number, siteRemainingMicros: number) => {
  const path = "/users/1/tweets?max_results=1&expansions=attachments.media_keys";
  return Math.min(requested, Math.max(5, Math.min(
    Math.floor(remainingMicros / estimateXSharedApiReservationMicros("timeline",path)),
    Math.floor(siteRemainingMicros / estimateXApiRequestCostMicros("timeline",path)))));
};

type XApiBudgetSettlement = (actualUsedMicros?: number) => Promise<void>;
const noopXApiBudgetSettlement: XApiBudgetSettlement = async () => {};
type XApiAdmissionFence = { fence: FxRssWriteFence; siteId: SiteId };

const reserveXApiBudget = async (
  cacheDb: XCacheDb | undefined,
  estimatedCostMicros: number,
  usageTracker?: XApiUsageTracker,
  admissionFence?: XApiAdmissionFence,
  combineAdmission = false,
) => {
  if (!cacheDb || estimatedCostMicros <= 0) {
    if (admissionFence) throw new XApiError("RSS site admission unavailable", 503, { code: "budget_unavailable" });
    if (!cacheDb) return noopXApiBudgetSettlement;
  }

  let usedMicros: number | null, budgetMicros: number;
  if (admissionFence || combineAdmission) {
    const [usage, settings] = await cacheDb.batch!([
      cacheDb.prepare("SELECT COALESCE(SUM(estimated_cost_micros),0) total FROM x_api_usage_events WHERE created_at>=?").bind(startOfUtcDay()),
      cacheDb.prepare("SELECT key,value FROM settings WHERE key IN ('x_collection_daily_budget_cents','x_api_backoff_until')"),
    ]);
    const values = new Map((settings.results as {key:string;value:string}[]).map(row=>[row.key,row.value]));
    const backoff = Number.parseInt(values.get("x_api_backoff_until") ?? "0",10);
    if (backoff > now()) throw new XApiError("X API is temporarily paused after rate limiting",429,{code:"rate_limited",sourceStatus:429,detail:`X API calls are paused until ${new Date(backoff).toISOString()}.`});
    budgetMicros = normalizeDailyBudgetMicros(values.get("x_collection_daily_budget_cents"));
    usedMicros = Number((usage.results[0] as {total:number} | undefined)?.total ?? 0);
  } else {
    usedMicros = await readDailyUsageMicros(cacheDb);
    budgetMicros = await readDailyBudgetMicros(cacheDb);
  }
  if (usedMicros === null) throw new XApiError("X budget storage unavailable", 503, { code: "budget_unavailable" });
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
  const fence = fxRssWriteFenceSql(admissionFence?.fence, admissionFence?.siteId ?? "otw");
  let ledgerReserved = false;
  try {
    const reservation = await cacheDb.prepare(
      `INSERT INTO scheduled_usage_daily (
         day, lane, resource, reserved, used, limit_value, updated_at
       ) SELECT ?, 'all', 'x_api_cost_micros', ?, ?, ?, ? WHERE (${fence.sql})
       ON CONFLICT(day, lane, resource) DO UPDATE SET
         reserved = scheduled_usage_daily.reserved + excluded.reserved,
         limit_value = excluded.limit_value,
         updated_at = excluded.updated_at
       WHERE scheduled_usage_daily.used +
               scheduled_usage_daily.reserved + excluded.reserved
             <= excluded.limit_value AND (${fence.sql})
       RETURNING reserved`,
    ).bind(
      day,
      estimatedCostMicros,
      usedMicros,
      budgetMicros,
      timestamp,
      ...fence.bindings,
      ...fence.bindings,
    ).first<{ reserved: number | string }>();
    if (!reservation) {
      if (admissionFence) throw new XApiError("RSS site admission denied", 503, { code: "rss_admission_denied" });
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
      throw new XApiError("X budget reservation unavailable", 503, { code: "budget_unavailable" });
    } else {
      ledgerReserved = true;
    }
  } catch (error) {
    if (error instanceof XApiError) throw error;
    console.warn("Failed to atomically reserve X API budget", error);
    throw new XApiError("X budget reservation failed", 503, { code: "budget_unavailable" });
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
      throw new XApiError("X budget settlement unavailable", 503, { code: "budget_unavailable" });
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

const getXResourceId = (value: unknown, key: "id" | "media_key") => {
  if (!value || typeof value !== "object") return null;
  const id = (value as Record<string, unknown>)[key];
  return typeof id === "string" && id ? id : null;
};

const recordDailyXApiResources = async (
  cacheDb: XCacheDb,
  operation: XApiUsageOperation,
  response: XApiResponseWithResources,
  timestamp: number,
) => {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const resources: Array<{
    type: "post" | "user" | "media";
    id: string;
    listed: number;
    conservative: number;
  }> = [];
  for (const item of response.data ?? []) {
    const id = getXResourceId(item, "id");
    if (!id) continue;
    resources.push(operation === "user_lookup"
      ? { type: "user", id, listed: X_USER_READ_COST_MICROS, conservative: X_USER_READ_COST_MICROS }
      : { type: "post", id, listed: X_POST_READ_COST_MICROS, conservative: X_POST_READ_COST_MICROS });
  }
  for (const item of response.includes?.users ?? []) {
    const id = getXResourceId(item, "id");
    if (id) resources.push({ type: "user", id, listed: X_USER_READ_COST_MICROS, conservative: X_USER_READ_COST_MICROS });
  }
  for (const item of response.includes?.media ?? []) {
    const id = getXResourceId(item, "media_key");
    if (id) resources.push({ type: "media", id, listed: 0, conservative: X_MEDIA_READ_COST_MICROS });
  }

  let uniqueCount = 0;
  let listedCostMicros = 0;
  let conservativeCostMicros = 0;
  const statements = resources.map(resource => cacheDb.prepare(
      `INSERT OR IGNORE INTO x_api_resource_daily (
         utc_day, resource_type, resource_id, first_operation,
         first_seen_at, unit_cost_micros
       ) VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(day, resource.type, resource.id, operation, timestamp, resource.conservative));
  const insertedResources = statements.length ? await cacheDb.batch!(statements) : [];
  for (const [index, resource] of resources.entries()) {
    const inserted = insertedResources[index];
    if (Number(inserted.meta?.changes ?? 0) <= 0) continue;
    uniqueCount += 1;
    listedCostMicros += resource.listed;
    conservativeCostMicros += resource.conservative;
  }
  const aggregate = cacheDb.prepare(
    `INSERT INTO x_api_usage_daily (
       utc_day, operation, resource_type, request_count, resource_count,
       unique_resource_count, listed_cost_micros,
       conservative_cost_micros, updated_at
     ) VALUES (?, ?, 'mixed', 1, ?, ?, ?, ?, ?)
     ON CONFLICT(utc_day, operation, resource_type) DO UPDATE SET
       request_count = x_api_usage_daily.request_count + 1,
       resource_count = x_api_usage_daily.resource_count + excluded.resource_count,
       unique_resource_count = x_api_usage_daily.unique_resource_count + excluded.unique_resource_count,
       listed_cost_micros = x_api_usage_daily.listed_cost_micros + excluded.listed_cost_micros,
       conservative_cost_micros = x_api_usage_daily.conservative_cost_micros + excluded.conservative_cost_micros,
       updated_at = excluded.updated_at`,
  ).bind(day, operation, resources.length, uniqueCount, listedCostMicros, conservativeCostMicros, timestamp);
  return { conservativeCostMicros, uniqueCount, aggregate };
};

const writeXApiUsageEvent = async (
  cacheDb: XCacheDb | undefined,
  operation: XApiUsageOperation,
  endpoint: string,
  status: number,
  response: XApiResponseWithResources | null,
  usageTracker?: XApiUsageTracker,
  unmeasuredCostMicros = 0,
  costOverrideMicros?: number,
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
  if (costOverrideMicros !== undefined) estimate.estimatedCostMicros = Math.max(0, Math.trunc(costOverrideMicros));
  if (usageTracker) {
    usageTracker.apiCalls += 1;
    usageTracker.estimatedCostMicros += estimate.estimatedCostMicros;
  }

  if (!cacheDb) return estimate.estimatedCostMicros;

  try {
    const statements: D1PreparedStatement[] = [];
    if (response) {
      const recorded = await recordDailyXApiResources(cacheDb, operation, response, now());
      if (usageTracker) usageTracker.uniqueResources += recorded.uniqueCount;
      statements.push(recorded.aggregate);
    }
    statements.push(cacheDb
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
          purpose: usageTracker?.purpose ?? null,
          forceRefreshPath: usageTracker?.forceRefreshPath ?? null,
          costBasis: response
            ? "measured_resources"
            : estimate.estimatedCostMicros > 0
              ? "conservative_request_estimate"
              : "no_measurable_resources",
        }),
      ));
    await cacheDb.batch!(statements);
  } catch (error) {
    console.warn("Failed to write X API usage event", error);
    throw new XApiError("X usage recording failed", 503, { code: "budget_unavailable" });
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

export const requestXApi = async <T>(
  path: string,
  bearerToken: string,
  options: {
    cacheDb?: XCacheDb;
    operation?: XApiUsageOperation;
    usageTracker?: XApiUsageTracker;
    estimatedCostMicros?: number;
    gateway?: XApiGateway;
    requestId?: string;
    backoffDb?: XCacheDb;
    admissionFence?: XApiAdmissionFence;
    combineAdmission?: boolean;
  } = {},
): Promise<T> => {
  let settleBudgetReservation: XApiBudgetSettlement = noopXApiBudgetSettlement;
  let actualUsedMicros = 0;
  let reservedCostMicros = 0;
  let requestDispatched = false;
  let responseStatus = 0;
  let usageRecorded = false;
  try {
  if (options.admissionFence && (!options.admissionFence.fence || !["otw", "luvdia"].includes(options.admissionFence.siteId) ||
    !options.cacheDb || !options.operation || options.usageTracker?.purpose === "reference_preview")) {
    throw new XApiError("RSS site admission unavailable", 503, { code: "budget_unavailable" });
  }
  if (options.operation) {
    const combineAdmission = Boolean(options.combineAdmission && options.cacheDb?.batch);
    if (!options.admissionFence && !combineAdmission) await assertXApiNotBackedOff(options.backoffDb ?? options.cacheDb);
    reservedCostMicros = options.estimatedCostMicros ?? estimateXApiRequestCostMicros(
      options.operation,
      path,
    );
    settleBudgetReservation = options.usageTracker?.purpose === "reference_preview" && options.cacheDb
      ? await reserveXReferenceBudget(options.cacheDb, reservedCostMicros)
      : await reserveXApiBudget(
      options.cacheDb,
      reservedCostMicros,
      options.usageTracker,
      options.admissionFence,
      combineAdmission,
    );
  }
  } catch (error) {
    if (error instanceof XApiError || error instanceof XReferenceBudgetError) throw error;
    throw new XApiError("X admission storage unavailable", 503, { code: "budget_unavailable" });
  }

  try {
    const gateway = options.gateway ?? options.usageTracker?.gateway;
    if (gateway && options.operation) {
      const result = await gateway.execute({ id: options.requestId ?? crypto.randomUUID(), path,
        operation: options.operation, estimatedCostMicros: reservedCostMicros });
      actualUsedMicros = result.costMicros;
      requestDispatched = result.dispatched;
      responseStatus = result.status;
      const invalidGap = result.ok && options.operation === "timeline" && options.requestId?.includes(":gap:") && !isXTimelineGapPayload(result.body);
      if (result.dispatched && !result.cached) {
        usageRecorded = true;
        await writeXApiUsageEvent(options.cacheDb, options.operation, path, result.status,
          result.ok && !invalidGap ? result.body as XApiResponseWithResources : null, options.usageTracker, result.costMicros, result.costMicros);
      }
      if (invalidGap) throw new XApiError("Invalid or incomplete X timeline range", 502, { code: "invalid_x_gap_response" });
      if (!result.ok) throw new XApiError(result.error ?? "shared_x_api_failed", result.status, {
        code: result.error,
        sourceStatus: result.dispatched ? result.status : undefined,
        retryGatewayRequest: result.cached || result.dispatched || result.error === "budget_exceeded" || result.error === "rate_limited" ||
          result.error === "x_gateway_result_redacted" || result.error === "x_gateway_result_unknown",
      });
      return result.body as T;
    }
    requestDispatched = true;
    actualUsedMicros = reservedCostMicros;
    const response = await fetch(`${X_API_BASE_URL}${path}`, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        Accept: "application/json",
      },
    });
    responseStatus = response.status;

    if (!response.ok) {
      if (response.status === 429) {
        await writeXApiBackoff(options.backoffDb ?? options.cacheDb, response);
      }
      if (options.operation) {
        usageRecorded = true;
        actualUsedMicros = await writeXApiUsageEvent(
          options.cacheDb,
          options.operation,
          path,
          response.status,
          null,
          options.usageTracker,
          reservedCostMicros,
        );
      }
      const body = await response.text().catch(() => "");
      const fallback = `X API request failed with status ${response.status}`;
      const detail = summarizeXApiErrorBody(body, fallback);
      const invalidPageToken = response.status === 400 && path.includes("&pagination_token=") && /(?:pagination|next)[_ -]?token/i.test(body);
      throw new XApiError(
        fallback,
        response.status,
        {
          code:
            invalidPageToken ? "invalid_x_pagination_token" : response.status === 429
              ? "rate_limited"
              : `x_api_${response.status}`,
          sourceStatus: response.status,
          detail,
        },
      );
    }

    const data = (await response.json()) as T;
    if (options.operation) {
      usageRecorded = true;
      actualUsedMicros = await writeXApiUsageEvent(
        options.cacheDb,
        options.operation,
        path,
        response.status,
        data as XApiResponseWithResources,
        options.usageTracker,
      );
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
  type: "user" | "posts",
  value: T,
  fetchedAt: number,
  ttlMs: number,
  source?: { handle: string; siteId: SiteId },
) => {
  if (!cacheDb) return true;

  try {
    await cacheDb
      .prepare(
        `${source ? "WITH incoming(key,type,value,fetched_at,expires_at,handle) AS (VALUES (?,?,?,?,?,?))" : ""}
         INSERT INTO x_api_cache (key, type, value, fetched_at, expires_at)
         ${source ? `SELECT iif(${publicationHiddenSql("x_post_sources", "incoming", source.siteId)},json('site_member_cutover'),key),type,value,fetched_at,expires_at FROM incoming WHERE 1` : "VALUES (?, ?, ?, ?, ?)"}
         ON CONFLICT(key) DO UPDATE SET
           type = excluded.type,
           value = excluded.value,
           fetched_at = excluded.fetched_at,
           expires_at = excluded.expires_at`,
      )
      .bind(key, type, JSON.stringify(value), fetchedAt, fetchedAt + ttlMs, ...(source ? [normalizeHandle(source.handle)] : []))
      .run();
    return true;
  } catch (error) {
    console.warn("Failed to write X API cache", error);
    return false;
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
                updated_at, last_error, collection_started_at,
                initialization_completed_at, sync_pagination_token,
                sync_base_post_id, sync_newest_post_id, last_success_at, cadence_anchor_at
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
         WHERE id = ? AND hidden_at IS NULL AND content_access = 'normal'`,
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

const storedPostsEntry = (
  source: XPostSourceRow | null,
  rows: XStoredPostRow[],
  richXLinkPreviewEnabled: boolean,
): StoredXPostsEntry | null => {
  const posts = rows
    .map(parseStoredXPost)
    .filter((post): post is XPostItem => post !== null);
  if (!source && posts.length === 0) return null;

  const latestFetchedAt = rows.reduce((latest, row) => {
    const value = Number(row.fetched_at);
    return Number.isFinite(value) ? Math.max(latest, value) : latest;
  }, 0);
  const lastCheckedAt = source ? Number(source.last_checked_at) : latestFetchedAt;
  const safeLastCheckedAt = Number.isFinite(lastCheckedAt) ? lastCheckedAt : null;
  const fetchedAt = safeLastCheckedAt ?? latestFetchedAt;
  return {
    fetchedAt,
    expiresAt: fetchedAt + X_POSTS_CACHE_POLICY.freshTtlMs,
    userId: source?.user_id ?? rows[0]?.user_id ?? null,
    posts: richXLinkPreviewEnabled ? posts : stripStoredXLinkedPostPreviews(posts),
    lastCheckedAt: safeLastCheckedAt,
    cadenceAnchorAt: safeLastCheckedAt !== null && Number(source?.last_success_at) === safeLastCheckedAt
      ? collectionCadenceAnchor(Number(source?.cadence_anchor_at), safeLastCheckedAt) : safeLastCheckedAt,
    lastSeenPostId:
      source?.collection_started_at != null
        ? source.last_seen_post_id ?? null
        : source?.last_seen_post_id ?? sortXPostsDesc(rows.filter(row => !row.source_authority).map(parseStoredXPost).filter((post): post is XPostItem => post !== null))[0]?.id ?? null,
    lastError: source?.last_error ?? null,
    collectionStartedAt: source?.collection_started_at == null
      ? null : Number(source.collection_started_at),
    initializationCompletedAt: source?.initialization_completed_at == null
      ? null : Number(source.initialization_completed_at),
    syncPaginationToken: source?.sync_pagination_token ?? null,
    syncBasePostId: source?.sync_base_post_id ?? null,
    syncNewestPostId: source?.sync_newest_post_id ?? null,
  };
};

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
          `SELECT id, handle, user_id, username, value, created_at, fetched_at, hidden_at, source_authority
           FROM x_posts
           WHERE handle = ? AND hidden_at IS NULL
           ORDER BY created_at DESC, id DESC
           LIMIT ?`,
        )
        .bind(normalizedHandle, maxResults)
        .all<XStoredPostRow>(),
    ]);

    return storedPostsEntry(source, getD1Results<XStoredPostRow>(rowsResult), richXLinkPreviewEnabled);
  } catch (error) {
    console.warn("Failed to read stored X posts", error);
    return null;
  }
};

const readStoredPostsForHandles = async (
  handles: readonly string[],
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb: XCacheDb,
  page?: import("@contracts/member-posts").MemberPostsPageRequest,
  siteId: SiteId = "otw",
) => {
  const entries = new Map<string, StoredXPostsEntry | null>();
  // Keep each batch bounded, with indexed per-handle limits followed by ID
  // lookups. A window query would scan the entire retained post history.
  for (let offset = 0; offset < handles.length; offset += 50) {
    const chunk = handles.slice(offset, offset + 50);
    try {
      const [sourceRows, postRows] = await Promise.all([
        cacheDb.prepare(
          `SELECT source.*, CASE WHEN (SELECT value FROM settings WHERE key='x_collection_primary_source')='fxembed' THEN fx.last_success_at END AS fx_last_success_at
           FROM x_post_sources source LEFT JOIN x_fx_sources fx ON fx.handle=source.handle
           WHERE source.handle IN (${chunk.map(() => "?").join(",")})`,
        ).bind(...chunk).all<XPostSourceRow>().catch((error) => {
          console.warn("Failed to read stored X post sources", error);
          return { results: [] as XPostSourceRow[] };
        }),
        cacheDb.prepare(
          `WITH requested(handle) AS (SELECT value FROM json_each(?))
           SELECT post.id, post.handle, post.user_id, post.username, post.value,
             post.created_at, post.fetched_at, post.hidden_at, post.source_authority
           FROM requested CROSS JOIN x_posts AS post
           WHERE post.id IN (
             SELECT candidate.id FROM x_posts AS candidate
             WHERE candidate.handle = requested.handle AND candidate.hidden_at IS NULL AND candidate.content_access = 'normal' AND NOT (${publicationHiddenSql("x_posts","candidate",siteId)})
             ${page?.cursor ? "AND candidate.created_at <= ? AND (candidate.created_at < ? OR ('x:' || candidate.id) < ?)" : ""}
             ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT ?
           )
           ORDER BY post.handle, post.created_at DESC, post.id DESC`,
        ).bind(JSON.stringify(chunk), ...(page?.cursor ? [page.cursor.createdAt, page.cursor.createdAt, page.cursor.id] : []), maxResults).all<XStoredPostRow>(),
      ]);
      const sources = new Map(getD1Results<XPostSourceRow>(sourceRows).map((row) => [row.handle, row]));
      const posts = new Map<string, XStoredPostRow[]>();
      for (const row of getD1Results<XStoredPostRow>(postRows)) {
        const group = posts.get(row.handle) ?? [];
        group.push(row);
        posts.set(row.handle, group);
      }
      const staged = new Map<string, StoredXPostsEntry | null>();
      for (const handle of chunk) {
        const source=sources.get(handle),entry=storedPostsEntry(source ?? null,posts.get(handle) ?? [],richXLinkPreviewEnabled);
        const fxSuccess=Number(source?.fx_last_success_at ?? 0);
        staged.set(handle,entry&&fxSuccess>entry.fetchedAt?{...entry,fetchedAt:fxSuccess,lastCheckedAt:fxSuccess,expiresAt:fxSuccess+X_POSTS_CACHE_POLICY.freshTtlMs,lastError:null}:entry);
      }
      const filtered = new Map((await filterArchivedXReferences(cacheDb,
        [...staged.values()].flatMap(entry => entry?.posts ?? []), siteId)).map(post => [post.id, post]));
      // Publish the chunk only after its policy read succeeds. Other verified
      // chunks remain usable if this chunk fails in the non-paginated feed.
      for (const [handle, entry] of staged) {
        entries.set(handle, entry ? { ...entry, posts: entry.posts.flatMap(post => filtered.get(post.id) ?? []) } : null);
      }
    } catch (error) {
      if (page) throw error;
      console.warn("Failed to read stored X posts", error);
    }
  }
  return entries;
};

export const writeStoredPosts = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  user: XApiUser,
  posts: XPostItem[],
  fetchedAt: number,
  siteId: SiteId,
  context: XPostWriteContext | ((post: XPostItem) => XPostWriteContext) = officialXPostContext,
  rssFence?: FxRssWriteFence,
): Promise<StoredXPostsWriteResult> => {
  if (!cacheDb || posts.length === 0) return { ok: true, count: 0, insertedIds: [], error: null };
  try {
    if (!("batch" in cacheDb) || typeof cacheDb.batch !== "function") throw new Error("stored_post_batch_required");
    const result = await commitStoredPosts(cacheDb as Pick<D1Database, "prepare" | "batch">, normalizeHandle(handle), user, posts, fetchedAt, siteId, context, rssFence);
    if (result.count) invalidateXPostMemoryCache();
    return { ...result, ok: true, error: null };
  } catch (error) {
    console.warn("Failed to write stored X posts", error);
    return { ok: false, count: 0, insertedIds: [], error: error instanceof Error ? error.message : "stored_post_write_failed" };
  }
};

export const redactStoredXPosts = async (
  cacheDb: Pick<D1Database, "prepare" | "batch">,
  postIds: readonly string[],
  commit?: (postId:string,statements:D1PreparedStatement[])=>Promise<D1Result[]|{redacted:number}>,
) => {
  const uniqueIds = [...new Set(postIds.filter(Boolean))];
  const redactedAt = Date.now();
  let found = 0;
  let redacted = 0;
  const chunkSize=commit?1:50;
  for (let index = 0; index < uniqueIds.length; index += chunkSize) {
    const chunk = uniqueIds.slice(index, index + chunkSize);
    const existing = await cacheDb.prepare(
      `SELECT id FROM x_posts
       WHERE id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(...chunk).all<{ id: string }>();
    const ids = existing.results.map(row => row.id);
    found += ids.length;
    if (!ids.length) continue;
    const statements = [
      cacheDb.prepare(
       `UPDATE x_posts
        SET value = '{}', hidden_at = ?, hidden_reason = 'admin', content_removed_at = ?
        WHERE id IN (${ids.map(() => "?").join(", ")})
          AND hidden_at IS NULL AND content_removed_at IS NULL RETURNING id`,
      ).bind(redactedAt, redactedAt, ...ids),
      cacheDb.prepare(
        `UPDATE x_post_facts SET hidden_at=?,hidden_reason='admin',updated_at=?
         WHERE post_id IN (${ids.map(() => "?").join(", ")})`,
      ).bind(redactedAt, redactedAt, ...ids),
      ...prepareXReferenceRedaction(cacheDb, ids, redactedAt),
      cacheDb.prepare(`UPDATE x_activity_inbox SET payload=NULL,hydrated_payload=NULL,status='skipped',lease_until=0,last_error='post_redacted'
        WHERE post_id IN (${ids.map(() => "?").join(", ")})`).bind(...ids),
      ...ids.map(id=>cacheDb.prepare(`INSERT INTO x_activity_cache_redactions(post_id,created_at,completed_at,next_attempt_at)
        VALUES(?,?,NULL,0) ON CONFLICT(post_id) DO UPDATE SET completed_at=NULL,next_attempt_at=0,last_error=NULL`).bind(id,redactedAt)),
    ];
    const results=commit?await commit(ids[0]!,statements):await cacheDb.batch(statements);
    redacted += Array.isArray(results) ? results[0].results.length : results.redacted;
    invalidateXPostMemoryCache();
  }
  return {
    requested: uniqueIds.length,
    found,
    redacted,
    redactedAt,
    reason: "admin" as const,
  };
};

const writeXSyncContinuation = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  user: XApiUser,
  state: {
    nextToken: string | null;
    basePostId: string | null;
    newestPostId: string | null;
    completedPostId: string | null;
    gap?: XTimelineGapCheckpoint | null;
    collectionStartedAt?: number;
  },
  effectiveIntervalMs = X_COLLECTION_ACTIVE_CHECK_INTERVAL_MS,
  siteId: SiteId = "otw",
  scheduledFor?: number | null,
  officialSync?: Pick<XApiUsageTracker, "officialSyncOriginScope" | "officialSyncLeaseToken">,
) => {
  if (!cacheDb) return;
  const official = officialSync?.officialSyncOriginScope !== undefined;
  const fenced = official || officialSync?.officialSyncLeaseToken !== undefined;
  const checkedAt = now();
  const pending = Boolean(state.nextToken || state.gap);
  const cadenceAnchorAt = pending ? checkedAt : collectionCadenceAnchor(scheduledFor, checkedAt);
  // Cursor, continuation and success timestamps form one durable acknowledgement.
  // A failed statement leaves the previous range intact for infrastructure retry.
    const acknowledgement = await cacheDb
      .prepare(
        `WITH incoming(handle,user_id,username,last_seen_post_id,last_checked_at,cadence_anchor_at,
           updated_at,last_error,collection_started_at,initialization_completed_at,
           last_attempt_at,last_success_at,next_check_at,consecutive_failures,last_error_code,last_completed_at,
           sync_pagination_token,sync_base_post_id,sync_newest_post_id,sync_gap_state) AS
         (VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?))
         INSERT INTO x_post_sources (
           handle, user_id, username, last_seen_post_id, last_checked_at, cadence_anchor_at,
           updated_at, last_error, collection_started_at,
           initialization_completed_at, last_attempt_at, last_success_at,
           next_check_at, consecutive_failures, last_error_code, last_completed_at,
           sync_pagination_token, sync_base_post_id, sync_newest_post_id, sync_gap_state
         )
         SELECT iif(${publicationHiddenSql("x_post_sources", "incoming", siteId)},json('site_member_cutover'),handle),
           user_id,username,last_seen_post_id,last_checked_at,cadence_anchor_at,updated_at,last_error,
           collection_started_at,initialization_completed_at,last_attempt_at,last_success_at,
           next_check_at,consecutive_failures,last_error_code,last_completed_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id,sync_gap_state
         FROM incoming WHERE 1
         ${fenced ? "AND EXISTS(SELECT 1 FROM x_post_sources locked WHERE locked.handle=incoming.handle AND locked.lease_token=? AND locked.lease_until>?)" : ""}
         ON CONFLICT(handle) DO UPDATE SET
           user_id = iif(${publicationHiddenSql("x_post_sources","x_post_sources",siteId)},json('site_member_cutover'),excluded.user_id),
           username = excluded.username,
           last_seen_post_id = excluded.last_seen_post_id,
           sync_pagination_token = excluded.sync_pagination_token,
           sync_base_post_id = excluded.sync_base_post_id,
           sync_newest_post_id = excluded.sync_newest_post_id,
           sync_gap_state = excluded.sync_gap_state,
           last_checked_at = excluded.last_checked_at,
           cadence_anchor_at = excluded.cadence_anchor_at,
           collection_started_at = COALESCE(x_post_sources.collection_started_at, excluded.collection_started_at),
           initialization_completed_at = COALESCE(x_post_sources.initialization_completed_at, excluded.initialization_completed_at),
           last_attempt_at = excluded.last_attempt_at,
           last_success_at = excluded.last_success_at,
           last_completed_at = ${official ? "x_post_sources.last_completed_at" : "CASE WHEN excluded.sync_pagination_token IS NULL THEN excluded.last_success_at ELSE x_post_sources.last_completed_at END"},
           ${official ? "sync_timeline_completed_at = CASE WHEN excluded.sync_pagination_token IS NULL AND excluded.sync_gap_state IS NULL THEN excluded.last_success_at ELSE NULL END," : ""}
           next_check_at = excluded.next_check_at,
           consecutive_failures = 0,
           last_error_code = NULL,
           updated_at = excluded.updated_at,
           last_error = excluded.last_error`,
      )
      .bind(
        normalizeHandle(handle),
        user.id,
        user.username,
        pending ? state.basePostId : state.completedPostId,
        checkedAt,
        cadenceAnchorAt,
        checkedAt,
        null,
        state.collectionStartedAt ?? checkedAt,
        checkedAt,
        checkedAt,
        checkedAt,
        pending || official ? checkedAt + X_COLLECTION_CONTINUATION_CHECK_INTERVAL_MS : cadenceAnchorAt + effectiveIntervalMs,
        pending || official ? null : checkedAt,
        state.nextToken,
        state.nextToken ? state.basePostId : null,
        state.nextToken ? state.newestPostId : null,
        state.gap ? JSON.stringify(state.gap) : null,
        ...(fenced ? [officialSync?.officialSyncLeaseToken ?? "", checkedAt] : []),
      )
      .run();
    if (fenced && !acknowledgement.meta.changes) throw new Error("x_source_lease_lost");
};

const writeStoredPostSourceError = async (
  cacheDb: XCacheDb | undefined,
  handle: string,
  lastError: string | null,
  leaseToken?: string,
) => {
  if (!cacheDb || !lastError) return;

  const checkedAt = now();
  const retryAt = checkedAt + (["budget_exceeded", "invalid_x_pagination_token", "x_gateway_request_in_progress", "x_gateway_result_unknown"].includes(lastError) ? X_COLLECTION_CONTINUATION_CHECK_INTERVAL_MS : lastError === "rate_limited"
    ? X_COLLECTION_RATE_LIMIT_BACKOFF_MS
    : X_COLLECTION_ERROR_BACKOFF_MS);
  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_post_sources (
           handle, user_id, username, last_seen_post_id, last_checked_at,
           updated_at, last_error, last_attempt_at, next_check_at,
           consecutive_failures, last_error_code
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ? WHERE 1
         ${leaseToken !== undefined ? "AND EXISTS(SELECT 1 FROM x_post_sources locked WHERE locked.handle=? AND locked.lease_token=? AND locked.lease_until>?)" : ""}
         ON CONFLICT(handle) DO UPDATE SET
           last_checked_at = excluded.last_checked_at,
           last_attempt_at = excluded.last_attempt_at,
           next_check_at = excluded.next_check_at,
           consecutive_failures = x_post_sources.consecutive_failures + 1,
           last_error_code = excluded.last_error_code,
           updated_at = excluded.updated_at,
           last_error = excluded.last_error`,
      )
      .bind(
        normalizeHandle(handle),
        null,
        null,
        null,
        checkedAt,
        checkedAt,
        lastError,
        checkedAt,
        retryAt,
        lastError,
        ...(leaseToken !== undefined ? [normalizeHandle(handle), leaseToken, checkedAt] : []),
      )
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
  postsToStore: XPostItem[] = posts,
  siteId: SiteId = "otw",
  context: (post: XPostItem) => XPostWriteContext = () => officialXPostContext,
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

  const storedPostsWrite = await writeStoredPosts(
    cacheDb,
    handle,
    user,
    postsToStore,
    fetchedAt,
    siteId,
    context,
  );
  if (storedPostsWrite.ok && await writeD1Cache<XPostsCacheValue>(
    cacheDb, cacheKey, "posts", { userId: user.id, posts }, fetchedAt,
    X_POSTS_CACHE_POLICY.freshTtlMs, { handle, siteId },
  )) X_POSTS_CACHE.set(cacheKey, entry);
  return {
    ...entry,
    postsStored: storedPostsWrite.count,
    newlyStoredPosts: postsToStore.filter(post => storedPostsWrite.insertedIds.includes(post.id)).map(post => ({ id: post.id, createdAt: post.createdAt, storedAt: fetchedAt })),
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

export const xTimelineWriteContext = (response: XUserTimelineResponse, postId: string, origin: XPostWriteContext["origin"] = "x_api"): XPostWriteContext => {
  const raw = response.data?.find(post => post.id === postId);
  const keys = raw?.attachments?.media_keys ?? [];
  return { origin, completeness: {
    text: typeof (raw?.note_tweet?.text ?? raw?.text) === "string",
    media: Boolean(raw) && keys.every(key => response.includes?.media?.some(media => media.media_key === key && Boolean(media.url ?? media.preview_image_url))),
    relations: Boolean(raw),
  } };
};

export const normalizeXTimelineResponse = (
  response: XUserTimelineResponse,
  username: string,
): XPostItem[] => {
  const mediaByKey = new Map(
    (response.includes?.media ?? []).map((media) => [media.media_key, media]),
  );

  return (response.data ?? []).map((post) => {
    const media = normalizeXMediaItems(post.attachments?.media_keys, mediaByKey);
    const content = typeof post.note_tweet?.text === "string" ? post.note_tweet : post;
    const links = (content.entities?.urls ?? [])
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
      text: content.text ?? "",
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
            inReplyToUserId: post.in_reply_to_user_id ?? null,
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
      .find((id): id is string => Boolean(id) && id !== post.reply?.postId);
    return quotePostId
      ? {
          ...post,
          quote: { postId: quotePostId, post: null },
        }
      : post;
  });

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

export const normalizeLinkedXPost = (
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

export const fetchXPostPreviewById = async (
  postId: string,
  options: {
    cacheDb?: XCacheDb;
    siteId?: SiteId;
  } = {},
) => {
  if (!options.cacheDb) return null;
  const preview = await readStoredXPreview(options.cacheDb, postId, Date.now(), options.siteId);
  return preview === "hidden" ? null : preview?.post ?? null;
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
  continuationMaxResults = X_COLLECTION_MAX_RESULTS,
  effectiveIntervalMs = X_COLLECTION_ACTIVE_CHECK_INTERVAL_MS,
  siteId: SiteId = "otw",
  scheduledFor?: number | null,
): Promise<{
  posts: XPostItem[];
  error: string | null;
  errorStatus?: number | null;
  errorDetail?: string | null;
  stale: boolean;
  postsStored: number;
  newlyStoredPosts?: XNewlyStoredPost[];
  storageError: string | null;
}> => {
  const stored = forceRefresh && staleFallback && "syncPaginationToken" in staleFallback ? staleFallback as StoredXPostsEntry : await readStoredPosts(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
    cacheDb,
  );
  if (
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
  const cached = forceRefresh && staleFallback ? null : await getCachedPosts(
    handle,
    maxResults,
    richXLinkPreviewEnabled,
    cacheDb,
  );
  const requestedLimit = stored?.syncPaginationToken
    ? continuationMaxResults
    : maxResults;

  if (!forceRefresh && cached && isCacheFresh(cached)) {
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
        error: entry.providerError?.error ?? null,
        errorStatus: entry.providerError?.errorStatus,
        errorDetail: entry.providerError?.errorDetail,
        stale: Boolean(entry.providerError && activeFallback),
        postsStored: entry.postsStored,
        newlyStoredPosts: [],
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

  const syncToken = stored?.syncPaginationToken ?? null;
  const sinceId = syncToken
    ? stored?.syncBasePostId ?? null
    : stored?.lastSeenPostId ?? null;
  const fetchPage = async (limit: number, since: string | null, start: string, until: string | null, token: string | null, gap?: XTimelineGapCheckpoint) => {
    let collectionLimit = limit;
    if (forceRefresh && usageTracker?.gateway && cacheDb && !gap) {
      const shared = await usageTracker.gateway.readBudget();
      const site = await readSiteXBudget(cacheDb);
      collectionLimit = getXTimelinePageSize(limit, shared.remaining, (await readDailyBudgetMicros(cacheDb)) - site.used - site.reserved);
    }
    const params = new URLSearchParams({
      max_results: String(collectionLimit),
      exclude: "retweets",
      "tweet.fields": "created_at,public_metrics,attachments,entities,referenced_tweets,conversation_id,in_reply_to_user_id,note_tweet",
      expansions: "attachments.media_keys",
      "media.fields": "url,preview_image_url,type,width,height,alt_text",
    });
    if (token) params.set("pagination_token", token);
    if (since) params.set("since_id", since);
    else params.set("start_time", start);
    if (until) params.set("until_id", until);
    const path = gap?.request?.path ?? `/users/${user.id}/tweets?${params}`;
    const requestId = gap ? await xTimelineGapRequestId(siteId, normalizeHandle(handle), gap.startedAt, path, gap.attempt) : undefined;
    if (gap?.request) {
      const saved = new URLSearchParams(path.slice(path.indexOf("?") + 1));
      if (!path.startsWith(`/users/${user.id}/tweets?`) || requestId !== gap.request.id ||
        saved.get("since_id") !== since || saved.get("until_id") !== until || saved.get("pagination_token") !== token ||
        (!since && saved.get("start_time") !== start)) {
        throw new XApiError("X timeline request identity changed", 409, { code: "x_gateway_identity_conflict" });
      }
    }
    if (usageTracker?.timelineReplay) {
      const replay = usageTracker.timelineReplay;
      if (replay.id !== requestId || replay.path !== path) throw new XApiError("X timeline response unavailable for replay", 429, { code: "budget_exceeded" });
      const receipt = await usageTracker.gateway?.readReceipt?.({ id: replay.id, path, operation: "timeline", includeTimelineBody: true });
      if (!receipt?.found || receipt.status !== "complete" || receipt.ok !== true || receipt.timelineBody === undefined) {
        throw new XApiError("X timeline response unavailable for replay", 429, { code: "budget_exceeded" });
      }
      return { response: receipt.timelineBody as XUserTimelineResponse, collectionLimit };
    }
    if (gap && requestId && !gap.request) {
      const saved = cacheDb && usageTracker?.officialSyncLeaseToken && await writeXTimelineGapCheckpoint(cacheDb, normalizeHandle(handle), usageTracker.officialSyncLeaseToken, now(), siteId, {
        ...gap, request: { id: requestId, path, until },
      }).catch(() => false);
      if (!saved) throw new XApiError("X timeline request checkpoint unavailable", 503, { code: "budget_unavailable" });
      if (saved === "boundary_changed") throw new XApiError("X timeline storage boundary changed",409,{code:"x_gap_boundary_changed"});
    }
    const response = await requestXApi<XUserTimelineResponse>(
      path,
      bearerToken,
      {
        cacheDb,
        operation: "timeline",
        usageTracker,
        combineAdmission: Boolean(gap),
        requestId,
      },
    );
    return { response, collectionLimit };
  };
  const normalizePage = async (response: XUserTimelineResponse, since: string | null, collectionStartedAt: number) => {
    const normalizedPosts = normalizeXTimelineResponse(response, user.username);
    // Only a genuinely new background source receives the activation cutoff.
    // Existing cursors and legacy on-demand reads keep their established
    // incremental/response semantics.
    const eligiblePosts = forceRefresh && !since
      ? normalizedPosts.filter(
          (post) => new Date(post.createdAt).getTime() >= collectionStartedAt,
        )
      : normalizedPosts;
    return enrichXPostsWithLinkPreviews(inferMissingXQuoteReferences(eligiblePosts));
  };
  const assertRangeResponse = (response: XUserTimelineResponse, after: string | null, until: string | null, previousToken: string | null) => {
    if (!isXTimelineGapPayload(response)) throw new XApiError("Invalid or incomplete X timeline range", 502, { code: "invalid_x_gap_response" });
    const token = response.meta?.next_token;
    if (token && token === previousToken) throw new XApiError("X returned the same timeline token", 502, { code: "invalid_x_pagination_token" });
    if ((response.data ?? []).some(post => (after !== null && BigInt(post.id) <= BigInt(after)) || (until !== null && BigInt(post.id) >= BigInt(until)))) {
      throw new XApiError("Invalid or incomplete X timeline range", 502, { code: "invalid_x_gap_response" });
    }
  };

  const request = (async () => {
    const gapBatch = cacheDb && usageTracker?.officialSyncOriginScope !== undefined && usageTracker.officialSyncLeaseToken
      ? await readXTimelineGapBatch(cacheDb, normalizeHandle(handle), user.id, usageTracker.officialSyncLeaseToken, now()) : null;
    if (gapBatch && cacheDb && usageTracker?.officialSyncLeaseToken) {
      const alreadyPending = usageTracker.gapSweep === "pending";
      usageTracker.gapSweep = "pending";
      const { base, bounds, startTime } = gapBatch;
      const { startedAt, recovery } = gapBatch.checkpoint;
      let boundsRevision = gapBatch.checkpoint.boundsRevision;
      let { after, page, attempt, request: savedRequest } = gapBatch.checkpoint;
      const newlyStoredPosts: XNewlyStoredPost[] = [];
      const entry: CachedXPostsWriteEntry = {
        fetchedAt: now(), expiresAt: now() + X_POSTS_CACHE_POLICY.freshTtlMs, userId: user.id,
        posts: activeFallback?.posts ?? [], postsStored: 0, newlyStoredPosts, storageError: null,
      };
      for (let index = 0; index < X_TIMELINE_GAP_BATCH_SIZE; index++) {
        // Leave room for one page, its durable acknowledgement and Queue reconciliation.
        if (cacheDb && !hasXCollectionD1Room(cacheDb, 24)) break;
        const until = savedRequest ? savedRequest.until : page ? page.until : bounds.shift() ?? null;
        let response: XUserTimelineResponse;
        let posts: XPostItem[];
        let requestRevision = savedRequest ? boundsRevision ?? 0 : gapBatch.revision;
        const seenTokens = page?.seenTokens ?? [];
        try {
          const boundary = index > 0 || page || savedRequest ? await readXTimelineGapBoundary(cacheDb, normalizeHandle(handle), user.id,
            after, until, page || savedRequest ? boundsRevision ?? 0 : gapBatch.revision, page?.storedIds) : null;
          if (!savedRequest && boundary) requestRevision = boundary.revision;
          if (boundary?.changed || (page || savedRequest) && boundsRevision === undefined) {
            const receipt = savedRequest ? await usageTracker.gateway?.readReceipt?.({ ...savedRequest, operation: "timeline" }) : undefined;
            if (savedRequest && !receipt) throw new XApiError("X receipt unavailable", 503, { code: "budget_unavailable" });
            if (!savedRequest || receipt?.found === false) {
              const saved = await writeXTimelineGapCheckpoint(cacheDb, normalizeHandle(handle), usageTracker.officialSyncLeaseToken, now(), siteId, {
                startedAt, base, after, page: null, attempt: crypto.randomUUID(),
                recovery: { until: recovery ? recovery.until : until },
              });
              if (!saved) throw new XApiError("X boundary checkpoint unavailable", 503, { code: "budget_unavailable" });
              usageTracker.gapProgress = true;
              break;
            }
          }
          if (!hasXCollectionD1Room(cacheDb, 23)) break;
          const emptyRange = !page && after !== null && until !== null && BigInt(until) - BigInt(after) === 1n;
          response = emptyRange ? { data: [] } : (await fetchPage(5, after, startTime, until, page?.token ?? null, {
            startedAt, boundsRevision: requestRevision, recovery, base, after, page, attempt, request: savedRequest,
          })).response;
          assertRangeResponse(response, after, until, page?.token ?? null);
          const token = response.meta?.next_token;
          if (token) {
            const fingerprint = await xTimelineTokenFingerprint(token);
            if (seenTokens.includes(fingerprint) || seenTokens.length >= X_TIMELINE_GAP_MAX_PAGES) {
              throw new XApiError("X timeline pagination did not advance", 502, { code: "invalid_x_pagination_token" });
            }
            seenTokens.push(fingerprint);
          }
          posts = await normalizePage(response, after, Date.parse(startTime));
        } catch (error) {
          if(error instanceof XApiError && error.code==="x_gap_boundary_changed"){
            usageTracker.gapProgress=true;
            break;
          }
          entry.providerError = describeXError(error);
          if (error instanceof XApiError && (error.retryGatewayRequest || error.code === "invalid_x_gap_response" || error.code === "invalid_x_pagination_token" || error.code === "x_gateway_identity_conflict")) {
            const expired = error.code === "invalid_x_pagination_token";
            const changed = error.code === "x_gateway_identity_conflict" && !usageTracker.timelineReplay;
            try {
              if (changed || error.code !== "x_gateway_identity_conflict") {
                await writeXTimelineGapCheckpoint(cacheDb, normalizeHandle(handle), usageTracker.officialSyncLeaseToken, now(), siteId, {
                  startedAt, base, boundsRevision, after: changed ? base : after, page: expired || changed ? null : page, attempt: crypto.randomUUID(),
                  recovery: changed ? { until: null }
                    : expired ? { until: recovery ? recovery.until : until } : recovery,
                });
              }
            } catch {
              entry.storageError = "x_post_storage_failed";
            }
          }
          break;
        }
        const storedAt = now();
        const write = await writeStoredPosts(cacheDb, handle, user, posts, storedAt, siteId, post => xTimelineWriteContext(response, post.id));
        if (!write.ok) { entry.storageError = "x_post_storage_failed"; break; }
        entry.posts = mergeXPosts(posts, entry.posts).slice(0, maxResults);
        entry.postsStored += write.count;
        newlyStoredPosts.push(...posts.filter(post => write.insertedIds.includes(post.id)).map(post => ({ id: post.id, createdAt: post.createdAt, storedAt })));
        const newest: string | null = [page?.newest, after, ...posts.map(post => post.id)].reduce<string | null>((max, id) =>
          id && (max === null || BigInt(id) > BigInt(max)) ? id : max, null);
        const token = response.meta?.next_token;
        const recoveryComplete = !token && recovery !== undefined && until === recovery.until;
        const checkpoint: XTimelineGapCheckpoint | null = token ? { startedAt, boundsRevision: requestRevision, recovery, base, after, page: { until, token, newest, seenTokens, storedIds: posts.map(post => post.id) }, attempt }
          : until === null ? null : { startedAt, boundsRevision, recovery: recoveryComplete ? undefined : recovery, base, after: until, page: null };
        try {
          await writeXSyncContinuation(cacheDb, handle, user, {
            nextToken: null, basePostId: base, newestPostId: null, completedPostId: newest, gap: checkpoint,
            collectionStartedAt: Date.parse(startTime),
          }, effectiveIntervalMs, siteId, scheduledFor, usageTracker);
        } catch (error) {
          console.warn("Failed to acknowledge stored X timeline range", error);
          entry.storageError = "x_post_storage_failed";
          break;
        }
        usageTracker.gapProgress = true;
        if (!checkpoint) {
          if (!alreadyPending) usageTracker.gapSweep = "complete";
          break;
        }
        if (usageTracker.timelineReplay || recoveryComplete) break;
        ({ after, page, attempt, request: savedRequest } = checkpoint);
        boundsRevision = checkpoint.boundsRevision;
      }
      return entry;
    }

    const collectionStartedAt = stored?.collectionStartedAt ?? now();
    const { response, collectionLimit } = await fetchPage(requestedLimit, sinceId, new Date(collectionStartedAt).toISOString(), null, syncToken);
    const posts = await normalizePage(response, sinceId, collectionStartedAt);
    const newPosts = posts.slice(0, collectionLimit);
    const mergedPostsForResponse = mergeXPosts(newPosts, stored?.posts ?? activeFallback?.posts ?? []).slice(0, collectionLimit);
    const responsePosts = mergedPostsForResponse.slice(0, maxResults);
    const lastSeenPostId =
      stored?.syncNewestPostId ??
      sortXPostsDesc(posts)[0]?.id ??
      sinceId ??
      null;
    const entry = await setCachedPosts(
      handle,
      user,
      responsePosts,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
      newPosts,
      siteId,
      post => xTimelineWriteContext(response, post.id),
    );
    // The timeline watermark is an acknowledgement that every post in this
    // page was durably stored. Advancing it after a D1 write failure would
    // make the failed page unreachable on the next incremental request.
    if (entry.storageError === null) {
      try {
        await writeXSyncContinuation(cacheDb, handle, user, {
          nextToken: response.meta?.next_token ?? null,
          basePostId: syncToken ? stored?.syncBasePostId ?? null : sinceId,
          newestPostId: lastSeenPostId,
          completedPostId: lastSeenPostId,
        }, effectiveIntervalMs, siteId,
        usageTracker?.recoveryAnchorAt ?? (stored?.syncPaginationToken || stored?.lastError || (stored?.lastCheckedAt ?? 0) >= (scheduledFor ?? Infinity) ? undefined : scheduledFor), usageTracker);
      } catch (error) {
        console.warn("Failed to acknowledge stored X timeline page", error);
        entry.storageError = "x_post_storage_failed";
      }
    }
    return entry;
  })();

  X_POSTS_IN_FLIGHT.set(cacheKey, request);

  try {
    const entry = await request;
    return {
      posts: entry.posts,
      error: entry.providerError?.error ?? null,
      errorStatus: entry.providerError?.errorStatus,
      errorDetail: entry.providerError?.errorDetail,
      stale: Boolean(entry.providerError && activeFallback),
      postsStored: entry.postsStored,
      newlyStoredPosts: entry.newlyStoredPosts,
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
    continuationMaxResults = X_COLLECTION_MAX_RESULTS,
    effectiveIntervalMinutes = 120,
    siteId = "otw",
    scheduledFor,
  } = options;
  const normalizedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter(Boolean)),
  );
  if (!refresh && cacheDb) {
    // D1 remains authoritative across isolates for redaction/reference updates.
    const entries = await readStoredPostsForHandles(
      normalizedHandles, maxResults, richXLinkPreviewEnabled, cacheDb, options.storedPage, siteId,
    );
    return buildResult(normalizedHandles.map((handle) => {
      const stored = entries.get(handle);
      return stored
        ? makeCachedPostsResult(handle, stored, !shouldUseFreshStoredPosts(stored))
        : { handle, userId: null, posts: [], error: null, stale: false };
    }));
  }

  const token = bearerToken?.trim() || (options.gateway ? "shared-gateway" : undefined);
  const resultByHandle = new Map<string, XHandlePostsResult>();
  const stalePostsByHandle = new Map<string, CachedXPostsEntry>();
  const handlesToRefresh: string[] = [];
  const activeUsageTracker = usageTracker ?? {
    gateway: options.gateway,
    apiCalls: 0,
    estimatedCostMicros: 0,
    reservedCostMicros: 0,
    uniqueResources: 0,
    previewDeferred: 0,
    authorCacheHits: 0,
    authorCacheMisses: 0,
    forceRefreshPath: forceRefresh ? "unknown" : null,
  };
  if (usageTracker) {
    usageTracker.gateway ??= options.gateway;
    usageTracker.forceRefreshPath ??= forceRefresh ? "unknown" : null;
  }

  for (const handle of normalizedHandles) {
    const cached = await getCachedPosts(
      handle,
      maxResults,
      richXLinkPreviewEnabled,
      cacheDb,
    );
    if (
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
    const replay = activeUsageTracker.timelineReplay;
    const replayUserId = replay?.path.split("/")[2];
    usersByHandle = replay ? new Map(handlesToRefresh.map(handle => [handle, replayUserId ? { id: replayUserId, username: handle } : null])) : await fetchXUsersByHandles(
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
            newlyStoredPosts,
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
              continuationMaxResults,
              effectiveIntervalMinutes * 60_000,
              siteId,
              scheduledFor,
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
            newlyStoredPosts,
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
      activeUsageTracker.purpose === "collection" ? 1 : X_POSTS_BATCH_CONCURRENCY,
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
    effectiveIntervalMinutes?: number;
    uniqueResources?: number;
    previewDeferred?: number;
    coalescedHandles?: number;
  },
) => {
  if (!cacheDb) return;

  try {
    await cacheDb
      .prepare(
        `INSERT INTO x_collection_runs (
           source, started_at, finished_at, checked_handles, refreshed_handles,
           posts_returned, posts_stored, api_calls, estimated_cost_micros,
           status, error, effective_interval_minutes, unique_resources,
           preview_deferred, coalesced_handles
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        data.effectiveIntervalMinutes ?? null,
        data.uniqueResources ?? 0,
        data.previewDeferred ?? 0,
        data.coalescedHandles ?? 0,
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
  if (entry.lastError === "budget_exceeded" || (entry.syncPaginationToken && !entry.lastError)) {
    return X_COLLECTION_CONTINUATION_CHECK_INTERVAL_MS;
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

const shouldRefreshCollectionHandle = (entry: StoredXPostsEntry | null, timestamp = now()) => {
  if (!entry || entry.lastCheckedAt === null) return true;
  const anchorAt = entry.lastError || entry.syncPaginationToken || entry.lastCheckedAt > timestamp
    ? entry.lastCheckedAt : collectionCadenceAnchor(entry.cadenceAnchorAt, entry.lastCheckedAt);
  return timestamp - anchorAt >= getCollectionRefreshIntervalMs(entry);
};

const getXCollectionHandlesToRefresh = async (
  handles: string[],
  maxResults: number,
  richXLinkPreviewEnabled: boolean,
  cacheDb?: XCacheDb,
  scheduledFor?: number | null,
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
    const timestamp = stored?.syncPaginationToken || stored?.lastError
      ? now() : collectionCadenceAnchor(scheduledFor, now());
    if (shouldRefreshCollectionHandle(stored, timestamp)) {
      handlesToRefresh.push(handle);
    }
  }
  return handlesToRefresh;
};

const getOptimizedXCollectionHandlesToRefresh = async (
  handles: string[],
  cacheDb?: XCacheDb,
  scheduledFor?: number | null,
) => {
  if (!cacheDb) return handles;
  const due: string[] = [];
  const timestamp = now();
  for (const handle of handles) {
    const row = await cacheDb.prepare(
      `SELECT next_check_at,last_attempt_at,sync_pagination_token,consecutive_failures FROM x_post_sources WHERE handle = ?`,
    ).bind(normalizeHandle(handle)).first<{ next_check_at: number | string | null; last_attempt_at: number | null; sync_pagination_token: string | null; consecutive_failures: number }>();
    const nextCheckAt = Number(row?.next_check_at ?? 0);
    const resuming = Boolean(row?.sync_pagination_token || row?.consecutive_failures);
    const dueAt = resuming ? timestamp : collectionCadenceAnchor(scheduledFor, timestamp);
    if ((!Number.isFinite(nextCheckAt) || nextCheckAt <= dueAt) &&
      (resuming || (row?.last_attempt_at ?? 0) < dueAt)) due.push(handle);
  }
  return due;
};

const writeXCollectionSourceErrors = async (
  cacheDb: XCacheDb | undefined,
  byHandle: XHandlePostsResult[],
  leaseToken?: string,
) => {
  await Promise.all(
    byHandle
      .filter((item) => item.error)
      .map((item) => writeStoredPostSourceError(cacheDb, item.handle, item.error, leaseToken)),
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
    optimizerEnabled = false,
    effectiveIntervalMinutes = 120,
    coalescedHandles = 0,
    afterTimeline,
    siteId = "otw",
    scheduledFor,
  } = options;
  const startedAt = now();
  const normalizedHandles = Array.from(
    new Set(handles.map(normalizeHandle).filter(Boolean)),
  );
  const tracker: XApiUsageTracker = {
    officialSyncOriginScope: options.officialSyncOriginScope,
    officialSyncLeaseToken: options.officialSyncLeaseToken,
    timelineReplay: options.timelineReplay,
    gateway: options.gateway,
    recoveryAnchorAt: options.recoveryAnchorAt,
    apiCalls: 0,
    estimatedCostMicros: 0,
    reservedCostMicros: 0,
    uniqueResources: 0,
    previewDeferred: 0,
    authorCacheHits: 0,
    authorCacheMisses: 0,
    source,
    purpose: "collection",
    forceRefreshPath: `collection:${source}`,
  };
  let hydrationInfrastructureError = false;
  let hydrationAttempted = false;
  let hydrationResult: import("@contracts/x-posts").XReferenceHydrationResultDto | undefined;
  const hydrate = async () => {
    if (hydrationAttempted) return hydrationResult;
    hydrationAttempted = true;
    try { hydrationResult = await afterTimeline?.(tracker); return hydrationResult; }
    catch (error) { hydrationInfrastructureError = true; throw error; }
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
      uniqueResources: 0,
      previewDeferred: 0,
      coalescedHandles,
      status: "skipped" as const,
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      effectiveIntervalMinutes,
      ...result,
    });
    return result;
  }

  const token = bearerToken?.trim() || (options.gateway ? "shared-gateway" : undefined);
  if (!token) {
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: 0,
      estimatedCostMicros: 0,
      uniqueResources: 0,
      previewDeferred: 0,
      coalescedHandles,
      status: "failed" as const,
      error: "missing_bearer_token",
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      effectiveIntervalMinutes,
      ...result,
    });
    return result;
  }

  try {
    // A manual run is an explicit operator recovery action. It must still obey
    // the global rate-limit backoff and daily budget in requestXApi, but it
    // must not be turned into a no-op by the adaptive scheduled cooldown.
    let handlesToRefresh = source === "manual" || options.scheduledEligibilityConfirmed
      ? normalizedHandles
      : optimizerEnabled
        ? await getOptimizedXCollectionHandlesToRefresh(normalizedHandles, cacheDb, scheduledFor)
      : await getXCollectionHandlesToRefresh(
        normalizedHandles,
        maxResults,
        richXLinkPreviewEnabled,
        cacheDb,
        scheduledFor,
      );

    let timelineAlreadyCompleted = false;
    if (options.officialSyncOriginScope !== undefined && cacheDb && handlesToRefresh.length) {
      const completed = await cacheDb.prepare("SELECT handle FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?)) AND sync_timeline_completed_at IS NOT NULL AND sync_pagination_token IS NULL AND sync_gap_state IS NULL")
        .bind(JSON.stringify(handlesToRefresh)).all<{ handle: string }>();
      const done = new Set(completed.results.map(row => row.handle));
      timelineAlreadyCompleted = done.size > 0;
      handlesToRefresh = handlesToRefresh.filter(handle => !done.has(handle));
    }

    if (handlesToRefresh.length === 0) {
      const referenceHydration = await hydrate();
      const result = {
        checkedHandles: normalizedHandles.length,
        refreshedHandles: 0,
        postsReturned: 0,
        postsStored: 0,
        apiCalls: tracker.apiCalls,
        estimatedCostMicros: tracker.estimatedCostMicros,
        uniqueResources: tracker.uniqueResources,
        previewDeferred: tracker.previewDeferred,
        coalescedHandles,
        status: timelineAlreadyCompleted ? "success" as const : "skipped" as const,
        ...(timelineAlreadyCompleted ? {} : { error: "all_handles_cooldown" }),
        referenceHydration,
      };
      await writeXCollectionRun(cacheDb, {
        source,
        startedAt,
        finishedAt: now(),
        effectiveIntervalMinutes,
        ...result,
      });
      return result;
    }

    const content = await fetchXPostsForHandles(handlesToRefresh, {
      gateway: options.gateway,
      bearerToken: token,
      cacheDb,
      maxResults,
      richXLinkPreviewEnabled,
      forceRefresh: true,
      refresh: true,
      usageTracker: tracker,
      siteId,
      continuationMaxResults: X_COLLECTION_MAX_RESULTS,
      effectiveIntervalMinutes,
      scheduledFor: source === "scheduled" ? scheduledFor : undefined,
    });
    if (afterTimeline && content.byHandle.some(item => item.storageError || item.error === "budget_unavailable")) {
      throw new XApiError("X collection persistence unavailable", 503, { code: "budget_unavailable" });
    }
    await writeXCollectionSourceErrors(cacheDb, content.byHandle, options.officialSyncLeaseToken);
    const referenceHydration = await hydrate();
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
      newlyStoredPosts: content.byHandle.flatMap(item => item.newlyStoredPosts ?? []),
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      uniqueResources: tracker.uniqueResources,
      previewDeferred: tracker.previewDeferred,
      coalescedHandles,
      status,
      referenceHydration,
      ...(failureError ? { error: failureError } : {}),
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      effectiveIntervalMinutes,
      ...result,
    });
    return result;
  } catch (error) {
    if (hydrationInfrastructureError) throw error;
    if (afterTimeline && error instanceof XApiError &&
      (error.code === "budget_unavailable" || error.diagnostics.some(item => item.error === "budget_unavailable"))) throw error;
    if (error instanceof XApiError) {
      await Promise.all(
        error.diagnostics.flatMap((item) =>
          item.handle && item.error
            ? [writeStoredPostSourceError(cacheDb, item.handle, item.error, options.officialSyncLeaseToken)]
            : [],
        ),
      );
    }
    // Provider failure must not block cost-free D1 repairs of older references.
    const referenceHydration = await hydrate();
    const failureError = formatXError(error);
    const result = {
      checkedHandles: normalizedHandles.length,
      refreshedHandles: 0,
      postsReturned: 0,
      postsStored: 0,
      apiCalls: tracker.apiCalls,
      estimatedCostMicros: tracker.estimatedCostMicros,
      uniqueResources: tracker.uniqueResources,
      previewDeferred: tracker.previewDeferred,
      coalescedHandles,
      referenceHydration,
      status: failureError === "budget_exceeded"
        ? ("skipped" as const)
        : ("failed" as const),
      error: failureError,
    };
    await writeXCollectionRun(cacheDb, {
      source,
      startedAt,
      finishedAt: now(),
      effectiveIntervalMinutes,
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
