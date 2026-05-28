// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberPostSettingsManager } from "./member-post-settings";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runXCollectionNowMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useXPostsMock = vi.hoisted(() => vi.fn());
const useNaverCafePostsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
  runXCollectionNow: runXCollectionNowMock,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/hooks/use-schedule-data", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("@/hooks/use-x-posts", () => ({
  useXPosts: useXPostsMock,
}));

vi.mock("@/hooks/use-naver-cafe-posts", () => ({
  useNaverCafePosts: useNaverCafePostsMock,
}));

vi.mock("./naver-cafe-source-manager", () => ({
  NaverCafeSourceManager: () => createElement("div", null, "카페 소스 관리"),
}));

const makeSettings = () => ({
  auto_update_enabled: "true",
  auto_update_interval_hours: "6",
  auto_update_last_run: null,
  auto_update_range_days: "3",
  x_rich_link_preview_enabled: "false",
  x_posts_visibility: "members",
  naver_cafe_posts_enabled: "true",
  naver_cafe_posts_visibility: "members",
  x_collection_enabled: "true",
  x_collection_daily_budget_cents: "100",
  x_collection_interval_hours: "6",
  x_collection_last_run: null,
});

describe("MemberPostSettingsManager", () => {
  beforeEach(() => {
    useScheduleDataMock.mockReturnValue({
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
        },
      ],
      loading: false,
      hasLoaded: true,
      reloadMembers: vi.fn(),
    });
    useXPostsMock.mockReturnValue({
      posts: [
        {
          id: "x1",
          text: "X 게시글",
          createdAt: "2026-05-28T07:00:00Z",
          url: "https://x.com/otw_member/status/x1",
          username: "otw_member",
          metrics: {
            likeCount: 1,
            replyCount: 0,
            repostCount: 0,
            quoteCount: 0,
          },
          media: [],
          memberUid: 1,
        },
      ],
      updatedAt: "2026-05-28T07:05:00Z",
      byHandle: [
        {
          handle: "otw_member",
          userId: "u1",
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
    useNaverCafePostsMock.mockReturnValue({
      posts: [],
      sources: [
        {
          id: 1,
          name: "테스트 게시판",
          cafeId: "31352147",
          menuId: "9",
          cafeUrl: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
          memberUid: 1,
          enabled: true,
          sortOrder: 0,
          status: "ok",
          error: null,
          postCount: 2,
          stale: false,
        },
      ],
      updatedAt: "2026-05-28T07:10:00Z",
      loading: false,
      error: null,
      stale: false,
      hasLoaded: true,
      reload: vi.fn(),
    });
    fetchSettingsMock.mockResolvedValue(makeSettings());
    updateSettingsMock.mockResolvedValue(undefined);
    runXCollectionNowMock.mockResolvedValue({
      success: true,
      status: "success",
      checkedHandles: 2,
      refreshedHandles: 2,
      postsReturned: 4,
      postsStored: 4,
      apiCalls: 4,
      estimatedCostMicros: 40_000,
      error: null,
      updatedAt: "2026-05-28T08:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("X 수집 주기와 수동 실행 결과를 표시한다", async () => {
    render(createElement(MemberPostSettingsManager));

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());
    expect(screen.getByText("수집 주기")).toBeTruthy();
    expect(screen.getByText("6시간마다")).toBeTruthy();
    expect(screen.getByText(/마지막 실행:/)).toBeTruthy();
    expect(screen.getByText("피드 모니터링")).toBeTruthy();
    expect(screen.getByText("조회 응답 게시글")).toBeTruthy();
    expect(screen.getByText("X 계정별 응답")).toBeTruthy();
    expect(screen.getByText("테스트 멤버 · @otw_member")).toBeTruthy();
    expect(screen.getByText("카페 게시판별 응답")).toBeTruthy();
    expect(screen.getByText("테스트 게시판")).toBeTruthy();
    expect(useXPostsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ admin: true, maxResults: 10 }),
    );
    expect(useNaverCafePostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ admin: true, size: 10 }),
    );

    const runButton = screen.getByRole("button", { name: /지금 수집/ });
    fireEvent.click(runButton);

    await waitFor(() => expect(runXCollectionNowMock).toHaveBeenCalled());
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getByText("확인 2개")).toBeTruthy();
    expect(screen.getByText("저장 4개")).toBeTruthy();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "X 게시글 4개를 저장했습니다.",
      }),
    );
  });
});
