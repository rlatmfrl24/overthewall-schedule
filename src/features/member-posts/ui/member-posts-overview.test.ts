// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  MemberPostSourcePolicy,
  UnifiedMemberPost,
} from "../api/member-posts-api";
import type { MemberDto } from "@contracts/members";
import type { NaverCafePostDto } from "@contracts/naver-cafe";
import type { XPostViewModel } from "@/features/x-posts";
import { MemberPostsOverview } from "./member-posts-overview";

const useMemberPostsMock = vi.hoisted(() => vi.fn());

const members: MemberDto[] = [
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
  },
  {
    uid: 2,
    code: "otw2",
    name: "테스트 멤버2",
    main_color: "#22c55e",
    sub_color: "#ffffff",
    oshi_mark: "⭐",
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
  },
];

vi.mock("@/features/schedule-board", () => ({
  useScheduleData: () => ({
    members,
    loading: false,
    hasLoaded: true,
  }),
}));

vi.mock("../queries/use-member-posts", () => ({
  useMemberPosts: useMemberPostsMock,
}));

const xPost: XPostViewModel = {
  id: "x1",
  text: "X 최신 게시글입니다.",
  createdAt: "2026-05-27T12:00:00Z",
  url: "https://x.com/otw_member/status/x1",
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

const cafePost: NaverCafePostDto = {
  id: "31352147:9:44096",
  articleId: 44096,
  cafeId: "31352147",
  menuId: "9",
  sourceName: "테스트 게시판",
  memberUid: 2,
  title: "카페 최신글입니다.",
  summary: "카페 요약입니다.",
  createdAt: "2026-05-28T01:00:00Z",
  url: "https://cafe.naver.com/f-e/cafes/31352147/articles/44096?menuid=9",
  thumbnailUrl: null,
  metrics: {
    commentCount: 3,
    readCount: 20,
    likeCount: 5,
  },
  isNew: true,
};

const makeUnifiedPosts = (
  xPosts: XPostViewModel[] = [xPost],
  cafePosts: NaverCafePostDto[] = [cafePost],
): UnifiedMemberPost[] =>
  [
    ...xPosts.map((post) => ({
      kind: "x" as const,
      id: `x:${post.id}`,
      memberUid: post.memberUid ?? null,
      createdAt: post.createdAt,
      post,
    })),
    ...cafePosts.map((post) => ({
      kind: "cafe" as const,
      id: `naver-cafe:${post.id}`,
      memberUid: post.memberUid ?? null,
      createdAt: post.createdAt,
      post,
    })),
  ].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

const makePolicy = (
  source: MemberPostSourcePolicy["source"],
  overrides: Partial<MemberPostSourcePolicy> = {},
): MemberPostSourcePolicy => ({
  source,
  requested: true,
  admin: false,
  enabled: true,
  visibility: "public",
  accessible: true,
  status: "visible",
  reason: null,
  publicPath: "/feed",
  monitorPath: "/admin/member-posts",
  apiPath: `/api/member-posts?sources=${source}&admin=1`,
  ...overrides,
});

const makeXState = (
  posts: XPostViewModel[] = [xPost],
  reload = vi.fn(),
  policy = makePolicy("x"),
) => ({
  posts,
  updatedAt: "2026-05-27T12:10:00Z",
  byHandle: [],
  policy,
  loading: false,
  error: null,
  stale: false,
  hasLoaded: true,
  reload,
});

const makeCafeState = (
  posts: NaverCafePostDto[] = [cafePost],
  reload = vi.fn(),
  policy = makePolicy("naver-cafe"),
) => ({
  posts,
  sources: [
    {
      id: 1,
      name: "테스트 게시판",
      cafeId: "31352147",
      menuId: "9",
      cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
      memberUid: 2,
      enabled: true,
      sortOrder: 0,
      status: "ok" as const,
      error: null,
      postCount: posts.length,
      stale: false,
    },
  ],
  policy,
  updatedAt: "2026-05-28T01:05:00Z",
  loading: false,
  error: null,
  stale: false,
  hasLoaded: true,
  reload,
});

const makeMemberPostsState = ({
  xPosts = [xPost],
  cafePosts = [cafePost],
  xPolicy = makePolicy("x"),
  cafePolicy = makePolicy("naver-cafe"),
}: {
  xPosts?: XPostViewModel[];
  cafePosts?: NaverCafePostDto[];
  xPolicy?: MemberPostSourcePolicy;
  cafePolicy?: MemberPostSourcePolicy;
} = {}) => {
  const reload = vi.fn();
  return {
    posts: makeUnifiedPosts(xPosts, cafePosts),
    updatedAt: "2026-05-28T01:05:00Z",
    loading: false,
    error: null,
    hasLoaded: true,
    reload,
    x: makeXState(xPosts, reload, xPolicy),
    naverCafe: makeCafeState(cafePosts, reload, cafePolicy),
  };
};

describe("MemberPostsOverview", () => {
  afterEach(() => {
    cleanup();
    useMemberPostsMock.mockReset();
  });

  it("X 게시글과 네이버 카페 게시글을 한 타임라인에 최신순으로 표시한다", () => {
    useMemberPostsMock.mockReturnValue(makeMemberPostsState());

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    expect(screen.getByText("멤버 게시글")).toBeTruthy();
    expect(screen.getByLabelText(/X 마지막 업데이트/)).toBeTruthy();
    expect(screen.getByLabelText(/네이버 카페 마지막 업데이트/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "새로고침" })).toBeNull();
    expect(screen.getByText(xPost.text)).toBeTruthy();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
    expect(screen.getAllByLabelText("X 게시글").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("네이버 카페 게시글")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /X에서 보기/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /카페에서 보기/ })).toBeNull();
    expect(
      screen.getByRole("link", {
        name: "테스트 멤버 X 원문 게시글 열기",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "테스트 멤버2 네이버 카페 원문 게시글 열기",
      }),
    ).toBeTruthy();
    expect(screen.queryByText("피드 상태")).toBeNull();
    expect(screen.queryByText("등록된 소스")).toBeNull();
    expect(screen.getByTestId("member-post-filter-top").className).toContain(
      "lg:hidden",
    );
    expect(
      screen.getByTestId("member-post-filter-sidebar").className,
    ).toContain("lg:block");
    expect(screen.getByTestId("member-post-content-layout").className).toContain(
      "lg:grid-cols-[220px_minmax(0,1fr)]",
    );
    const topFilterControls =
      screen.getByTestId("member-post-filter-top").firstElementChild;
    expect(topFilterControls?.className).toContain("flex-wrap");
    expect(topFilterControls?.className).not.toContain("overflow-x-auto");
    const feedList = screen.getAllByTestId("member-post-feed-list")[0];
    expect(feedList.className).toContain("flex-col");
    expect(feedList.className).not.toContain("grid-cols");
    expect(
      within(
        within(screen.getByTestId("member-post-filter-top")).getByRole(
          "button",
          { name: "테스트 멤버" },
        ),
      ).queryByText("X"),
    ).toBeNull();
    expect(
      within(
        within(screen.getByTestId("member-post-filter-top")).getByRole(
          "button",
          { name: "테스트 멤버2" },
        ),
      ).queryByText("카페"),
    ).toBeNull();
    expect(
      screen.getByText(cafePost.title).compareDocumentPosition(
        screen.getByText(xPost.text),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("카드 클릭은 원문을 열고 X 본문 내부 링크 클릭은 내부 링크로 유지한다", () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    const linkedXPost: XPostViewModel = {
      ...xPost,
      text: "본문 링크 https://example.com/inside",
      links: [
        {
          url: "https://example.com/inside",
          expandedUrl: "https://example.com/inside",
          displayUrl: "example.com/inside",
          previewStatus: "skipped",
        },
      ],
    };
    useMemberPostsMock.mockReturnValue(
      makeMemberPostsState({ xPosts: [linkedXPost], cafePosts: [] }),
    );

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    fireEvent.click(
      screen.getByRole("link", {
        name: "테스트 멤버 X 원문 게시글 열기",
      }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      linkedXPost.url,
      "_blank",
      "noopener,noreferrer",
    );

    openSpy.mockClear();
    const innerLink = screen.getByRole("link", {
      name: "https://example.com/inside",
    });
    expect(innerLink.getAttribute("href")).toBe("https://example.com/inside");

    fireEvent.click(innerLink);

    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("카페 게시글 카드 클릭은 카페 원문을 연다", () => {
    const openSpy = vi
      .spyOn(window, "open")
      .mockImplementation(() => null);
    useMemberPostsMock.mockReturnValue(
      makeMemberPostsState({ xPosts: [], cafePosts: [cafePost] }),
    );

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    fireEvent.click(
      screen.getByRole("link", {
        name: "테스트 멤버2 네이버 카페 원문 게시글 열기",
      }),
    );

    expect(openSpy).toHaveBeenCalledWith(
      cafePost.url,
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });

  it("멤버 칩은 단일 선택으로 X와 카페 게시글을 함께 필터링한다", () => {
    useMemberPostsMock.mockReturnValue(makeMemberPostsState());

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    const topFilter = screen.getByTestId("member-post-filter-top");

    fireEvent.click(
      within(topFilter).getByRole("button", { name: "테스트 멤버2" }),
    );

    expect(screen.queryByText(xPost.text)).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();

    fireEvent.click(
      within(topFilter).getByRole("button", { name: "테스트 멤버" }),
    );

    expect(screen.getByText(xPost.text)).toBeTruthy();
    expect(screen.queryByText(cafePost.title)).toBeNull();
  });

  it("접근 가능한 소스만 로드한다", () => {
    useMemberPostsMock.mockReturnValue(
      makeMemberPostsState({ xPosts: [], cafePosts: [cafePost] }),
    );

    render(
      createElement(MemberPostsOverview, { loadX: false, loadCafe: true }),
    );

    expect(useMemberPostsMock).toHaveBeenCalledWith({
      includeX: false,
      includeNaverCafe: true,
      maxResults: 10,
      size: 10,
    });
    expect(screen.queryByLabelText(/X 마지막 업데이트/)).toBeNull();
    expect(screen.getByLabelText(/네이버 카페 마지막 업데이트/)).toBeTruthy();
    expect(screen.queryByText("X 최신 게시글입니다.")).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
  });

  it("정책상 표시할 수 없는 소스는 빈 소스가 아니라 정책 안내로 표시한다", () => {
    useMemberPostsMock.mockReturnValue(
      makeMemberPostsState({
        xPosts: [],
        cafePosts: [],
        xPolicy: makePolicy("x", {
          requested: false,
          accessible: false,
          status: "not_requested",
        }),
        cafePolicy: makePolicy("naver-cafe", {
          enabled: false,
          accessible: false,
          status: "disabled",
        }),
      }),
    );

    render(
      createElement(MemberPostsOverview, { loadX: false, loadCafe: true }),
    );

    expect(
      screen.getByText("네이버 카페 최신글 표시가 비활성화되어 있습니다."),
    ).toBeTruthy();
    expect(
      screen.queryByText("등록된 X 계정 또는 네이버 카페 게시판이 없습니다."),
    ).toBeNull();
  });
});
