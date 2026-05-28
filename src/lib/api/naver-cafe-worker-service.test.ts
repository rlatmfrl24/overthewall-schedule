import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNaverCafeServiceCachesForTests,
  fetchNaverCafePostsForSources,
  normalizeNaverCafeBoardListResponse,
} from "../../../worker/services/naver-cafe";

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
});
