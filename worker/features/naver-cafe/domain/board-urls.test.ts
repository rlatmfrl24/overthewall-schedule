import { describe, expect, it } from "vitest";
import {
  buildNaverCafeArticleUrl,
  buildNaverCafeBoardUrl,
  extractNaverCafeBoardIds,
  isValidNaverCafeId,
} from "./board-urls";

describe("Naver Cafe board URL domain helpers", () => {
  it("숫자 ID의 공백과 1~20자리 경계를 검증한다", () => {
    expect(isValidNaverCafeId("0")).toBe(true);
    expect(isValidNaverCafeId(" 123 ")).toBe(true);
    expect(isValidNaverCafeId("12345678901234567890")).toBe(true);

    expect(isValidNaverCafeId("")).toBe(false);
    expect(isValidNaverCafeId("123456789012345678901")).toBe(false);
    expect(isValidNaverCafeId("-1")).toBe(false);
    expect(isValidNaverCafeId("1.5")).toBe(false);
    expect(isValidNaverCafeId("12a")).toBe(false);
  });

  it("현재 f-e 게시판 URL에서 cafeId와 menuId를 추출한다", () => {
    expect(
      extractNaverCafeBoardIds(
        " https://cafe.naver.com/f-e/cafes/12345/menus/67890 ",
      ),
    ).toEqual({ cafeId: "12345", menuId: "67890" });
    expect(
      extractNaverCafeBoardIds(
        "cafe.naver.com/F-E/cafes/7/menus/8?viewType=L",
      ),
    ).toEqual({ cafeId: "7", menuId: "8" });
  });

  it.each([
    [
      "https://cafe.naver.com/ArticleList.nhn?clubid=101&menuid=202",
      { cafeId: "101", menuId: "202" },
    ],
    [
      "https://cafe.naver.com/ArticleList.nhn?search.clubid=303&search.menuid=404",
      { cafeId: "303", menuId: "404" },
    ],
    [
      "cafe.naver.com/ArticleList.nhn?cafeId=505&menuId=606",
      { cafeId: "505", menuId: "606" },
    ],
  ])("지원하는 query parameter 조합을 추출한다: %s", (url, expected) => {
    expect(extractNaverCafeBoardIds(url)).toEqual(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "   ",
    "not-a-board-url",
    "https://%",
    "https://cafe.naver.com/ArticleList.nhn?clubid=1",
    "https://cafe.naver.com/ArticleList.nhn?menuid=2",
    "https://cafe.naver.com/ArticleList.nhn?clubid=abc&menuid=2",
    "https://cafe.naver.com/ArticleList.nhn?clubid=1&menuid=123456789012345678901",
  ])("비어 있거나 불완전하고 잘못된 URL은 거부한다: %s", (value) => {
    expect(extractNaverCafeBoardIds(value)).toBeNull();
  });

  it("게시판과 게시글 canonical URL을 생성한다", () => {
    expect(buildNaverCafeBoardUrl("123", "456")).toBe(
      "https://cafe.naver.com/f-e/cafes/123/menus/456",
    );
    expect(buildNaverCafeArticleUrl("123", "456", 789)).toBe(
      "https://cafe.naver.com/f-e/cafes/123/articles/789?menuid=456",
    );
  });
});
