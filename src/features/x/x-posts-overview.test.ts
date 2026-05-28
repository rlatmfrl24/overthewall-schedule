// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, XPost } from "@/lib/types";
import { XPostsOverview } from "./x-posts-overview";

const useXPostsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: () => ({
    members: [
      {
        uid: 1,
        code: "otw",
        name: "테스트 멤버",
        main_color: "#111111",
        sub_color: "#ffffff",
        oshi_mark: "💙",
        url_twitter: "https://x.com/otw_member",
        url_youtube: null,
        url_chzzk: null,
        youtube_channel_id: null,
        birth_date: null,
        debut_date: null,
        unit_name: null,
        fan_name: null,
        introduction: null,
        is_deprecated: 0,
      } satisfies Member,
      {
        uid: 2,
        code: "otw2",
        name: "테스트 멤버2",
        main_color: "#22c55e",
        sub_color: "#ffffff",
        oshi_mark: "⭐",
        url_twitter: "https://x.com/otw_second",
        url_youtube: null,
        url_chzzk: null,
        youtube_channel_id: null,
        birth_date: null,
        debut_date: null,
        unit_name: null,
        fan_name: null,
        introduction: null,
        is_deprecated: 0,
      } satisfies Member,
    ],
    loading: false,
    hasLoaded: true,
  }),
}));

vi.mock("@/hooks/use-x-posts", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/use-x-posts")>(
      "@/hooks/use-x-posts",
    );
  return {
    ...actual,
    useXPosts: useXPostsMock,
  };
});

const post: XPost = {
  id: "p1",
  text: "최신 게시글입니다.",
  createdAt: "2026-05-27T12:00:00Z",
  url: "https://x.com/otw_member/status/p1",
  username: "otw_member",
  metrics: {
    likeCount: 12,
    replyCount: 1,
    repostCount: 2,
    quoteCount: 0,
  },
  media: [],
  memberUid: 1,
};

const olderPost: XPost = {
  ...post,
  id: "p2",
  text: "이전 게시글입니다.",
  createdAt: "2026-05-26T12:00:00Z",
  url: "https://x.com/otw_second/status/p2",
  username: "otw_second",
  memberUid: 2,
};

describe("XPostsOverview", () => {
  afterEach(() => {
    cleanup();
    useXPostsMock.mockReset();
  });

  it("타임라인 피드, 상태 레일, 오시마크를 표시하고 임베드 옵션은 노출하지 않는다", () => {
    useXPostsMock.mockReturnValue({
      posts: [olderPost, post],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [
        {
          handle: "otw_member",
          userId: "u1",
          posts: [post],
          error: null,
          stale: false,
        },
        {
          handle: "otw_second",
          userId: "u2",
          posts: [],
          error: null,
          stale: false,
        },
      ],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    expect(screen.getByText("멤버 최신 게시글")).toBeTruthy();
    expect(screen.queryByText("공식 계정의 최신 원문 게시글")).toBeNull();
    expect(screen.getByText("피드 상태")).toBeTruthy();
    expect(screen.queryByText("멤버별 상태")).toBeNull();
    expect(screen.getByText("표시 중 게시글")).toBeTruthy();
    expect(screen.getByText("2건")).toBeTruthy();
    expect(screen.getByText("등록된 계정")).toBeTruthy();
    expect(screen.getByText("2개")).toBeTruthy();
    expect(screen.getByText("💙")).toBeTruthy();
    expect(screen.getByText("⭐")).toBeTruthy();
    expect(screen.queryByText("수집 완료")).toBeNull();
    expect(screen.queryByText("게시글 없음")).toBeNull();
    expect(screen.queryByRole("button", { name: "임시 임베드" })).toBeNull();
    expect(screen.queryByRole("button", { name: "X API" })).toBeNull();
    expect(screen.getByText(post.text)).toBeTruthy();
    expect(
      screen.getByText(post.text).compareDocumentPosition(
        screen.getByText(olderPost.text),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(useXPostsMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          uid: 1,
          url_twitter: "https://x.com/otw_member",
        }),
      ]),
      { enabled: true, maxResults: 10 },
    );
  });

  it("멤버 필터를 선택하면 해당 멤버만 단일 선택으로 남긴다", () => {
    useXPostsMock.mockReturnValue({
      posts: [post, olderPost],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    fireEvent.click(screen.getByRole("button", { name: "테스트 멤버2" }));

    expect(screen.queryByText(post.text)).toBeNull();
    expect(screen.getByText(olderPost.text)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "테스트 멤버" }));

    expect(screen.getByText(post.text)).toBeTruthy();
    expect(screen.queryByText(olderPost.text)).toBeNull();
  });

  it("프리뷰가 있는 t.co 링크는 본문 이동 링크 대신 카드 열기 버튼으로 렌더링한다", () => {
    useXPostsMock.mockReturnValue({
      posts: [
        {
          ...post,
          text: "링크 확인 https://t.co/u50CuYmgiR",
          links: [
            {
              url: "https://t.co/u50CuYmgiR",
              expandedUrl: "https://example.com/full",
              displayUrl: null,
              domain: "example.com",
              title: "Example link",
              previewStatus: "ready",
            },
          ],
        },
      ],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    expect(
      screen.queryByRole("link", {
        name: "https://t.co/u50CuYmgiR",
      }),
    ).toBeNull();

    const link = screen.getByRole("link", {
      name: "Example link 열기",
    });
    expect(link.getAttribute("href")).toBe("https://example.com/full");
    expect(screen.getByText("https://t.co/u50CuYmgiR")).toBeTruthy();
  });

  it("프리뷰가 없는 링크는 본문 fallback 링크로 유지한다", () => {
    useXPostsMock.mockReturnValue({
      posts: [
        {
          ...post,
          text: "링크 확인 https://t.co/u50CuYmgiR",
          links: [
            {
              url: "https://t.co/u50CuYmgiR",
              expandedUrl: null,
              displayUrl: null,
            },
          ],
        },
      ],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    const link = screen.getByRole("link", {
      name: "https://t.co/u50CuYmgiR",
    });
    expect(link.getAttribute("href")).toBe("https://t.co/u50CuYmgiR");
  });

  it("게시글 링크 프리뷰를 카드형으로 표시하고 같은 링크는 중복 표시하지 않는다", () => {
    useXPostsMock.mockReturnValue({
      posts: [
        {
          ...post,
          text: "링크 확인 https://t.co/u50CuYmgiR https://t.co/u50CuYmgiR",
          links: [
            {
              url: "https://t.co/u50CuYmgiR",
              expandedUrl: "https://example.com/full",
              resolvedUrl: "https://example.com/full",
              displayUrl: "example.com/full",
              domain: "example.com",
              siteName: "Example",
              title: "Example Title",
              description: "Example description",
              imageUrl: "https://example.com/card.jpg",
              previewStatus: "ready",
            },
            {
              url: "https://t.co/u50CuYmgiR",
              expandedUrl: "https://example.com/full",
              resolvedUrl: "https://example.com/full",
              displayUrl: "example.com/full",
              domain: "example.com",
              title: "Example Title",
              previewStatus: "ready",
            },
          ],
        },
      ],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    const { container } = render(createElement(XPostsOverview));
    const previewLink = screen.getByRole("link", {
      name: "Example Title 열기",
    });

    expect(previewLink?.getAttribute("href")).toBe("https://example.com/full");
    expect(screen.getByText("Example Title").closest("a")).toBeNull();
    expect(screen.getByText("Example")).toBeTruthy();
    expect(screen.getByText("Example description")).toBeTruthy();
    expect(screen.getAllByText("Example Title")).toHaveLength(1);
    expect(
      container.querySelector('img[src="https://example.com/card.jpg"]'),
    ).toBeTruthy();
  });

  it("X 게시글 링크 프리뷰는 작성자, 본문, 미디어를 카드로 표시한다", () => {
    useXPostsMock.mockReturnValue({
      posts: [
        {
          ...post,
          text: "인용 게시글 https://t.co/status",
          links: [
            {
              url: "https://t.co/status",
              expandedUrl: "https://x.com/linked_member/status/9876543210",
              resolvedUrl: "https://x.com/linked_member/status/9876543210",
              displayUrl: "x.com/linked_member/status/9876543210",
              domain: "x.com",
              siteName: "X",
              title: "Linked Member (@linked_member)",
              description: "linked post body",
              previewStatus: "ready",
              linkedPost: {
                id: "9876543210",
                text: "linked post body",
                createdAt: "2026-05-27T11:00:00Z",
                url: "https://x.com/linked_member/status/9876543210",
                username: "linked_member",
                name: "Linked Member",
                profileImageUrl: "https://pbs.twimg.com/profile.jpg",
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
        },
      ],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    const { container } = render(createElement(XPostsOverview));

    expect(screen.getByText("Linked Member")).toBeTruthy();
    expect(screen.getByText(/@linked_member/)).toBeTruthy();
    expect(screen.getByText("linked post body")).toBeTruthy();
    expect(screen.getByText("X 게시글")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Linked Member 게시글 열기" })
        .getAttribute("href"),
    ).toBe("https://x.com/linked_member/status/9876543210");
    expect(
      container.querySelector(
        'img[src="https://pbs.twimg.com/media/photo.jpg"]',
      ),
    ).toBeTruthy();
  });

  it("이미지가 없는 링크 프리뷰는 compact 카드로 표시한다", () => {
    useXPostsMock.mockReturnValue({
      posts: [
        {
          ...post,
          text: "문서 링크 https://t.co/docs",
          links: [
            {
              url: "https://t.co/docs",
              expandedUrl: "https://example.com/docs",
              resolvedUrl: "https://example.com/docs",
              displayUrl: "example.com/docs",
              domain: "example.com",
              title: null,
              description: null,
              imageUrl: null,
              previewStatus: "unavailable",
            },
          ],
        },
      ],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [],
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    const previewLink = screen.getByRole("link", {
      name: "example.com/docs 열기",
    });
    expect(previewLink?.getAttribute("href")).toBe("https://example.com/docs");
  });

  it("stale 데이터가 있으면 조용한 경고와 캐시 상태를 표시한다", () => {
    useXPostsMock.mockReturnValue({
      posts: [post],
      updatedAt: "2026-05-27T12:10:00Z",
      byHandle: [
        {
          handle: "otw_member",
          userId: "u1",
          posts: [post],
          error: null,
          stale: true,
        },
      ],
      loading: false,
      error: "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다.",
      stale: true,
      hasLoaded: true,
      reload: vi.fn(),
    });

    render(createElement(XPostsOverview));

    expect(screen.getByText(post.text)).toBeTruthy();
    expect(
      screen.getByText("새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."),
    ).toBeTruthy();
    expect(screen.getByText("캐시")).toBeTruthy();
  });
});
