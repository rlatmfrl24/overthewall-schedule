// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NaverCafePostDto } from "@contracts/naver-cafe";
import { NaverCafePostCard } from "./naver-cafe-post-card";

const post: NaverCafePostDto = {
  id: "31352147:9:44096",
  articleId: 44096,
  cafeId: "31352147",
  menuId: "9",
  sourceName: "나츠키",
  memberUid: 1,
  title: "목욕탕 다녀온 오니",
  summary: "때밀었더니 시원합니다",
  createdAt: "2026-05-27T14:37:57.417Z",
  url: "https://cafe.naver.com/f-e/cafes/31352147/articles/44096?menuid=9",
  thumbnailUrl: "https://example.com/thumb.jpg",
  metrics: {
    commentCount: 10,
    readCount: 199,
    likeCount: 76,
  },
  isNew: true,
};

describe("NaverCafePostCard", () => {
  afterEach(cleanup);

  it("제목, 요약, no-referrer 썸네일과 원문 링크를 표시한다", () => {
    const { container } = render(createElement(NaverCafePostCard, { post }));

    expect(screen.getByText(post.title)).toBeTruthy();
    expect(screen.getByText(post.summary)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /원문 보기/ }).getAttribute("href"),
    ).toBe(post.url);
    expect(
      container
        .querySelector('img[src="https://example.com/thumb.jpg"]')
        ?.getAttribute("referrerpolicy"),
    ).toBe("no-referrer");
    expect(screen.getByText("새 글")).toBeTruthy();
    expect(screen.getByLabelText("댓글 10개")).toBeTruthy();
    expect(screen.getByLabelText("조회 199회")).toBeTruthy();
    expect(screen.getByLabelText("좋아요 76개")).toBeTruthy();
  });

  it("카드·본문은 이동하지 않고 썸네일은 내부 이미지 뷰어를 연다", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(createElement(NaverCafePostCard, { post }));
    fireEvent.click(screen.getByRole("article"));
    fireEvent.click(screen.getByText(post.summary));
    fireEvent.click(screen.getByRole("button", { name: /이미지 1 확대/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
