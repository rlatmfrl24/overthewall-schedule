import type { NaverCafeSource } from "../../src/db/schema";
import {
  buildNaverCafeArticleUrl,
  buildNaverCafeBoardUrl,
} from "../../src/lib/naver-cafe";
import { pMap } from "../utils/helpers";

type NaverCafeSourceInput = Pick<
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

type NaverCafePostItem = {
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

type NaverCafeSourceStatus =
  | "ok"
  | "stale"
  | "error"
  | "private"
  | "invalid_response"
  | "disabled";

type NaverCafeSourceResult = {
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

type NaverCafePostsResult = {
  posts: NaverCafePostItem[];
  sources: NaverCafeSourceResult[];
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
const NAVER_CAFE_POSTS_TTL_MS = 10 * 60_000;
const NAVER_CAFE_POSTS_STALE_TTL_MS = 6 * 60 * 60_000;
const NAVER_CAFE_FETCH_CONCURRENCY = 3;
const NAVER_CAFE_FETCH_TIMEOUT_MS = 5_000;
const NAVER_CAFE_CACHE_VERSION = "v1";

const SOURCE_POSTS_CACHE = new Map<string, CachedSourcePosts>();

const now = () => Date.now();

const clampMaxResults = (value: number | undefined) => {
  if (!Number.isFinite(value)) return 10;
  return Math.min(20, Math.max(5, Math.trunc(value ?? 10)));
};

const getCacheKey = (source: NaverCafeSourceInput, size: number) =>
  `naver-cafe:${NAVER_CAFE_CACHE_VERSION}:${source.id}:${source.cafe_id}:${source.menu_id}:${size}`;

const isFresh = (entry: CachedSourcePosts) => now() < entry.expiresAt;

const isStaleUsable = (entry: CachedSourcePosts) =>
  now() - entry.fetchedAt < NAVER_CAFE_POSTS_STALE_TTL_MS;

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
): Promise<{ posts: NaverCafePostItem[]; source: NaverCafeSourceResult }> => {
  const cacheKey = getCacheKey(source, size);
  const cached = SOURCE_POSTS_CACHE.get(cacheKey);
  if (cached && isFresh(cached)) {
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
      expiresAt: now() + NAVER_CAFE_POSTS_TTL_MS,
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
  options: { size?: number } = {},
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
    (source) => fetchPostsForSource(source, size),
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

export const clearNaverCafeServiceCachesForTests = () => {
  SOURCE_POSTS_CACHE.clear();
};
