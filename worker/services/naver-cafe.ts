import { asc, sql } from "drizzle-orm";
import { naverCafeSources, type NaverCafeSource } from "../../src/db/schema";
import {
  buildNaverCafeArticleUrl,
  buildNaverCafeBoardUrl,
} from "../../src/lib/naver-cafe";
import { CACHE_POLICY } from "../../src/lib/cache-policy";
import { getDb } from "../db";
import { getSetting, pMap, updateSetting } from "../utils/helpers";
import type { Env } from "../types";

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
>;

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
const NAVER_CAFE_POSTS_CACHE_POLICY = CACHE_POLICY.worker.naverCafe.posts;
const NAVER_CAFE_FETCH_CONCURRENCY = 3;
const NAVER_CAFE_FETCH_TIMEOUT_MS = 5_000;
const NAVER_CAFE_SCHEDULED_INTERVAL_MS = 60 * 60_000;
const NAVER_CAFE_COLLECTION_LAST_RUN_SETTING_KEY =
  "naver_cafe_collection_last_run";
const NAVER_CAFE_COLLECTION_SIZE = 15;

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

const createSqlPlaceholders = (count: number) =>
  Array.from({ length: count }, () => "?").join(", ");

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
) => {
  const endpoint = `${NAVER_CAFE_BOARD_API_BASE}/v1/cafes/${source.cafe_id}/menus/${source.menu_id}/articles`;
  const url = new URL(endpoint);
  url.searchParams.set("page", "1");
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
        `SELECT id, source_id, source_name, cafe_id, menu_id, trigger, status,
                checked_at, duration_ms, post_count, error
         FROM naver_cafe_source_checks
         WHERE source_id IN (${createSqlPlaceholders(sourceIds.length)})
         ORDER BY checked_at DESC, id DESC`,
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

const readStoredPostsForSource = async (
  cacheDb: D1Database | undefined,
  source: NaverCafeSourceInput,
  size: number,
) => {
  if (!cacheDb) return [];

  const rows = getD1Results<NaverCafePostRow>(
    await cacheDb
      .prepare(
        `SELECT id, article_id, source_id, source_name, cafe_id, menu_id,
                member_uid, title, summary, created_at, url, thumbnail_url,
                comment_count, read_count, like_count, is_new, fetched_at,
                hidden_at
         FROM naver_cafe_posts
         WHERE source_id = ? AND hidden_at IS NULL
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      )
      .bind(source.id, size)
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
  const sourcePosts = await Promise.all(
    sources.map(async (source) => ({
      source,
      posts: normalizeBoolean(source.enabled)
        ? await readStoredPostsForSource(options.cacheDb, source, size)
        : [],
    })),
  );
  const posts = sourcePosts
    .flatMap((item) => item.posts)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const sourceResults = sourcePosts
    .map(({ source, posts }) =>
      storedSourceStatus(source, latestChecks.get(source.id) ?? null, posts.length),
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

  for (const post of posts) {
    const sourceId = sourceKeyToId.get(`${post.cafeId}:${post.menuId}`);
    if (!sourceId) continue;
    await cacheDb
      .prepare(
        `INSERT INTO naver_cafe_posts (
           id, article_id, source_id, source_name, cafe_id, menu_id,
           member_uid, title, summary, created_at, url, thumbnail_url,
           comment_count, read_count, like_count, is_new, fetched_at, hidden_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
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
           hidden_at = NULL`,
      )
      .bind(
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
      )
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

  for (const source of sources) {
    await cacheDb
      .prepare(
        `INSERT INTO naver_cafe_source_checks (
           source_id, source_name, cafe_id, menu_id, trigger, status,
           checked_at, duration_ms, post_count, error
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
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
      )
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

  try {
    const content = await fetchNaverCafePostsForSources(sources, {
      size: options.size,
      forceRefresh: true,
    });
    posts = content.posts;
    sourceResults = content.sources;
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

  const sources = await db
    .select()
    .from(naverCafeSources)
    .where(sql`${naverCafeSources.enabled} IS NULL OR ${naverCafeSources.enabled} = 1`)
    .orderBy(asc(naverCafeSources.sort_order), asc(naverCafeSources.name));
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
