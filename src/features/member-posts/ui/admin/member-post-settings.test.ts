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
import { createQueryWrapper } from "@/test/query-client";
import { MemberPostSettingsManager } from "./member-post-settings";

const fetchOperationRunsMock = vi.hoisted(() => vi.fn());
const fetchXHistoryHealthMock = vi.hoisted(() => vi.fn());
const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runXCollectionNowMock = vi.hoisted(() => vi.fn());
const runNaverCafeCheckNowMock = vi.hoisted(() => vi.fn());
const fetchOperationsStatusMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const useScheduleDataMock = vi.hoisted(() => vi.fn());
const useXPostsMock = vi.hoisted(() => vi.fn());
const useNaverCafePostsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/configuration", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/configuration")>();
  return {
    ...actual,
    fetchSettings: fetchSettingsMock,
    updateSettings: updateSettingsMock,
  };
});

vi.mock("@/features/operations", () => ({
  fetchOperationsStatus: fetchOperationsStatusMock,
  fetchOperationRuns: fetchOperationRunsMock,
  runNaverCafeCheckNow: runNaverCafeCheckNowMock,
  runXCollectionNow: runXCollectionNowMock,
  useOperationRun: () => ({ data: null, isLoading: false }),
}));

vi.mock("../../api/x-history-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../api/x-history-api")>(),
  fetchXHistoryHealth: fetchXHistoryHealthMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/features/schedule-board", () => ({
  useScheduleData: useScheduleDataMock,
}));

vi.mock("@/features/x-posts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/x-posts")>();
  return {
    ...actual,
    useXPosts: useXPostsMock,
  };
});

vi.mock("@/features/naver-cafe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/naver-cafe")>();
  return {
    ...actual,
    NaverCafeSourceManager: () => createElement("div", null, "카페 소스 관리"),
    useNaverCafePosts: useNaverCafePostsMock,
  };
});

const makeSettings = () => ({
  auto_update_enabled: "true",
  auto_update_interval_hours: "6",
  auto_update_last_run: null,
  auto_update_range_days: "3",
  live_schedule_auto_fill_enabled: "true",
  x_rich_link_preview_enabled: "false",
  x_posts_visibility: "members",
  naver_cafe_posts_enabled: "true",
  naver_cafe_posts_visibility: "members",
  x_collection_enabled: "true",
  x_collection_daily_budget_cents: "100",
  x_collection_interval_hours: "2",
  x_collection_last_run: null,
});

describe("MemberPostSettingsManager", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    fetchOperationRunsMock.mockResolvedValue({ runs: [] });
    fetchXHistoryHealthMock.mockResolvedValue({
      referenceHydration: {
        pendingPosts: 40, pendingAuthors: 0, terminal: 0, errors: 0,
        oldestPendingAt: 1, nextAttemptAt: 2, budgetDay: "2026-09-05",
        budgetUsedMicros: 0, budgetReservedMicros: 0, budgetLimitMicros: 100_000,
        globalBudget: { usedMicros: 0, reservedMicros: 0, limitMicros: 1_000_000 },
        byRelation: [{ relation: "reply", pendingPosts: 40, pendingAuthors: 0, terminal: 0 }],
        pendingReasons: [{ stage: "post", code: "preview_budget_exceeded", count: 40, nextAttemptAt: 2 }],
      },
    });
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
    fetchOperationsStatusMock.mockResolvedValue({
      updatedAt: "2026-05-28T08:05:00.000Z",
      window: {
        hours: 24,
        since: Date.parse("2026-05-27T08:05:00.000Z"),
      },
      summary: { status: "ok", issues: [] },
      autoUpdate: {
        enabled: true,
        intervalHours: 6,
        rangeDays: 3,
        lastRun: null,
        nextEligibleAt: null,
        pending: { total: 0, createCount: 0, updateCount: 0 },
        rejectionCount: 0,
        latestRun: null,
        recentRuns: [],
      },
      xCollection: {
        enabled: true,
        intervalHours: 2,
        dailyBudgetCents: 100,
        lastRun: Date.parse("2026-05-28T08:00:00.000Z"),
        nextEligibleAt: Date.parse("2026-05-28T10:00:00.000Z"),
        latestRun: {
          id: 1,
          source: "manual",
          status: "success",
          startedAt: Date.parse("2026-05-28T07:59:00.000Z"),
          finishedAt: Date.parse("2026-05-28T08:00:00.000Z"),
          checkedHandles: 2,
          refreshedHandles: 2,
          postsReturned: 4,
          postsStored: 4,
          apiCalls: 4,
          estimatedCostMicros: 40_000,
          error: null,
        },
        recentRuns: [],
        feed: {
          visibility: "members",
          publicPath: "/feed",
          monitorPath: "/admin/member-posts",
          apiPath: "/api/member-posts?sources=x&admin=1",
        },
        usage: {
          apiCalls: 4,
          estimatedCostMicros: 40_000,
          resourceCount: 4,
          successCount: 4,
          failureCount: 0,
          rateLimitCount: 0,
          quota: {
            dailyBudgetMicros: 1_000_000,
            todayUsedMicros: 40_000,
            todayRemainingMicros: 960_000,
            todayBudgetUsedPercent: 4,
          },
          daily: [],
          byOperation: [],
          forceRefreshPaths: [],
        },
      },
      naverCafe: {
        enabled: true,
        visibility: "members",
        collection: {
          intervalHours: 1,
          lastRun: Date.parse("2026-05-28T07:55:00.000Z"),
          nextEligibleAt: Date.parse("2026-05-28T09:00:00.000Z"),
        },
        publicPath: "/feed",
        monitorPath: "/admin/member-posts",
        apiPath: "/api/member-posts?sources=naver-cafe&admin=1",
        sourceCount: 1,
        enabledSourceCount: 1,
        staleSourceCount: 0,
        failingSourceCount: 0,
        disabledSourceCount: 0,
        sources: [
          {
            sourceId: 1,
            sourceName: "테스트 게시판",
            cafeId: "31352147",
            menuId: "9",
            enabled: true,
            latestCheck: {
              id: 1,
              trigger: "scheduled",
              status: "ok",
              checkedAt: Date.parse("2026-05-28T07:55:00.000Z"),
              durationMs: 120,
              postCount: 2,
              error: null,
            },
            lastSuccessAt: Date.parse("2026-05-28T07:55:00.000Z"),
            latestError: null,
            disabledReason: null,
            stale: false,
            failing: false,
          },
        ],
      },
    });
    runXCollectionNowMock.mockResolvedValue({
      runId: "run-x",
      jobType: "x_collection",
      status: "queued",
      acceptedAt: 1,
      idempotencyKey: "manual:x:test",
      statusUrl: "/api/operations/runs/run-x",
    });
    runNaverCafeCheckNowMock.mockResolvedValue({
      runId: "run-naver",
      jobType: "naver_cafe_collection",
      status: "queued",
      acceptedAt: 1,
      idempotencyKey: "manual:naver:test",
      statusUrl: "/api/operations/runs/run-naver",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens and focuses the linked settings after the X tab mounts", async () => {
    window.history.replaceState(null, "", "#x-collection-settings");
    try {
      render(createElement(MemberPostSettingsManager, {activeSource: "x"}), {wrapper: createQueryWrapper()});
      await waitFor(() => {
        const section = document.getElementById("x-collection-settings") as HTMLDetailsElement | null;
        expect(section?.open).toBe(true);
        expect(document.activeElement).toBe(section?.querySelector("summary"));
      });
      expect(updateSettingsMock).not.toHaveBeenCalled();
      expect(runXCollectionNowMock).not.toHaveBeenCalled();
    } finally {
      window.history.replaceState(null, "", window.location.pathname);
    }
  });

  it("X 탭에서 핵심 운영 정보와 설정을 한 작업 공간에 밀집해 표시한다", async () => {
    render(createElement(MemberPostSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(screen.getByText("수집 주기")).toBeTruthy());
    expect(
      screen.getByRole("tab", { name: /X 수집/ }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("2시간마다")).toBeTruthy();
    expect(screen.getByText("게시물 수집 설정")).toBeTruthy();
    expect(screen.queryByText("수집 실행")).toBeNull();
    expect(screen.getByText("X 수집 운영")).toBeTruthy();
    expect(screen.getByText("수집 설정")).toBeTruthy();
    await screen.findByRole("progressbar", { name: "전체 X 예산" });
    expect(screen.getByText("보강 대기")).toBeTruthy();
    const settingGroup = document.getElementById("x-collection-settings") as HTMLDetailsElement;
    expect(settingGroup.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "게시물 수집 설정 열기" }));
    expect(settingGroup.open).toBe(true);
    expect(document.activeElement).toBe(settingGroup.querySelector("summary"));
    const referenceGroup = document.getElementById("x-reference-settings") as HTMLDetailsElement;
    fireEvent.click(screen.getByRole("button", { name: "원문 보강 설정 열기" }));
    expect(referenceGroup.open).toBe(true);
    expect(document.activeElement).toBe(referenceGroup.querySelector("summary"));
    const healthCalls = fetchXHistoryHealthMock.mock.calls.length;
    const runCalls = fetchOperationRunsMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "멤버 게시글 운영 정보 새로고침" }));
    await waitFor(() => {
      expect(fetchXHistoryHealthMock.mock.calls.length).toBeGreaterThan(healthCalls);
      expect(fetchOperationRunsMock.mock.calls.length).toBeGreaterThan(runCalls);
    });
    expect(screen.getByText("X 계정별 관리자 피드 응답")).toBeTruthy();
    expect(screen.getByText("테스트 멤버 · @otw_member")).toBeTruthy();
    const xDiagnostics = screen.getByText("X 계정별 관리자 피드 응답").closest("details");
    expect(xDiagnostics?.open).toBe(false);
    const xDiagnosticsSummary = xDiagnostics?.querySelector("summary");
    if (!xDiagnosticsSummary) throw new Error("X diagnostics summary is missing");
    fireEvent.click(xDiagnosticsSummary);
    expect(xDiagnostics?.open).toBe(true);
    expect(screen.queryByText("카페 소스 관리")).toBeNull();
    expect(useXPostsMock).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({ admin: true, enabled: true, maxResults: 10 }),
    );
    expect(useNaverCafePostsMock).toHaveBeenCalledWith(
      expect.objectContaining({ admin: true, enabled: false, size: 10 }),
    );
    expect(fetchOperationsStatusMock).toHaveBeenCalledWith(24);

    const runButton = screen.getByRole("button", { name: /지금 수집/ });
    fireEvent.click(runButton);

    await waitFor(() => expect(runXCollectionNowMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "X 게시글 수집이 대기열에 등록되었습니다.",
      }),
    );
  });

  it("네이버 카페 탭은 소스 설정과 진단을 하나의 작업 공간에 표시한다", async () => {
    render(createElement(MemberPostSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    const cafeTab = await screen.findByRole("tab", {
      name: /네이버 카페 수집/,
    });
    fireEvent.click(cafeTab);

    expect(cafeTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("네이버 카페 운영")).toBeTruthy();
    expect(screen.getByText("수집 설정과 게시판 소스")).toBeTruthy();
    expect(screen.getByText("카페 소스 관리")).toBeTruthy();
    expect(screen.getByText("게시판별 소스 점검 상태")).toBeTruthy();
    expect(screen.getByText("테스트 게시판")).toBeTruthy();
    const cafeDiagnostics = screen.getByText("게시판별 소스 점검 상태").closest("details");
    expect(cafeDiagnostics?.open).toBe(false);
    const cafeDiagnosticsSummary = cafeDiagnostics?.querySelector("summary");
    if (!cafeDiagnosticsSummary) throw new Error("Cafe diagnostics summary is missing");
    fireEvent.click(cafeDiagnosticsSummary);
    expect(cafeDiagnostics?.open).toBe(true);
    expect(screen.queryByText("X 수집 및 링크 설정")).toBeNull();
    expect(useNaverCafePostsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ admin: true, enabled: true, size: 10 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "지금 점검" }));
    await waitFor(() => expect(runNaverCafeCheckNowMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "네이버 카페 점검이 대기열에 등록되었습니다.",
      }),
    );
  });
});
