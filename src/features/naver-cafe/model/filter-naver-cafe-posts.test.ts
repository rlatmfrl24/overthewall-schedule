import { describe, expect, it } from "vitest";
import type { NaverCafePostDto } from "@contracts/naver-cafe";
import { filterNaverCafePostsByMembers } from "./filter-naver-cafe-posts";

const makePost = (
  id: string,
  memberUid: number | null,
): NaverCafePostDto => ({
  id,
  articleId: 1,
  cafeId: "1",
  menuId: "1",
  sourceName: "게시판",
  memberUid,
  title: "글",
  summary: "",
  createdAt: "2026-05-27T00:00:00Z",
  url: `https://cafe.naver.com/articles/${id}`,
  thumbnailUrl: null,
  metrics: { commentCount: 0, readCount: 0, likeCount: 0 },
  isNew: false,
});

describe("filterNaverCafePostsByMembers", () => {
  it("선택된 멤버가 없으면 원본 배열을 반환한다", () => {
    const posts = [makePost("p1", 1)];

    expect(filterNaverCafePostsByMembers(posts, null)).toBe(posts);
  });

  it("memberUid가 일치하는 게시글만 남긴다", () => {
    const posts = [
      makePost("p1", 1),
      makePost("p2", 2),
      makePost("p3", null),
    ];

    expect(
      filterNaverCafePostsByMembers(posts, [2]).map((post) => post.id),
    ).toEqual(["p2"]);
  });
});
