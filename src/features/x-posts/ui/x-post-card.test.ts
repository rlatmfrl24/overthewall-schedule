// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { XPostViewModel } from "../model/types";
import { XPostCard } from "./x-post-card";

const makePost = (overrides: Partial<XPostViewModel> = {}): XPostViewModel => ({
  id: "p1",
  text: "링크 확인 https://t.co/link",
  createdAt: "2026-05-27T12:00:00Z",
  url: "https://x.com/otw/status/p1",
  username: "otw",
  metrics: {
    likeCount: 1,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
  },
  media: [],
  ...overrides,
});

describe("XPostCard", () => {
  afterEach(cleanup);

  it("프리뷰 가능한 링크는 본문 링크와 별도의 카드로 한 번만 표시한다", () => {
    render(
      createElement(XPostCard, {
        post: makePost({
          text: "링크 https://t.co/link https://t.co/link",
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: "https://example.com/full",
              resolvedUrl: "https://example.com/full",
              displayUrl: "example.com/full",
              domain: "example.com",
              title: "Example Title",
              description: "Example description",
              imageUrl: "https://example.com/card.jpg",
              siteName: "Example",
              previewStatus: "ready",
            },
            {
              url: "https://t.co/link",
              expandedUrl: "https://example.com/full",
              displayUrl: "example.com/full",
              title: "Example Title",
              previewStatus: "ready",
            },
          ],
        }),
      }),
    );

    expect(screen.queryByRole("link", { name: "https://t.co/link" })).toBeNull();
    expect(screen.getAllByText("Example Title")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Example Title 열기" }).getAttribute("href"),
    ).toBe("https://example.com/full");
  });

  it("연결된 X 게시글 작성자와 본문, 미디어를 렌더링한다", () => {
    const { container } = render(
      createElement(XPostCard, {
        post: makePost({
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: "https://x.com/linked/status/9876543210",
              displayUrl: "x.com/linked/status/9876543210",
              previewStatus: "ready",
              linkedPost: {
                id: "9876543210",
                text: "linked post body",
                createdAt: "2026-05-27T11:00:00Z",
                url: "https://x.com/linked/status/9876543210",
                username: "linked",
                name: "Linked Member",
                profileImageUrl: null,
                metrics: {
                  likeCount: 7,
                  replyCount: 1,
                  repostCount: 2,
                  quoteCount: 3,
                },
                media: [
                  {
                    mediaKey: "m1",
                    type: "photo",
                    url: "https://pbs.twimg.com/media/photo.jpg",
                    previewImageUrl: null,
                    width: 1200,
                    height: 675,
                    altText: "linked media",
                  },
                ],
              },
            },
          ],
        }),
      }),
    );

    expect(screen.getByText("Linked Member")).toBeTruthy();
    expect(screen.getByText("linked post body")).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pbs.twimg.com/media/photo.jpg"]'),
    ).toBeTruthy();
  });

  it("프리뷰 정보가 없는 링크는 본문 원문 링크를 유지한다", () => {
    render(
      createElement(XPostCard, {
        post: makePost({
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: null,
              displayUrl: null,
            },
          ],
        }),
      }),
    );

    expect(
      screen.getByRole("link", { name: "https://t.co/link" }).getAttribute("href"),
    ).toBe("https://t.co/link");
  });

  it("생략된 X status 프리뷰도 인라인 X 게시글 카드로 표시한다", () => {
    render(
      createElement(XPostCard, {
        post: makePost({
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: "https://x.com/linked/status/9876543210",
              displayUrl: "x.com/linked/status/9876543210",
              previewStatus: "skipped",
            },
          ],
        }),
      }),
    );

    expect(screen.getByText("X 게시글 링크")).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "x.com/linked/status/9876543210 열기",
        })
        .getAttribute("href"),
    ).toBe("https://x.com/linked/status/9876543210");
  });
});
