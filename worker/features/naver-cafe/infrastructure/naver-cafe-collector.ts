import { and, asc, isNull, sql } from "drizzle-orm";
import { naverCafeSources, type NaverCafeSource } from "@db/schema";
import {
  buildNaverCafeArticleUrl,
  buildNaverCafeBoardUrl,
} from "../domain/board-urls";
import { WORKER_CACHE_POLICY } from "../../../platform/cache-policy";
import { getDb } from "../../../platform/db";
import { getSetting, pMap, updateSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";

export type NaverCafeSourceInput = Pick<
  NaverCafeSource,
  | "id"
  | "name"
  | "cafe_id"
  | "menu_id"
  | "cafe_url"
  | "member_uid"
  | "enabled"
  | "sort_order"
> & Partial<Pick<
  NaverCafeSource,
  | "collection_started_at"
  | "initialization_completed_at"
  | "last_seen_article_id"
  | "sync_page"
  | "sync_base_article_id"
  | "sync_newest_article_id"
>>;

export type NaverCafePostItem = {
  id: string;
  articleId: number;
  cafeId: string;
  menuId: string;
  sourceName: string;
  memberUid: number | null;
  title: string;
  summary: string;
  createdAt: string;
  url: string;
  thumbnailUrl: string | null;
  metrics: {
    commentCount: number;
    readCount: number;
    likeCount: number;
  };
  isNew: boolean;
};

export type NaverCafeSourceStatus =
  | "ok"
  | "stale"
  | "error"
  | "private"
  | "invalid_response"
  | "disabled";

export type NaverCafeSourceResult = {
  id: number;
  name: string;
  cafeId: string;
  menuId: string;
  cafeUrl: string;
  memberUid: number | null;
  enabled: boolean;
  sortOrder: number;
  status: NaverCafeSourceStatus;
  error: string | null;
  postCount: number;
  stale: boolean;
};

export type NaverCafePostsResult = {
  posts: NaverCafePostItem[];
  sources: NaverCafeSourceResult[];
};

export type NaverCafeCollectionTrigger = "manual" | "scheduled";

export type NaverCafeCollectionResult = NaverCafePostsResult & {
  success: boolean;
  updatedAt: string;
  checkedAt: number;
  durationMs: number;
};

type CachedSourcePosts = {
  fetchedAt: number;
  expiresAt: number;
  posts: NaverCafePostItem[];
};

type NaverCafeArticleItem = {
  articleId?: number;
  cafeId?: number;
  menuId?: number;
  subject?: string;
  title?: string;
  summary?: string;
  writeDateTimestamp?: number;
  representImage?: string;
  commentCount?: number;
  readCount?: number;
  likeCount?: number;
  newArticle?: boolean;
  blindArticle?: boolean;
  delParent?: boolean;
  refArticle?: boolean;
};

type NaverCafeBoardListResponse = {
  result?: {
    articleList?: Array<{
      type?: string;
      item?: NaverCafeArticleItem;
    }>;
  };
  errorCode?: string;
  message?: string;
};

type NaverCafePostRow = {
  id: string;
  article_id: number | string;
  source_id: number;
  source_name: string;
  cafe_id: string;
  menu_id: string;
  member_uid: number | null;
  title: string;
  summary: string;
  created_at: string;
  url: string;
  thumbnail_url: string | null;
  comment_count: number | string;
  read_count: number | string;
  like_count: number | string;
  is_new: number | boolean | null;
  fetched_at: number | string;
  hidden_at: number | null;
};

type NaverCafeSourceCheckRow = {
  id: number;
  source_id: number;
  source_name: string;
  cafe_id: string;
  menu_id: string;
  trigger: NaverCafeCollectionTrigger;
  status: NaverCafeSourceStatus;
  checked_at: number | string;
  duration_ms: number | string;
  post_count: number | string;
  error: string | null;
};

export class NaverCafeApiError extends Error {
  status: number;
  diagnostics: Array<{
    sourceId: number;
    sourceName: string;
    status: NaverCafeSourceStatus;
    error: string | null;
  }>;

  constructor(
    message: string,
    status: number,
    diagnostics: NaverCafeApiError["diagnostics"] = [],
  ) {
    super(message);
    this.name = "NaverCafeApiError";
    this.status = status;
    this.diagnostics = diagnostics;
  }
}

class NaverCafeSourceError extends Error {
  status: NaverCafeSourceStatus;
  sourceStatus: number | null;

  constructor(
    message: string,
    status: NaverCafeSourceStatus,
    sourceStatus: number | null = null,
  ) {
    super(message);
    this.name = "NaverCafeSourceError";
    this.status = status;
    this.sourceStatus = sourceStatus;
  }
}

const NAVER_CAFE_BOARD_API_BASE =
  "https://apis.naver.com/cafe-web/cafe-boardlist-api";
const NAVER_CAFE_POSTS_CACHE_POLICY = WORKER_CACHE_POLICY.naverCafe.posts;
const NAVER_CAFE_FETCH_CONCURRENCY = 3;
const NAVER_CAFE_FETCH_TIMEOUT_MS = 5_000;
const NAVER_CAFE_SCHEDULED_INTERVAL_MS = 60 * 60_000;
const NAVER_CAFE_COLLECTION_LAST_RUN_SETTING_KEY =
  "naver_cafe_collection_last_run";
const NAVER_CAFE_COLLECTION_ENABLED_SETTING_KEY =
  "naver_cafe_collection_enabled";
const NAVER_CAFE_DAILY_REQUEST_LIMIT = 240;
const NAVER_CAFE_MAX_PAGES_PER_RUN = 3;
const NAVER_CAFE_RETENTION_MS = 21 * 24 * 60 * 60_000;
export const NAVER_CAFE_COLLECTION_SIZE = 15;

const SOURCE_POSTS_CACHE = new Map<string, CachedSourcePosts>();

const now = () => Date.now();

const getD1Results = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === "object") {
    const results = (value as { results?: unknown }).results;
    return Array.isArray(results) ? (results as T[]) : [];
  }
  return [];
};

const toFiniteNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampMaxResults = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 10;
  return Math.min(20, Math.max(5, Math.trunc(value ?? 10)));
};

const getCacheKey = (source: NaverCafeSourceInput, size: number) =>
  `naver-cafe:${NAVER_CAFE_POSTS_CACHE_POLICY.version}:${source.id}:${source.cafe_id}:${source.menu_id}:${size}`;

const isFresh = (entry: CachedSourcePosts) => now() < entry.expiresAt;

const isStaleUsable = (entry: CachedSourcePosts) =>
  now() - entry.fetchedAt < NAVER_CAFE_POSTS_CACHE_POLICY.staleTtlMs;

const normalizeBoolean = (value: NaverCafeSourceInput["enabled"]) =>
  value !== false;

const sourceToStatus = (
  source: NaverCafeSourceInput,
  status: NaverCafeSourceStatus,
  options: {
    error?: string | null;
    postCount?: number;
    stale?: boolean;
  } = {},
): NaverCafeSourceResult => ({
  id: source.id,
  name: source.name,
  cafeId: source.cafe_id,
  menuId: source.menu_id,
  cafeUrl: source.cafe_url || buildNaverCafeBoardUrl(source.cafe_id, source.menu_id),
  memberUid: source.member_uid ?? null,
  enabled: normalizeBoolean(source.enabled),
  sortOrder: source.sort_order ?? 0,
  status,
  error: options.error ?? null,
  postCount: options.postCount ?? 0,
  stale: options.stale ?? false,
});

const decodeHtmlEntities = (value: string) => {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalized] ?? match;
  });
};

const normalizeText = (value: string | null | undefined, maxLength: number) => {
  if (!value) return "";
  const normalized = decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
};

const toNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const timestampToIso = (value: unknown) => {
  const timestamp = toNumber(value, 0);
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
};

export const normalizeNaverCafeBoardListResponse = (
  response: NaverCafeBoardListResponse,
  source: NaverCafeSourceInput,
): NaverCafePostItem[] => {
  const articleList = response.result?.articleList;
  if (!Array.isArray(articleList)) {
    throw new NaverCafeSourceError(
      "Unexpected Naver Cafe response shape",
      "invalid_response",
    );
  }

  return articleList
    .filter((entry) => entry.type === "ARTICLE" && entry.item)
    .map((entry) => entry.item as NaverCafeArticleItem)
    .filter((item) => !item.blindArticle && !item.delParent && !item.refArticle)
    .map((item): NaverCafePostItem | null => {
      const articleId = toNumber(item.articleId, 0);
      if (!articleId) return null;

      const cafeId = String(item.cafeId ?? source.cafe_id);
      const menuId = String(item.menuId ?? source.menu_id);
      return {
        id: `${cafeId}:${menuId}:${articleId}`,
        articleId,
        cafeId,
        menuId,
        sourceName: source.name,
        memberUid: source.member_uid ?? null,
        title: normalizeText(item.subject ?? item.title, 180),
        summary: normalizeText(item.summary, 700),
        createdAt: timestampToIso(item.writeDateTimestamp),
        url: buildNaverCafeArticleUrl(cafeId, menuId, articleId),
        thumbnailUrl: item.representImage ?? null,
        metrics: {
          commentCount: toNumber(item.commentCount),
          readCount: toNumber(item.readCount),
          likeCount: toNumber(item.likeCount),
        },
        isNew: item.newArticle === true,
      };
    })
    .filter((post): post is NaverCafePostItem => post !== null);
};

const parseErrorBody = (body: string) => {
  try {
    return JSON.parse(body) as { errorCode?: string; message?: string };
  } catch {
    return null;
  }
};

const getSourceErrorStatus = (
  responseStatus: number,
  errorCode?: string,
): NaverCafeSourceStatus => {
  if (
    responseStatus === 401 ||
    responseStatus === 403 ||
    errorCode === "11005" ||
    errorCode === "45005"
  ) {
    return "private";
  }
  return "error";
};

const requestNaverCafeBoardList = async (
  source: NaverCafeSourceInput,
  size: number,
  page = 1,
) => {
  const endpoint = `${NAVER_CAFE_BOARD_API_BASE}/v1/cafes/${source.cafe_id}/menus/${source.menu_id}/articles`;
  const url = new URL(endpoint);
  url.searchParams.set("page", String(page));
  url.searchParams.set("size", String(size));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NAVER_CAFE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: source.cafe_url || buildNaverCafeBoardUrl(source.cafe_id, source.menu_id),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const parsed = parseErrorBody(body);
      throw new NaverCafeSourceError(
        parsed?.message || `Naver Cafe request failed with status ${response.status}`,
        getSourceErrorStatus(response.status, parsed?.errorCode),
        response.status,
      );
    }

    const data = (await response.json()) as NaverCafeBoardListResponse;
    if (data.errorCode) {
      throw new NaverCafeSourceError(
        data.message || data.errorCode,
        getSourceErrorStatus(200, data.errorCode),
        200,
      );
    }
    return data;
  } catch (error) {
    if (error instanceof NaverCafeSourceError) throw error;
    throw new NaverCafeSourceError(
      error instanceof Error ? error.message : "Failed to fetch Naver Cafe posts",
      "error",
    );
  } finally {
    clearTimeout(timeout);
  }
};

const kstDate = (timestamp: number) =>
  new Date(timestamp + 9 * 60 * 60_000).toISOString().slice(0, 10);

const reserveNaverCafeRequest = async (cacheDb: D1Database | undefined) => {
  if (!cacheDb) {
    throw new NaverCafeSourceError("Naver Cafe usage ledger unavailable", "error");
  }
  const timestamp = now();
  try {
    await cacheDb.prepare(
      `INSERT INTO naver_cafe_usage_daily (kst_date, requests_used, updated_at)
       VALUES (?, 0, ?) ON CONFLICT(kst_date) DO NOTHING`,
    ).bind(kstDate(timestamp), timestamp).run();
    const row = await cacheDb.prepare(
      `UPDATE naver_cafe_usage_daily
       SET requests_used = requests_used + 1, updated_at = ?
       WHERE kst_date = ? AND requests_used < ?
       RETURNING requests_used`,
    ).bind(timestamp, kstDate(timestamp), NAVER_CAFE_DAILY_REQUEST_LIMIT)
      .first<{ requests_used: number }>();
    if (!row) {
      throw new NaverCafeSourceError("Naver Cafe daily request budget exhausted", "error");
    }
    return row.requests_used;
  } catch (error) {
    if (error instanceof NaverCafeSourceError) throw error;
    throw new NaverCafeSourceError("Naver Cafe usage ledger unavailable", "error");
  }
};

const writeNaverSourceState = async (
  cacheDb: D1Database | undefined,
  sourceId: number,
  values: {
    initializedAt?: number | null;
    collectionStartedAt?: number;
    lastSeen?: number | null;
    syncPage?: number | null;
    syncBase?: number | null;
    syncNewest?: number | null;
    attemptedAt: number;
    succeededAt?: number | null;
    nextCheckAt: number;
    errorCode?: string | null;
  },
) => {
  if (!cacheDb) return;
  await cacheDb.prepare(
    `UPDATE naver_cafe_sources SET
       collection_started_at = COALESCE(collection_started_at, ?),
       initialization_completed_at = COALESCE(?, initialization_completed_at),
       last_seen_article_id = ?, sync_page = ?, sync_base_article_id = ?,
       sync_newest_article_id = ?, last_attempt_at = ?,
       last_success_at = COALESCE(?, last_success_at), next_check_at = ?,
       consecutive_failures = CASE WHEN ? IS NULL THEN 0 ELSE consecutive_failures + 1 END,
       last_error_code = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).bind(
    values.collectionStartedAt ?? values.attemptedAt,
    values.initializedAt ?? null,
    values.lastSeen ?? null,
    values.syncPage ?? null,
    values.syncBase ?? null,
    values.syncNewest ?? null,
    values.attemptedAt,
    values.succeededAt ?? null,
    values.nextCheckAt,
    values.errorCode ?? null,
    values.errorCode ?? null,
    sourceId,
  ).run();
};

const collectNaverSourceNewFeed = async (
  source: NaverCafeSourceInput,
  cacheDb: D1Database | undefined,
) => {
  const attemptedAt = now();
  const initialized = source.initialization_completed_at != null;
  const startPage = initialized ? Math.max(1, source.sync_page ?? 1) : 1;
  const baseId = source.sync_base_article_id ?? source.last_seen_article_id ?? null;
  const startedAt = source.collection_started_at ?? attemptedAt;
  const retentionFloor = attemptedAt - NAVER_CAFE_RETENTION_MS;
  const collected: NaverCafePostItem[] = [];
  let newestId = source.sync_newest_article_id ?? null;
  let watermarkFound = false;
  let pagesRead = 0;

  try {
    for (let page = startPage; page < startPage + NAVER_CAFE_MAX_PAGES_PER_RUN; page += 1) {
      await reserveNaverCafeRequest(cacheDb);
      const response = await requestNaverCafeBoardList(
        source,
        NAVER_CAFE_COLLECTION_SIZE,
        page,
      );
      const posts = normalizeNaverCafeBoardListResponse(response, source);
      pagesRead += 1;
      newestId ??= posts[0]?.articleId ?? null;

      if (!initialized) {
        await writeNaverSourceState(cacheDb, source.id, {
          initializedAt: attemptedAt,
          collectionStartedAt: startedAt,
          lastSeen: newestId,
          attemptedAt,
          succeededAt: now(),
          nextCheckAt: now() + 60 * 60_000,
        });
        return { posts: [], pagesRead, initialized: true };
      }

      for (const post of posts) {
        if (baseId !== null && post.articleId === baseId) {
          watermarkFound = true;
          break;
        }
        const publishedAt = new Date(post.createdAt).getTime();
        if (publishedAt < startedAt || publishedAt < retentionFloor) {
          watermarkFound = true;
          break;
        }
        collected.push(post);
      }
      if (watermarkFound || posts.length < NAVER_CAFE_COLLECTION_SIZE) break;
    }

    const complete = watermarkFound || pagesRead < NAVER_CAFE_MAX_PAGES_PER_RUN;
    await writeNaverSourceState(cacheDb, source.id, {
      collectionStartedAt: startedAt,
      lastSeen: complete ? newestId : source.last_seen_article_id ?? null,
      syncPage: complete ? null : startPage + pagesRead,
      syncBase: complete ? null : baseId,
      syncNewest: complete ? null : newestId,
      attemptedAt,
      succeededAt: now(),
      nextCheckAt: now() + (collected.length > 0 ? 60 : 180) * 60_000,
    });
    return { posts: collected, pagesRead, initialized: false };
  } catch (error) {
    const errorCode = error instanceof NaverCafeSourceError
      ? error.message.includes("budget") ? "daily_budget_exhausted" : "provider_error"
      : "provider_error";
    await writeNaverSourceState(cacheDb, source.id, {
      collectionStartedAt: startedAt,
      lastSeen: source.last_seen_article_id ?? null,
      syncPage: source.sync_page ?? null,
      syncBase: source.sync_base_article_id ?? null,
      syncNewest: source.sync_newest_article_id ?? null,
      attemptedAt,
      nextCheckAt: now() + 60 * 60_000,
      errorCode,
    });
    throw error;
  }
};

const fetchPostsForSource = async (
  source: NaverCafeSourceInput,
  size: number,
  options: { forceRefresh?: boolean } = {},
): Promise<{ posts: NaverCafePostItem[]; source: NaverCafeSourceResult }> => {
  const cacheKey = getCacheKey(source, size);
  const cached = SOURCE_POSTS_CACHE.get(cacheKey);
  if (!options.forceRefresh && cached && isFresh(cached)) {
    return {
      posts: cached.posts,
      source: sourceToStatus(source, "ok", { postCount: cached.posts.length }),
    };
  }

  try {
    const response = await requestNaverCafeBoardList(source, size);
    const posts = normalizeNaverCafeBoardListResponse(response, source);
    SOURCE_POSTS_CACHE.set(cacheKey, {
      fetchedAt: now(),
      expiresAt: now() + NAVER_CAFE_POSTS_CACHE_POLICY.freshTtlMs,
      posts,
    });
    return {
      posts,
      source: sourceToStatus(source, "ok", { postCount: posts.length }),
    };
  } catch (error) {
    const status =
      error instanceof NaverCafeSourceError ? error.status : "error";
    const message =
      error instanceof Error ? error.message : "Failed to fetch Naver Cafe posts";

    if (cached && isStaleUsable(cached)) {
      return {
        posts: cached.posts,
        source: sourceToStatus(source, "stale", {
          error: message,
          postCount: cached.posts.length,
          stale: true,
        }),
      };
    }

    return {
      posts: [],
      source: sourceToStatus(source, status, {
        error: message,
      }),
    };
  }
};

export const fetchNaverCafePostsForSources = async (
  sources: NaverCafeSourceInput[],
  options: { size?: number; forceRefresh?: boolean } = {},
): Promise<NaverCafePostsResult> => {
  const size = clampMaxResults(options.size);
  const disabledSources = sources.filter((source) => !normalizeBoolean(source.enabled));
  const enabledSources = sources.filter((source) => normalizeBoolean(source.enabled));

  if (enabledSources.length === 0) {
    return {
      posts: [],
      sources: disabledSources.map((source) => sourceToStatus(source, "disabled")),
    };
  }

  const results = await pMap(
    enabledSources,
    (source) =>
      fetchPostsForSource(source, size, {
        forceRefresh: options.forceRefresh,
      }),
    NAVER_CAFE_FETCH_CONCURRENCY,
  );
  const posts = results
    .flatMap((result) => result.posts)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const sourceResults = [
    ...results.map((result) => result.source),
    ...disabledSources.map((source) => sourceToStatus(source, "disabled")),
  ].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const hasUsableSource = sourceResults.some(
    (source) => source.status === "ok" || source.status === "stale",
  );
  if (!hasUsableSource && enabledSources.length > 0) {
    throw new NaverCafeApiError(
      "Failed to fetch Naver Cafe posts",
      502,
      sourceResults.map((source) => ({
        sourceId: source.id,
        sourceName: source.name,
        status: source.status,
        error: source.error,
      })),
    );
  }

  return { posts, sources: sourceResults };
};

const rowToPost = (row: NaverCafePostRow): NaverCafePostItem => ({
  id: row.id,
  articleId: toFiniteNumber(row.article_id),
  cafeId: row.cafe_id,
  menuId: row.menu_id,
  sourceName: row.source_name,
  memberUid: row.member_uid ?? null,
  title: row.title,
  summary: row.summary,
  createdAt: row.created_at,
  url: row.url,
  thumbnailUrl: row.thumbnail_url ?? null,
  metrics: {
    commentCount: toFiniteNumber(row.comment_count),
    readCount: toFiniteNumber(row.read_count),
    likeCount: toFiniteNumber(row.like_count),
  },
  isNew: row.is_new === true || row.is_new === 1,
});

const readLatestSourceChecks = async (
  cacheDb: D1Database | undefined,
  sourceIds: number[],
) => {
  if (!cacheDb || sourceIds.length === 0) {
    return new Map<number, NaverCafeSourceCheckRow>();
  }

  const rows = getD1Results<NaverCafeSourceCheckRow>(
    await cacheDb
      .prepare(
        `WITH requested(source_id) AS (
           VALUES ${sourceIds.map(() => "(?)").join(", ")}
         )
         SELECT check_row.id, check_row.source_id, check_row.source_name,
                check_row.cafe_id, check_row.menu_id, check_row.trigger,
                check_row.status, check_row.checked_at, check_row.duration_ms,
                check_row.post_count, check_row.error
         FROM requested
         JOIN naver_cafe_source_checks AS check_row
           ON check_row.id = (
             SELECT latest.id
             FROM naver_cafe_source_checks AS latest
             WHERE latest.source_id = requested.source_id
             ORDER BY latest.checked_at DESC, latest.id DESC
             LIMIT 1
           )`,
      )
      .bind(...sourceIds)
      .all<NaverCafeSourceCheckRow>(),
  );
  const bySource = new Map<number, NaverCafeSourceCheckRow>();
  for (const row of rows) {
    if (!bySource.has(row.source_id)) {
      bySource.set(row.source_id, row);
    }
  }
  return bySource;
};

const readStoredPostsForSources = async (
  cacheDb: D1Database | undefined,
  sources: NaverCafeSourceInput[],
  size: number,
) => {
  if (!cacheDb) return [];
  const sourceIds = sources
    .filter((source) => normalizeBoolean(source.enabled))
    .map((source) => source.id);
  if (sourceIds.length === 0) return [];

  const rows = getD1Results<NaverCafePostRow>(
    await cacheDb
      .prepare(
        `SELECT id, article_id, source_id, source_name, cafe_id, menu_id,
                member_uid, title, summary, created_at, url, thumbnail_url,
                comment_count, read_count, like_count, is_new, fetched_at,
                hidden_at
         FROM naver_cafe_posts
         WHERE source_id IN (${sourceIds.map(() => "?").join(", ")})
           AND hidden_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(...sourceIds, size)
      .all<NaverCafePostRow>(),
  );

  return rows.map(rowToPost);
};

const storedSourceStatus = (
  source: NaverCafeSourceInput,
  latestCheck: NaverCafeSourceCheckRow | null,
  postCount: number,
): NaverCafeSourceResult => {
  if (!normalizeBoolean(source.enabled)) {
    return sourceToStatus(source, "disabled");
  }

  if (!latestCheck) {
    return sourceToStatus(source, "stale", {
      error: "No Naver Cafe collection history",
      postCount,
      stale: true,
    });
  }

  const checkedAt = toFiniteNumber(latestCheck.checked_at);
  const stale = now() - checkedAt > NAVER_CAFE_POSTS_CACHE_POLICY.staleTtlMs;
  const status =
    stale && ["ok", "stale"].includes(latestCheck.status)
      ? "stale"
      : latestCheck.status;
  return sourceToStatus(source, status, {
    error: latestCheck.error,
    postCount: Math.max(postCount, toFiniteNumber(latestCheck.post_count)),
    stale,
  });
};

export const readStoredNaverCafePostsForSources = async (
  sources: NaverCafeSourceInput[],
  options: {
    cacheDb?: D1Database;
    size?: number;
  } = {},
): Promise<NaverCafePostsResult> => {
  const size = clampMaxResults(options.size);
  const sourceIds = sources.map((source) => source.id);
  const latestChecks = await readLatestSourceChecks(options.cacheDb, sourceIds);
  const posts = await readStoredPostsForSources(options.cacheDb, sources, size);
  const sourceIdByBoard = new Map(
    sources.map((source) => [`${source.cafe_id}:${source.menu_id}`, source.id]),
  );
  const visiblePostCountBySource = new Map<number, number>();
  for (const post of posts) {
    const sourceId = sourceIdByBoard.get(`${post.cafeId}:${post.menuId}`);
    if (sourceId === undefined) continue;
    visiblePostCountBySource.set(
      sourceId,
      (visiblePostCountBySource.get(sourceId) ?? 0) + 1,
    );
  }
  const sourceResults = sources
    .map((source) =>
      storedSourceStatus(
        source,
        latestChecks.get(source.id) ?? null,
        visiblePostCountBySource.get(source.id) ?? 0,
      ),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return { posts, sources: sourceResults };
};

const writeStoredNaverCafeSourcePosts = async (
  cacheDb: D1Database | undefined,
  sources: NaverCafeSourceInput[],
  posts: NaverCafePostItem[],
  fetchedAt: number,
) => {
  if (!cacheDb || posts.length === 0) return;

  const sourceKeyToId = new Map(
    sources.map((source) => [`${source.cafe_id}:${source.menu_id}`, source.id]),
  );
  const records = posts.flatMap((post) => {
    const sourceId = sourceKeyToId.get(`${post.cafeId}:${post.menuId}`);
    return sourceId ? [{ post, sourceId }] : [];
  });

  // A post uses 18 bindings. Five rows keep each D1 statement below the
  // 100-bind ceiling while collapsing the former per-post write loop.
  for (let index = 0; index < records.length; index += 5) {
    const chunk = records.slice(index, index + 5);
    const placeholders = chunk.map(() =>
      "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)"
    ).join(", ");
    const bindings = chunk.flatMap(({ post, sourceId }) => [
      post.id,
      post.articleId,
      sourceId,
      post.sourceName,
      post.cafeId,
      post.menuId,
      post.memberUid,
      post.title,
      post.summary,
      post.createdAt,
      post.url,
      post.thumbnailUrl,
      post.metrics.commentCount,
      post.metrics.readCount,
      post.metrics.likeCount,
      post.isNew ? 1 : 0,
      fetchedAt,
      fetchedAt,
    ]);
    await cacheDb
      .prepare(
        `INSERT INTO naver_cafe_posts (
           id, article_id, source_id, source_name, cafe_id, menu_id,
           member_uid, title, summary, created_at, url, thumbnail_url,
           comment_count, read_count, like_count, is_new, first_seen_at,
           fetched_at, hidden_at, hidden_reason, content_removed_at
         )
         VALUES ${placeholders}
         ON CONFLICT(id) DO UPDATE SET
           source_id = excluded.source_id,
           source_name = excluded.source_name,
           cafe_id = excluded.cafe_id,
           menu_id = excluded.menu_id,
           member_uid = excluded.member_uid,
           title = excluded.title,
           summary = excluded.summary,
           created_at = excluded.created_at,
           url = excluded.url,
           thumbnail_url = excluded.thumbnail_url,
           comment_count = excluded.comment_count,
           read_count = excluded.read_count,
           like_count = excluded.like_count,
           is_new = excluded.is_new,
           fetched_at = excluded.fetched_at,
           hidden_at = NULL,
           hidden_reason = NULL,
           content_removed_at = NULL
         WHERE COALESCE(naver_cafe_posts.hidden_reason, '') <> 'admin'
           AND (naver_cafe_posts.source_id IS NOT excluded.source_id
            OR naver_cafe_posts.source_name IS NOT excluded.source_name
            OR naver_cafe_posts.cafe_id IS NOT excluded.cafe_id
            OR naver_cafe_posts.menu_id IS NOT excluded.menu_id
            OR naver_cafe_posts.member_uid IS NOT excluded.member_uid
            OR naver_cafe_posts.title IS NOT excluded.title
            OR naver_cafe_posts.summary IS NOT excluded.summary
            OR naver_cafe_posts.created_at IS NOT excluded.created_at
            OR naver_cafe_posts.url IS NOT excluded.url
            OR naver_cafe_posts.thumbnail_url IS NOT excluded.thumbnail_url
            OR naver_cafe_posts.comment_count IS NOT excluded.comment_count
            OR naver_cafe_posts.read_count IS NOT excluded.read_count
            OR naver_cafe_posts.like_count IS NOT excluded.like_count
            OR naver_cafe_posts.is_new IS NOT excluded.is_new
            OR naver_cafe_posts.hidden_at IS NOT NULL)`,
      )
      .bind(...bindings)
      .run();
  }
};

const writeNaverCafeSourceChecks = async (
  cacheDb: D1Database | undefined,
  trigger: NaverCafeCollectionTrigger,
  checkedAt: number,
  durationMs: number,
  sources: NaverCafeSourceResult[],
) => {
  if (!cacheDb || sources.length === 0) return;

  for (let index = 0; index < sources.length; index += 10) {
    const chunk = sources.slice(index, index + 10);
    const placeholders = chunk.map(() =>
      "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).join(", ");
    const bindings = chunk.flatMap((source) => [
      source.id,
      source.name,
      source.cafeId,
      source.menuId,
      trigger,
      source.status,
      checkedAt,
      durationMs,
      source.postCount,
      source.error,
    ]);
    await cacheDb
      .prepare(
        `INSERT INTO naver_cafe_source_checks (
           source_id, source_name, cafe_id, menu_id, trigger, status,
           checked_at, duration_ms, post_count, error
         ) VALUES ${placeholders}`,
      )
      .bind(...bindings)
      .run();
  }
};

const errorSourcesFromDiagnostics = (
  sources: NaverCafeSourceInput[],
  error: NaverCafeApiError,
) => {
  const diagnostics = new Map(
    error.diagnostics.map((item) => [item.sourceId, item]),
  );
  return sources.map((source) => {
    const diagnostic = diagnostics.get(source.id);
    return sourceToStatus(source, diagnostic?.status ?? "error", {
      error: diagnostic?.error ?? error.message,
    });
  });
};

export const collectNaverCafePostsForSources = async (
  sources: NaverCafeSourceInput[],
  options: {
    cacheDb?: D1Database;
    size?: number;
    trigger: NaverCafeCollectionTrigger;
  },
): Promise<NaverCafeCollectionResult> => {
  const startedAt = now();
  let posts: NaverCafePostItem[] = [];
  let sourceResults: NaverCafeSourceResult[] = [];

  const collectionEnabled = options.cacheDb
    ? await options.cacheDb.prepare(
        `SELECT value FROM settings WHERE key = ?`,
      ).bind(NAVER_CAFE_COLLECTION_ENABLED_SETTING_KEY)
        .first<{ value: string | null }>()
    : null;
  if (collectionEnabled?.value === "false") {
    const checkedAt = now();
    return {
      success: true,
      updatedAt: new Date(checkedAt).toISOString(),
      checkedAt,
      durationMs: checkedAt - startedAt,
      posts: [],
      sources: sources.map((source) => sourceToStatus(source, "disabled", {
        error: "collection_kill_switch",
      })),
    };
  }

  try {
    const collected = await pMap(
      sources,
      async (source) => {
        if (!normalizeBoolean(source.enabled)) {
          return { posts: [], source: sourceToStatus(source, "disabled") };
        }
        try {
          const result = await collectNaverSourceNewFeed(source, options.cacheDb);
          return {
            posts: result.posts,
            source: sourceToStatus(source, "ok", {
              postCount: result.posts.length,
            }),
          };
        } catch (error) {
          return {
            posts: [],
            source: sourceToStatus(
              source,
              error instanceof NaverCafeSourceError ? error.status : "error",
              { error: error instanceof Error ? error.message : "collection_failed" },
            ),
          };
        }
      },
      NAVER_CAFE_FETCH_CONCURRENCY,
    );
    posts = collected.flatMap((item) => item.posts);
    sourceResults = collected.map((item) => item.source);
  } catch (error) {
    sourceResults =
      error instanceof NaverCafeApiError
        ? errorSourcesFromDiagnostics(sources, error)
        : sources.map((source) =>
            sourceToStatus(source, "error", {
              error:
                error instanceof Error
                  ? error.message
                  : "Failed to fetch Naver Cafe posts",
            }),
          );
  }

  const checkedAt = now();
  const durationMs = checkedAt - startedAt;
  await writeStoredNaverCafeSourcePosts(
    options.cacheDb,
    sources,
    posts,
    checkedAt,
  );
  await writeNaverCafeSourceChecks(
    options.cacheDb,
    options.trigger,
    checkedAt,
    durationMs,
    sourceResults,
  );

  return {
    success: sourceResults.every((source) =>
      ["ok", "stale", "disabled"].includes(source.status),
    ),
    updatedAt: new Date(checkedAt).toISOString(),
    checkedAt,
    durationMs,
    posts,
    sources: sourceResults,
  };
};

export const readEnabledNaverCafeSources = async (env: Env) =>
  getDb(env)
    .select()
    .from(naverCafeSources)
    .where(
      and(
        sql`${naverCafeSources.enabled} IS NULL OR ${naverCafeSources.enabled} = 1`,
        isNull(naverCafeSources.archived_at),
      ),
    )
    .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));

export const runScheduledNaverCafeCollection = async (env: Env) => {
  const db = getDb(env);
  const lastRun = Number.parseInt(
    (await getSetting(db, NAVER_CAFE_COLLECTION_LAST_RUN_SETTING_KEY)) ?? "",
    10,
  );
  const currentTime = now();
  const elapsedMs = Number.isFinite(lastRun)
    ? currentTime - lastRun
    : Number.POSITIVE_INFINITY;
  if (elapsedMs < NAVER_CAFE_SCHEDULED_INTERVAL_MS) {
    return {
      skipped: true as const,
      reason: "interval_not_elapsed" as const,
      intervalHours: 1,
      lastRun: Number.isFinite(lastRun) ? lastRun : null,
      elapsedMs,
    };
  }

  const sources = await readEnabledNaverCafeSources(env);
  const result =
    sources.length === 0
      ? {
          success: true,
          updatedAt: new Date(currentTime).toISOString(),
          checkedAt: currentTime,
          durationMs: 0,
          posts: [],
          sources: [],
        }
      : await collectNaverCafePostsForSources(sources, {
          cacheDb: env.otw_db,
          size: NAVER_CAFE_COLLECTION_SIZE,
          trigger: "scheduled",
        });

  await updateSetting(
    db,
    NAVER_CAFE_COLLECTION_LAST_RUN_SETTING_KEY,
    String(result.checkedAt),
  );

  return {
    skipped: false as const,
    intervalHours: 1,
    lastRun: Number.isFinite(lastRun) ? lastRun : null,
    elapsedMs,
    result,
  };
};

export const clearNaverCafeServiceCachesForTests = () => {
  SOURCE_POSTS_CACHE.clear();
};
