// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MemberPostSourcePolicy,
  UnifiedMemberPost,
} from "../api/member-posts-api";
import type { MemberDto } from "@contracts/members";
import type { NaverCafePostDto } from "@contracts/naver-cafe";
import type { XPostViewModel } from "@/features/x-posts";
import { MemberPostsOverview } from "./member-posts-overview";

const useMemberPostsMock = vi.hoisted(() => vi.fn());

const renderWithQueryClient = (element: ReturnType<typeof createElement>) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    createElement(QueryClientProvider, { client: queryClient }, element),
  );
};

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
  const reload = vi.fn().mockResolvedValue(undefined);
  return {
    posts: makeUnifiedPosts(xPosts, cafePosts),
    feedUpdatedAt: "2026-05-28T01:05:00Z",
    updatedAt: "2026-05-28T01:05:00Z",
    loading: false,
    error: null,
    hasLoaded: true,
    reload,
    x: makeXState(xPosts, reload, xPolicy),
    naverCafe: makeCafeState(cafePosts, reload, cafePolicy),
  };
};

const replyPost: XPostViewModel = { ...xPost, reply: { postId: "10", conversationId: "9", targetUsername: "OTW_MEMBER", post: null } };
const mount = (props = { loadX: true, loadCafe: true }) => renderWithQueryClient(createElement(MemberPostsOverview, { ...props, footer: createElement("footer", null, "팬 운영 안내") }));

describe("MemberPostsOverview", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", { getItem: vi.fn(() => "false"), setItem: vi.fn() });
    useMemberPostsMock.mockReturnValue(makeMemberPostsState());
  });
  afterEach(() => { cleanup(); useMemberPostsMock.mockReset(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("답글 전환과 이전 저장값을 사용하지 않고 답글을 표시한다", () => {
    useMemberPostsMock.mockReturnValue(makeMemberPostsState({ xPosts: [replyPost], cafePosts: [] }));
    mount();
    expect(screen.getByText(xPost.text)).toBeTruthy();
    expect(screen.getByText("테스트 멤버에게 답글")).toBeTruthy();
    expect(screen.getByRole("link", { name: "답글 원문 열기" }).getAttribute("href")).toBe("https://x.com/i/web/status/10");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("최신순 목록과 스크롤 내부 제목·푸터를 유지한다", () => {
    const { container } = mount();
    const scroll = container.querySelector('[data-slot="content-scroll"]')!;
    expect(scroll.contains(screen.getByRole("heading", { name: "멤버 게시글" }))).toBe(true);
    expect(scroll.contains(screen.getByText("팬 운영 안내"))).toBe(true);
    expect(screen.getAllByText("팬 운영 안내")).toHaveLength(1);
    expect(screen.getByText(cafePost.title).compareDocumentPosition(screen.getByText(xPost.text)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getAllByRole("article").every(article => !article.className.includes("shadow"))).toBe(true);
    expect(screen.getAllByRole("link", { name: /원문 보기/ }).every(link => link.getAttribute("target") === "_blank")).toBe(true);
  });

  it("날짜·초·KST를 포함한 실제 피드 데이터 갱신 시각을 표시한다", () => {
    const { container } = mount();
    expect(screen.getByText("피드 업데이트")).toBeTruthy();
    expect(screen.getByText(/2026\. 05\. 28\. 10:05:00 KST/)).toBeTruthy();
    expect(container.querySelector('time[datetime="2026-05-28T01:05:00.000Z"]')).toBeTruthy();
    expect(screen.getByTitle(/마지막으로 수집·갱신된 시각/)).toBeTruthy();
  });

  it("본문과 빈 공간은 이동하지 않고 본문 링크를 보존한다", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    useMemberPostsMock.mockReturnValue(makeMemberPostsState({ xPosts: [{ ...xPost, text: "본문 https://example.com/inside" }] }));
    mount();
    for (const article of screen.getAllByRole("article")) fireEvent.click(article);
    fireEvent.click(screen.getByText(cafePost.summary));
    expect(open).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "https://example.com/inside" }).getAttribute("href")).toBe("https://example.com/inside");
  });

  it("모든 멤버를 Dialog나 숨김 없이 단일 선택 목록에 표시한다", () => {
    mount();
    const members = screen.getByRole("navigation", { name: "멤버 선택" });
    expect(within(members).getAllByRole("button")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: "선택 멤버 변경" })).toBeNull();
    expect(screen.getByTestId("feed-toolbar").contains(members)).toBe(true);
    fireEvent.click(within(members).getByRole("button", { name: "테스트 멤버2" }));
    expect(screen.queryByText(xPost.text)).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
    expect(within(members).getByRole("button", { name: "테스트 멤버2" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("출처 필터 없이 카드 아이콘으로 출처를 구분하며 멤버만 필터링한다", () => {
    const state = makeMemberPostsState();
    useMemberPostsMock.mockReturnValue(state);
    mount();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("img", { name: "X" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "네이버 카페" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "멤버 게시글 목록" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "테스트 멤버2" }));
    expect(screen.queryByText(xPost.text)).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /초기화/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체 멤버" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(state.reload).not.toHaveBeenCalled();
    expect(useMemberPostsMock.mock.calls.every(([args]) => JSON.stringify(args) === JSON.stringify({ includeX: true, includeNaverCafe: true, maxResults: 10, size: 10 }))).toBe(true);
  });

  it("출처 지연·오류 상세를 표시하지 않고 기존 글을 유지한다", () => {
    const state = { ...makeMemberPostsState(), error: "조회 실패 상세 사유" };
    useMemberPostsMock.mockReturnValue(state);
    const { container } = mount();
    expect(screen.queryByText(/출처 업데이트 지연|조회 실패 상세 사유|이전 글 표시/)).toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
  });

  it("피드 갱신 시각이 없으면 요청 시각으로 대체하지 않는다", () => {
    useMemberPostsMock.mockReturnValue({ ...makeMemberPostsState(), feedUpdatedAt: null });
    mount();
    expect(screen.getByText("시각 확인 불가")).toBeTruthy();
    expect(screen.queryByText(/2026\. 05\. 28\. 10:05:00 KST/)).toBeNull();
  });

  it("백그라운드 갱신은 스크롤을 초기화하지 않는다", () => {
    const { container, rerender } = mount();
    const scroll = container.querySelector('[data-slot="content-scroll"]')!;
    scroll.scrollTop = 600;
    useMemberPostsMock.mockReturnValue({ ...makeMemberPostsState(), loading: true });
    rerender(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));
    expect(scroll.scrollTop).toBe(600);
  });

  it("초기 로딩을 빈 결과로 표시하지 않는다", () => {
    useMemberPostsMock.mockReturnValue({ ...makeMemberPostsState({ xPosts: [], cafePosts: [] }), hasLoaded: false, loading: true });
    mount();
    expect(screen.getByLabelText("게시글 불러오는 중")).toBeTruthy();
    expect(screen.queryByText("조건에 맞는 게시글이 없습니다.")).toBeNull();
  });

  it("접근 불가 출처는 탭에서 제외하고 정책 안내를 유지한다", () => {
    useMemberPostsMock.mockReturnValue(makeMemberPostsState({ xPosts: [], cafePosts: [], xPolicy: makePolicy("x", { requested: false, accessible: false, status: "not_requested" }), cafePolicy: makePolicy("naver-cafe", { enabled: false, accessible: false, status: "disabled" }) }));
    mount({ loadX: false, loadCafe: true });
    expect(screen.queryByRole("tab", { name: "X" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "네이버 카페" })).toBeNull();
    expect(screen.getByText("네이버 카페 최신글 표시가 비활성화되어 있습니다.")).toBeTruthy();
  });
});
