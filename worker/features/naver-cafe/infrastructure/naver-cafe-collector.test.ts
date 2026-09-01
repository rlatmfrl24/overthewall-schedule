import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNaverCafeServiceCachesForTests,
  collectNaverCafePostsForSources,
  fetchNaverCafePostsForSources,
  normalizeNaverCafeBoardListResponse,
  readStoredNaverCafePostsForSources,
} from "./naver-cafe-collector";

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const source = {
  id: 1,
  name: "나츠키",
  cafe_id: "31352147",
  menu_id: "9",
  cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
  member_uid: 10,
  enabled: true,
  sort_order: 0,
};

const initializedSource = {
  ...source,
  collection_started_at: Date.parse("2026-05-27T00:00:00Z"),
  initialization_completed_at: Date.parse("2026-05-27T00:01:00Z"),
  last_seen_article_id: 44096,
};

const boardResponse = {
  result: {
    articleList: [
      {
        type: "ARTICLE",
        item: {
          articleId: 44096,
          cafeId: 31352147,
          menuId: 9,
          subject: "목욕탕 다녀온 오니",
          summary: "때밀었더니 시원합니다",
          writeDateTimestamp: 1779892677417,
          representImage: "https://example.com/thumb.jpg",
          commentCount: 10,
          readCount: 199,
          likeCount: 76,
          newArticle: true,
        },
      },
    ],
  },
};

type StoredPostRow = {
  id: string;
  article_id: number;
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
  comment_count: number;
  read_count: number;
  like_count: number;
  is_new: number;
  fetched_at: number;
  hidden_at: number | null;
};

type StoredCheckRow = {
  id: number;
  source_id: number;
  source_name: string;
  cafe_id: string;
  menu_id: string;
  trigger: "manual" | "scheduled";
  status: string;
  checked_at: number;
  duration_ms: number;
  post_count: number;
  error: string | null;
};

const makeD1Store = (
  initialPosts: StoredPostRow[] = [],
  initialChecks: StoredCheckRow[] = [],
) => {
  const posts = new Map(initialPosts.map((post) => [post.id, post]));
  const checks = [...initialChecks];
  const prepare = vi.fn((sql: string) => {
    let bound: unknown[] = [];
    const statement = {
      bind: vi.fn((...params: unknown[]) => {
        bound = params;
        return statement;
      }),
      all: vi.fn(async () => {
        if (sql.includes("FROM naver_cafe_source_checks")) {
          const ids = new Set(bound.map(Number));
          return {
            results: checks
              .filter((row) => ids.has(row.source_id))
              .sort((a, b) => b.checked_at - a.checked_at),
          };
        }
        if (sql.includes("FROM naver_cafe_posts")) {
          const [sourceId, limit] = bound.map(Number);
          return {
            results: [...posts.values()]
              .filter((row) => row.source_id === sourceId && row.hidden_at === null)
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime() || b.id.localeCompare(a.id),
              )
              .slice(0, limit),
          };
        }
        throw new Error(`Unexpected D1 all SQL: ${sql}`);
      }),
      first: vi.fn(async () => {
        if (sql.includes("FROM settings")) return null;
        if (sql.includes("UPDATE naver_cafe_usage_daily")) {
          return { requests_used: 1 };
        }
        throw new Error(`Unexpected D1 first SQL: ${sql}`);
      }),
      run: vi.fn(async () => {
        if (
          sql.includes("INSERT INTO naver_cafe_usage_daily") ||
          sql.includes("UPDATE naver_cafe_sources")
        ) {
          return { success: true };
        }
        if (sql.includes("INSERT INTO naver_cafe_posts")) {
          const [
            id,
            articleId,
            sourceId,
            sourceName,
            cafeId,
            menuId,
            memberUid,
            title,
            summary,
            createdAt,
            url,
            thumbnailUrl,
            commentCount,
            readCount,
            likeCount,
            isNew,
            fetchedAt,
          ] = bound;
          posts.set(String(id), {
            id: String(id),
            article_id: Number(articleId),
            source_id: Number(sourceId),
            source_name: String(sourceName),
            cafe_id: String(cafeId),
            menu_id: String(menuId),
            member_uid: memberUid === null ? null : Number(memberUid),
            title: String(title),
            summary: String(summary),
            created_at: String(createdAt),
            url: String(url),
            thumbnail_url: thumbnailUrl === null ? null : String(thumbnailUrl),
            comment_count: Number(commentCount),
            read_count: Number(readCount),
            like_count: Number(likeCount),
            is_new: Number(isNew),
            fetched_at: Number(fetchedAt),
            hidden_at: null,
          });
          return { success: true };
        }
        if (sql.includes("INSERT INTO naver_cafe_source_checks")) {
          const [
            sourceId,
            sourceName,
            cafeId,
            menuId,
            trigger,
            status,
            checkedAt,
            durationMs,
            postCount,
            error,
          ] = bound;
          checks.push({
            id: checks.length + 1,
            source_id: Number(sourceId),
            source_name: String(sourceName),
            cafe_id: String(cafeId),
            menu_id: String(menuId),
            trigger: trigger as "manual" | "scheduled",
            status: String(status),
            checked_at: Number(checkedAt),
            duration_ms: Number(durationMs),
            post_count: Number(postCount),
            error: error === null ? null : String(error),
          });
          return { success: true };
        }
        throw new Error(`Unexpected D1 run SQL: ${sql}`);
      }),
    };
    return statement;
  });

  return {
    db: { prepare } as unknown as D1Database,
    posts,
    checks,
  };
};

describe("naver cafe worker service", () => {
  beforeEach(() => {
    clearNaverCafeServiceCachesForTests();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("게시판 목록 응답을 피드 카드 데이터로 정규화한다", () => {
    const posts = normalizeNaverCafeBoardListResponse(boardResponse, source);

    expect(posts[0]).toMatchObject({
      id: "31352147:9:44096",
      articleId: 44096,
      cafeId: "31352147",
      menuId: "9",
      sourceName: "나츠키",
      memberUid: 10,
      title: "목욕탕 다녀온 오니",
      summary: "때밀었더니 시원합니다",
      thumbnailUrl: "https://example.com/thumb.jpg",
      metrics: {
        commentCount: 10,
        readCount: 199,
        likeCount: 76,
      },
      isNew: true,
    });
    expect(posts[0]?.createdAt).toBe("2026-05-27T14:37:57.417Z");
    expect(posts[0]?.url).toContain("/f-e/cafes/31352147/articles/44096");
  });

  it("소스별 최신글을 호출하고 최신순으로 합친다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(boardResponse));

    const result = await fetchNaverCafePostsForSources([source], { size: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/v1/cafes/31352147/menus/9/articles?page=1&size=5",
    );
    expect(result.posts[0]?.articleId).toBe(44096);
    expect(result.sources[0]).toMatchObject({
      id: 1,
      status: "ok",
      postCount: 1,
      stale: false,
    });
  });

  it("fresh memory cache가 있으면 외부 API를 다시 호출하지 않는다", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(boardResponse));

    await fetchNaverCafePostsForSources([source], { size: 5 });
    const second = await fetchNaverCafePostsForSources([source], { size: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.posts[0]?.articleId).toBe(44096);
  });

  it("수집 경로는 fresh memory cache가 있어도 외부 API를 다시 호출한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(boardResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          result: {
            articleList: [
              {
                type: "ARTICLE",
                item: {
                  articleId: 44097,
                  cafeId: 31352147,
                  menuId: 9,
                  subject: "새로 수집한 글",
                  summary: "수동 수집으로 갱신된 글입니다",
                  writeDateTimestamp: 1779896277417,
                  commentCount: 1,
                  readCount: 2,
                  likeCount: 3,
                  newArticle: true,
                },
              },
            ],
          },
        }),
      );
    const store = makeD1Store();

    await fetchNaverCafePostsForSources([source], { size: 5 });
    const result = await collectNaverCafePostsForSources([initializedSource], {
      cacheDb: store.db,
      size: 5,
      trigger: "manual",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.posts[0]).toMatchObject({
      id: "31352147:9:44097",
      title: "새로 수집한 글",
    });
    expect(store.posts.get("31352147:9:44097")).toMatchObject({
      source_id: 1,
      title: "새로 수집한 글",
      comment_count: 1,
    });
    expect(store.posts.has("31352147:9:44096")).toBe(false);
  });

  it("API 실패 시 캐시가 있으면 stale 데이터로 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(boardResponse));

    await fetchNaverCafePostsForSources([source], { size: 5 });
    vi.setSystemTime(new Date("2026-05-28T00:20:00Z"));
    fetchMock.mockResolvedValueOnce(new Response("fail", { status: 500 }));

    const result = await fetchNaverCafePostsForSources([source], { size: 5 });

    expect(result.posts[0]?.articleId).toBe(44096);
    expect(result.sources[0]).toMatchObject({
      status: "stale",
      stale: true,
    });
  });

  it("캐시 없이 모든 소스가 실패하면 502 오류를 던진다", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("forbidden", { status: 403 }));

    await expect(fetchNaverCafePostsForSources([source], { size: 5 })).rejects.toMatchObject({
      status: 502,
      diagnostics: [
        expect.objectContaining({
          sourceId: 1,
          status: "private",
        }),
      ],
    });
  });

  it("scheduled 최초 수집은 현재 글을 watermark로만 기록하고 저장하지 않는다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:00:00Z"));
    vi.mocked(fetch).mockResolvedValue(jsonResponse(boardResponse));
    const store = makeD1Store();

    const result = await collectNaverCafePostsForSources([source], {
      cacheDb: store.db,
      size: 5,
      trigger: "scheduled",
    });

    expect(result.success).toBe(true);
    expect(store.posts.has("31352147:9:44096")).toBe(false);
    expect(store.checks[0]).toMatchObject({
      source_id: 1,
      trigger: "scheduled",
      status: "ok",
      post_count: 0,
      error: null,
    });
  });

  it("저장 게시글 조회는 외부 API 없이 D1 rows와 최신 source check만 반환한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-28T00:00:00Z"));
    const fetchMock = vi.mocked(fetch);
    const store = makeD1Store(
      [
        {
          id: "31352147:9:44096",
          article_id: 44096,
          source_id: 1,
          source_name: "나츠키",
          cafe_id: "31352147",
          menu_id: "9",
          member_uid: 10,
          title: "저장된 글",
          summary: "D1에서 읽은 요약",
          created_at: "2026-05-27T14:37:57.417Z",
          url: "https://cafe.naver.com/f-e/cafes/31352147/articles/44096",
          thumbnail_url: null,
          comment_count: 3,
          read_count: 11,
          like_count: 7,
          is_new: 0,
          fetched_at: Date.now() - 10_000,
          hidden_at: null,
        },
      ],
      [
        {
          id: 1,
          source_id: 1,
          source_name: "나츠키",
          cafe_id: "31352147",
          menu_id: "9",
          trigger: "scheduled",
          status: "ok",
          checked_at: Date.now() - 10_000,
          duration_ms: 80,
          post_count: 1,
          error: null,
        },
      ],
    );

    const result = await readStoredNaverCafePostsForSources([source], {
      cacheDb: store.db,
      size: 5,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.posts[0]).toMatchObject({
      id: "31352147:9:44096",
      title: "저장된 글",
      metrics: {
        commentCount: 3,
        readCount: 11,
        likeCount: 7,
      },
    });
    expect(result.sources[0]).toMatchObject({
      id: 1,
      status: "ok",
      postCount: 1,
      stale: false,
    });
  });
});
