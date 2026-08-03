// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { XPostViewModel } from "../model/types";
import { XPostCard } from "./x-post-card";

const fetchXPostContextMock = vi.hoisted(() => vi.fn());

vi.mock("../api/x-posts-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/x-posts-api")>()),
  fetchXPostContext: fetchXPostContextMock,
}));

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

const renderCard = (post: XPostViewModel, props = {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(XPostCard, { post, ...props }),
    ),
  );
};

describe("XPostCard", () => {
  beforeEach(() => {
    fetchXPostContextMock.mockReset();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("프리뷰 가능한 링크는 본문 링크와 별도의 카드로 한 번만 표시한다", () => {
    renderCard(
      makePost({
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
    );

    expect(screen.queryByRole("link", { name: "https://t.co/link" })).toBeNull();
    expect(screen.getAllByText("Example Title")).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Example Title 열기" }).getAttribute("href"),
    ).toBe("https://example.com/full");
  });

  it("연결된 X 게시글 작성자와 본문, 미디어를 렌더링한다", () => {
    const { container } = renderCard(
      makePost({
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
    );

    expect(screen.getByText("Linked Member")).toBeTruthy();
    expect(screen.getByText("linked post body")).toBeTruthy();
    expect(
      container.querySelector('img[src="https://pbs.twimg.com/media/photo.jpg"]'),
    ).toBeTruthy();
  });

  it("프리뷰 정보가 없는 링크는 본문 원문 링크를 유지한다", () => {
    renderCard(
      makePost({
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: null,
              displayUrl: null,
            },
          ],
      }),
    );

    expect(
      screen.getByRole("link", { name: "https://t.co/link" }).getAttribute("href"),
    ).toBe("https://t.co/link");
  });

  it("생략된 X status 프리뷰도 인라인 X 게시글 카드로 표시한다", () => {
    renderCard(
      makePost({
          links: [
            {
              url: "https://t.co/link",
              expandedUrl: "https://x.com/linked/status/9876543210",
              displayUrl: "x.com/linked/status/9876543210",
              previewStatus: "skipped",
            },
          ],
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

  it("구조화된 인용 카드를 표시하고 같은 t.co 링크는 중복 렌더링하지 않는다", () => {
    const quoteId = "2059529979700846500";
    renderCard(
      makePost({
        id: "2059529979700846592",
        text: "인용 내용 https://t.co/quote",
        links: [
          {
            url: "https://t.co/quote",
            expandedUrl: `https://x.com/linked/status/${quoteId}`,
            displayUrl: `x.com/linked/status/${quoteId}`,
            previewStatus: "ready",
          },
        ],
        quote: {
          postId: quoteId,
          post: {
            id: quoteId,
            text: "quoted post body",
            createdAt: "2026-05-27T11:00:00Z",
            url: `https://x.com/linked/status/${quoteId}`,
            username: "linked",
            name: "Linked Member",
            profileImageUrl: null,
            metrics: {
              likeCount: 0,
              replyCount: 0,
              repostCount: 0,
              quoteCount: 0,
            },
            media: [],
          },
        },
      }),
    );

    expect(screen.getByText("인용")).toBeTruthy();
    expect(screen.getByText("인용 게시글")).toBeTruthy();
    expect(screen.getAllByText("quoted post body")).toHaveLength(1);
    expect(screen.queryByText("https://t.co/quote")).toBeNull();
  });

  it("관련 트윗은 사용자가 요청한 뒤 바로 위 글 1건만 조회하고 토글한다", async () => {
    const sourcePostId = "2059529979700846592";
    const replyToPostId = "2059529979700846500";
    fetchXPostContextMock.mockResolvedValue({
      sourcePostId,
      replyTo: {
        id: replyToPostId,
        text: "parent post body",
        createdAt: "2026-05-27T11:00:00Z",
        url: `https://x.com/parent/status/${replyToPostId}`,
        username: "parent",
        name: "Parent Member",
        profileImageUrl: null,
        metrics: {
          likeCount: 0,
          replyCount: 0,
          repostCount: 0,
          quoteCount: 0,
        },
        media: [],
      },
    });
    renderCard(
      makePost({
        id: sourcePostId,
        reply: { postId: replyToPostId, conversationId: replyToPostId },
      }),
    );

    expect(fetchXPostContextMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "관련 트윗 보기" }));

    await waitFor(() => {
      expect(screen.getByText("parent post body")).toBeTruthy();
    });
    expect(fetchXPostContextMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText("답글 대상")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "관련 트윗 숨기기" }));
    expect(screen.queryByText("parent post body")).toBeNull();
    expect(
      screen.getByRole("button", { name: "관련 트윗 보기" }),
    ).toBeTruthy();
  });

  it("관련 트윗 조회 실패 후 같은 버튼 영역에서 재시도한다", async () => {
    const sourcePostId = "2059529979700846592";
    const replyToPostId = "2059529979700846500";
    fetchXPostContextMock
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce({
        sourcePostId,
        replyTo: {
          id: replyToPostId,
          text: "retried parent",
          createdAt: "2026-05-27T11:00:00Z",
          url: `https://x.com/parent/status/${replyToPostId}`,
          username: "parent",
          name: "Parent Member",
          profileImageUrl: null,
          metrics: {
            likeCount: 0,
            replyCount: 0,
            repostCount: 0,
            quoteCount: 0,
          },
          media: [],
        },
      });
    renderCard(
      makePost({
        id: sourcePostId,
        reply: { postId: replyToPostId, conversationId: null },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "관련 트윗 보기" }));
    await waitFor(() => {
      expect(
        screen.getByText("관련 트윗을 불러오지 못했습니다."),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(screen.getByText("retried parent")).toBeTruthy();
    });
    expect(fetchXPostContextMock).toHaveBeenCalledTimes(2);
  });

  it("멘션과 해시태그를 X 링크로 만들고 정확한 작성 시각을 노출한다", () => {
    const createdAt = "2026-05-27T12:00:34Z";
    renderCard(
      makePost({
        text: "안녕하세요 @otw_member #오버더월",
        createdAt,
      }),
    );

    expect(screen.getByRole("link", { name: "@otw_member" }).getAttribute("href"))
      .toBe("https://x.com/otw_member");
    expect(screen.getByRole("link", { name: "#오버더월" }).getAttribute("href"))
      .toBe(`https://x.com/hashtag/${encodeURIComponent("오버더월")}`);
    expect(screen.getByText((_, element) =>
      element?.tagName === "TIME" && element.getAttribute("datetime") === createdAt,
    )).toBeTruthy();
  });

  it("링크 복사와 공유 버튼은 카드 원문 이동을 일으키지 않는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const share = vi.fn().mockResolvedValue(undefined);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });
    const post = makePost();
    const { container } = renderCard(post, { openPostOnCardClick: true });

    const copyButton = screen.getByRole("button", { name: "링크 복사" });
    fireEvent.click(copyButton.querySelector("svg")!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(post.url));
    expect(open).not.toHaveBeenCalled();

    const shareButton = screen.getByRole("button", { name: "공유" });
    fireEvent.click(shareButton.querySelector("svg")!);
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(open).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector("article")!);
    expect(open).toHaveBeenCalledWith(
      post.url,
      "_blank",
      "noopener,noreferrer",
    );
  });
});
