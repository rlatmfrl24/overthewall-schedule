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
import type { Member, NaverCafePost, XPost } from "@/lib/types";
import { MemberPostsOverview } from "./member-posts-overview";

const useXPostsMock = vi.hoisted(() => vi.fn());
const useNaverCafePostsMock = vi.hoisted(() => vi.fn());

const members: Member[] = [
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

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: () => ({
    members,
    loading: false,
    hasLoaded: true,
  }),
}));

vi.mock("@/hooks/use-x-posts", () => ({
  useXPosts: useXPostsMock,
}));

vi.mock("@/hooks/use-naver-cafe-posts", () => ({
  useNaverCafePosts: useNaverCafePostsMock,
}));

const xPost: XPost = {
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

const cafePost: NaverCafePost = {
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

const makeXState = (posts: XPost[] = [xPost]) => ({
  posts,
  updatedAt: "2026-05-27T12:10:00Z",
  byHandle: [],
  loading: false,
  error: null,
  stale: false,
  hasLoaded: true,
  reload: vi.fn(),
});

const makeCafeState = (posts: NaverCafePost[] = [cafePost]) => ({
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
  updatedAt: "2026-05-28T01:05:00Z",
  loading: false,
  error: null,
  stale: false,
  hasLoaded: true,
  reload: vi.fn(),
});

describe("MemberPostsOverview", () => {
  afterEach(() => {
    cleanup();
    useXPostsMock.mockReset();
    useNaverCafePostsMock.mockReset();
  });

  it("X 게시글과 네이버 카페 게시글을 한 타임라인에 최신순으로 표시한다", () => {
    useXPostsMock.mockReturnValue(makeXState());
    useNaverCafePostsMock.mockReturnValue(makeCafeState());

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    expect(screen.getByText("멤버 게시글")).toBeTruthy();
    expect(screen.getByText(xPost.text)).toBeTruthy();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
    expect(screen.getAllByLabelText("X 게시글").length).toBeGreaterThan(0);
    expect(screen.getByText("카페글")).toBeTruthy();
    expect(screen.getByLabelText("네이버 카페 게시글")).toBeTruthy();
    expect(screen.getByText("X 1개 · 카페 1개")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: "테스트 멤버" })).queryByText(
        "X",
      ),
    ).toBeNull();
    expect(
      within(screen.getByRole("button", { name: "테스트 멤버2" })).queryByText(
        "카페",
      ),
    ).toBeNull();
    expect(
      screen.getByText(cafePost.title).compareDocumentPosition(
        screen.getByText(xPost.text),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("멤버 칩은 단일 선택으로 X와 카페 게시글을 함께 필터링한다", () => {
    useXPostsMock.mockReturnValue(makeXState());
    useNaverCafePostsMock.mockReturnValue(makeCafeState());

    render(createElement(MemberPostsOverview, { loadX: true, loadCafe: true }));

    fireEvent.click(screen.getByRole("button", { name: "테스트 멤버2" }));

    expect(screen.queryByText(xPost.text)).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "테스트 멤버" }));

    expect(screen.getByText(xPost.text)).toBeTruthy();
    expect(screen.queryByText(cafePost.title)).toBeNull();
  });

  it("접근 가능한 소스만 로드한다", () => {
    useXPostsMock.mockReturnValue(makeXState([]));
    useNaverCafePostsMock.mockReturnValue(makeCafeState());

    render(
      createElement(MemberPostsOverview, { loadX: false, loadCafe: true }),
    );

    expect(useXPostsMock).toHaveBeenCalledWith([], {
      enabled: false,
      maxResults: 10,
    });
    expect(useNaverCafePostsMock).toHaveBeenCalledWith({
      enabled: true,
      size: 10,
    });
    expect(screen.queryByText("X 최신 게시글입니다.")).toBeNull();
    expect(screen.getByText(cafePost.title)).toBeTruthy();
  });
});
