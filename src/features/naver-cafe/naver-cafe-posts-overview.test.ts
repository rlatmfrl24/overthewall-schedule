// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Member, NaverCafePost } from "@/lib/types";
import { NaverCafePostsOverview } from "./naver-cafe-posts-overview";

const useNaverCafePostsMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: () => ({
    members: [
      {
        uid: 1,
        code: "natsuki",
        name: "나츠키",
        main_color: "#22c55e",
        sub_color: "#ffffff",
        oshi_mark: "🎴",
        url_twitter: null,
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
        code: "teri",
        name: "테리",
        main_color: "#6366f1",
        sub_color: "#ffffff",
        oshi_mark: "✝️",
        url_twitter: null,
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

vi.mock("@/hooks/use-naver-cafe-posts", async () => {
  const actual =
    await vi.importActual<typeof import("@/hooks/use-naver-cafe-posts")>(
      "@/hooks/use-naver-cafe-posts",
    );
  return {
    ...actual,
    useNaverCafePosts: useNaverCafePostsMock,
  };
});

const post: NaverCafePost = {
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

const olderPost: NaverCafePost = {
  ...post,
  id: "31352147:10:43000",
  articleId: 43000,
  menuId: "10",
  sourceName: "테리",
  memberUid: 2,
  title: "테리 최신 공지",
  summary: "오늘 방송 있습니다",
  createdAt: "2026-05-26T12:00:00Z",
  thumbnailUrl: null,
  isNew: false,
};

const makeHookValue = (overrides = {}) => ({
  posts: [olderPost, post],
  sources: [
    {
      id: 1,
      name: "나츠키",
      cafeId: "31352147",
      menuId: "9",
      cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
      memberUid: 1,
      enabled: true,
      sortOrder: 0,
      status: "ok",
      error: null,
      postCount: 1,
      stale: false,
    },
    {
      id: 2,
      name: "테리",
      cafeId: "31352147",
      menuId: "10",
      cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/10",
      memberUid: 2,
      enabled: true,
      sortOrder: 1,
      status: "ok",
      error: null,
      postCount: 1,
      stale: false,
    },
  ],
  updatedAt: "2026-05-27T15:00:00Z",
  loading: false,
  error: null,
  stale: false,
  hasLoaded: true,
  reload: vi.fn(),
  ...overrides,
});

describe("NaverCafePostsOverview", () => {
  afterEach(() => {
    cleanup();
    useNaverCafePostsMock.mockReset();
  });

  it("카페 최신글 피드, 오시마크, 원문 링크를 표시한다", () => {
    useNaverCafePostsMock.mockReturnValue(makeHookValue());

    const { container } = render(createElement(NaverCafePostsOverview));

    expect(screen.getByText("카페 최신글")).toBeTruthy();
    expect(screen.queryByText("피드 상태")).toBeNull();
    expect(screen.queryByText("표시 중 게시글")).toBeNull();
    expect(screen.queryByText("등록된 게시판")).toBeNull();
    expect(screen.getByText("🎴")).toBeTruthy();
    expect(screen.getByText("✝️")).toBeTruthy();
    expect(
      screen.getAllByLabelText("네이버 카페 게시글").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(post.title)).toBeTruthy();
    expect(screen.getByText(post.summary)).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /카페에서 보기/ })).toHaveLength(2);
    const thumbnail = container.querySelector(
      'img[src="https://example.com/thumb.jpg"]',
    ) as HTMLImageElement | null;
    expect(thumbnail).toBeTruthy();
    expect(thumbnail?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(
      screen
        .getByText(post.title)
        .compareDocumentPosition(screen.getByText(olderPost.title)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("멤버 필터는 선택한 멤버만 단일 선택으로 표시한다", () => {
    useNaverCafePostsMock.mockReturnValue(makeHookValue());

    render(createElement(NaverCafePostsOverview));

    fireEvent.click(screen.getByRole("button", { name: "테리" }));
    expect(screen.queryByText(post.title)).toBeNull();
    expect(screen.getByText(olderPost.title)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "나츠키" }));
    expect(screen.getByText(post.title)).toBeTruthy();
    expect(screen.queryByText(olderPost.title)).toBeNull();
  });

  it("stale 상태면 경고와 캐시 상태를 표시한다", () => {
    useNaverCafePostsMock.mockReturnValue(
      makeHookValue({
        posts: [post],
        sources: [
          {
            id: 1,
            name: "나츠키",
            cafeId: "31352147",
            menuId: "9",
            cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
            memberUid: 1,
            enabled: true,
            sortOrder: 0,
            status: "stale",
            error: "fail",
            postCount: 1,
            stale: true,
          },
        ],
        error: "새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다.",
        stale: true,
      }),
    );

    render(createElement(NaverCafePostsOverview));

    expect(screen.getByText(post.title)).toBeTruthy();
    expect(
      screen.getByText("새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다."),
    ).toBeTruthy();
    expect(screen.queryByText("캐시")).toBeNull();
  });
});
