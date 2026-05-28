import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNaverCafeSource,
  deleteNaverCafeSource,
  extractNaverCafeBoardIds,
  fetchNaverCafePosts,
  fetchNaverCafePostsConfig,
  fetchNaverCafeSources,
  updateNaverCafeSource,
} from "./naver-cafe";

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  apiFetch: apiFetchMock,
}));

describe("naver-cafe api helpers", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it("게시판 URL에서 cafeId와 menuId를 추출한다", () => {
    expect(
      extractNaverCafeBoardIds(
        "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
      ),
    ).toEqual({ cafeId: "31352147", menuId: "9" });
    expect(
      extractNaverCafeBoardIds(
        "https://cafe.naver.com/ArticleList.nhn?search.clubid=31352147&search.menuid=10",
      ),
    ).toEqual({ cafeId: "31352147", menuId: "10" });
    expect(extractNaverCafeBoardIds("https://example.com")).toBeNull();
  });

  it("config, sources, posts endpoint를 호출한다", async () => {
    apiFetchMock
      .mockResolvedValueOnce({ enabled: true, visibility: "members" })
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ updatedAt: "", posts: [], sources: [] });

    await fetchNaverCafePostsConfig({ force: true });
    await fetchNaverCafeSources();
    await createNaverCafeSource({
      name: "나츠키",
      cafe_id: "31352147",
      menu_id: "9",
      cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
      member_uid: 1,
      enabled: true,
      sort_order: 0,
    });
    await updateNaverCafeSource({
      id: 2,
      name: "테리",
      cafe_id: "31352147",
      menu_id: "10",
      cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/10",
      member_uid: null,
      enabled: false,
      sort_order: 3,
    });
    await deleteNaverCafeSource(2);
    await fetchNaverCafePosts({ size: 30, force: true });

    expect(apiFetchMock).toHaveBeenNthCalledWith(1, "/api/naver-cafe/config", {
      cache: "no-store",
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(2, "/api/naver-cafe/sources");
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, "/api/naver-cafe/sources", {
      method: "POST",
      json: expect.objectContaining({ cafe_id: "31352147", menu_id: "9" }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(4, "/api/naver-cafe/sources", {
      method: "PUT",
      json: expect.objectContaining({ id: 2, enabled: false }),
    });
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      5,
      "/api/naver-cafe/sources?id=2",
      { method: "DELETE" },
    );
    expect(apiFetchMock).toHaveBeenNthCalledWith(
      6,
      expect.stringMatching(/^\/api\/naver-cafe\/posts\?size=20&_/),
      { cache: "no-store" },
    );
  });

  it("관리자 모니터링 요청은 admin 파라미터를 포함한다", async () => {
    apiFetchMock.mockResolvedValueOnce({ updatedAt: "", posts: [], sources: [] });

    await fetchNaverCafePosts({ admin: true, size: 10 });

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/naver-cafe/posts?size=10&admin=1",
      { cache: "default" },
    );
  });
});
