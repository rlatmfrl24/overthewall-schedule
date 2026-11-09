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
const fetchXActivityMock = vi.hoisted(() => vi.fn());
const fetchXCollectionStatusMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const useNaverCafePostsMock = vi.hoisted(() => vi.fn());
const fetchNaverCafeSourcesMock = vi.hoisted(() => vi.fn());

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

vi.mock("../../api/x-history-api", () => ({
  fetchXHistoryHealth: fetchXHistoryHealthMock,
}));
vi.mock("../../api/x-activity-api",()=>({
  xActivityQueryKey:["member-posts","x-activity"],fetchXActivity:fetchXActivityMock,
  startXActivity:vi.fn(),stopXActivity:vi.fn(),
}));

vi.mock("../../api/x-collection-api", () => ({
  xCollectionQueryKey: ["member-posts", "x-collection"],
  fetchXCollectionStatus: fetchXCollectionStatusMock,
  changeXCollectionSource: vi.fn(),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/features/naver-cafe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/naver-cafe")>();
  return {
    ...actual,
    useNaverCafePosts: useNaverCafePostsMock,
  };
});

vi.mock("@/features/naver-cafe/api/naver-cafe-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/naver-cafe/api/naver-cafe-api")>(),
  fetchNaverCafeSources: fetchNaverCafeSourcesMock,
}));

vi.mock("@/features/members", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/members")>(),
  fetchActiveMembers: vi.fn(async () => []),
}));

const cafeBoard = {
  id: 1, name: "테스트 게시판", cafe_id: "31352147", menu_id: "9",
  cafe_url: "https://cafe.naver.com/f-e/cafes/31352147/menus/9",
  member_uid: null, enabled: true, sort_order: 1, created_at: 1, updated_at: 1,
};

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

const makeActivity = () => ({configured:true,site:"otw",mode:"normal",subscription:null,callbackUrl:null,
  budget:{limitMicros:1000000,usedMicros:360000,reservedMicros:0,strictDailyCap:false},budgetReady:true,budgetDay:"2026-10-26",
  events:[],sites:[{site:"otw",enabled:true,targetCount:5,activeCount:5,failedCount:0,pauseReason:null,resumeAt:null,lastError:null}],subscriptions:[],
  recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:0,budget:{day:"2026-10-26",targetCount:5,pageSize:5,continuationPageSize:25,perPageMicros:125000,firstPagesMicros:675000,siteFirstPagesMicros:300000,
    identityMicros:50000,siteLimitMicros:1000000,sharedRemainingMicros:640000,siteRemainingMicros:900000,availableMicros:640000}}});

describe("MemberPostSettingsManager", () => {
  beforeEach(() => {
    fetchXCollectionStatusMock.mockResolvedValue({primarySource:"x_api",observedAt:Date.now(),fxembed:{intervalMinutes:30,lastSuccessAt:null,lastCompletedAt:null,pendingSources:0,failedSources:0},xApi:{intervalHours:24,lastRegularCompletedAt:null,nextRegularEligibleAt:0,pendingSources:0,failedSources:0,budgetReady:true},accounts:[],webhook:{state:"disabled",siteActiveCount:0,reason:null,error:null}});
    fetchXActivityMock.mockResolvedValue(makeActivity());
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
    fetchNaverCafeSourcesMock.mockResolvedValue([cafeBoard]);
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

  it("refreshes current webhook state from the top refresh without opening settings",async()=>{
    render(createElement(MemberPostSettingsManager),{wrapper:createQueryWrapper()});
    await waitFor(()=>expect(fetchXActivityMock).toHaveBeenCalledTimes(1));
    const before=fetchXActivityMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
    await waitFor(()=>expect(fetchXActivityMock.mock.calls.length).toBeGreaterThan(before));
    expect(screen.getByRole("heading",{name:"웹훅 신규 게시물"})).toBeTruthy();
    expect(runXCollectionNowMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("places the X budget and member chart first, groups visible settings, and puts history last", async () => {
    const status = await fetchXCollectionStatusMock();
    fetchXCollectionStatusMock.mockResolvedValue({ ...status, collectedByMember24h: [
      { handle: "one", name: "멤버 하나", count: 3, quoteCount: 1, replyCount: 2 },
      { handle: "two", name: "멤버 둘", count: 0 },
      { handle: "three", name: "멤버 셋", count: 1 },
    ] });
    render(createElement(MemberPostSettingsManager), { wrapper: createQueryWrapper() });

    const budget = (await screen.findByRole("heading", { name: /X API 예산/ })).closest('[data-slot="card"]')!;
    const chart = screen.getByRole("region", { name: "멤버별 X 수집" });
    const settings = screen.getByRole("region", { name: "피드 설정" });
    const history = screen.getByRole("region", { name: "X 실행 이력" });
    const webhook = screen.getByRole("region", { name: "웹훅" });
    expect(budget.parentElement?.firstElementChild).toBe(budget);
    expect(budget.nextElementSibling).toBe(chart);
    const counts = await screen.findByRole("list", { name: "멤버별 수집 건수" });
    expect(Array.from(counts.children, row => row.textContent)).toEqual(["멤버 하나인용 1건 · 답글 2건3건", "멤버 셋1건", "멤버 둘0건"]);
    expect(chart.querySelector<HTMLElement>('[style*="conic-gradient"]')?.style.backgroundImage)
      .toBe("conic-gradient(var(--chart-1) 0% 75%, var(--chart-2) 75% 100%)");
    expect(history.parentElement?.lastElementChild).toBe(history);
    expect(webhook.nextElementSibling).toBe(history);

    const visibility = screen.getByRole("button", { name: /회원 전용/ });
    const linkPreview = screen.getByRole("switch", { name: "링크된 X 게시글 내용 표시" });
    const archiveIndex = screen.getByRole("switch", { name: "관리자 영구 아카이브 색인" });
    for (const control of [visibility, linkPreview, archiveIndex]) {
      expect(control.closest("details")).toBeNull();
      expect(control.closest('[data-slot="card"]')).toBe(settings);
    }
    for (const name of [
      "게시물 수집 실행", "인용 원문 보강", "REST 실행 전 예산", "작업별 X API 호출",
      "계정별 관리자 피드 응답", "Cron 수집 사용", "사이트 조회 보호 한도 센트", "수집 주기",
      "X API 비용 최적화", "인용 원문 미리보기 모드", "인용 보강 일일 예산 센트",
      "답글 표시 정책", "보관 기록 관리",
    ]) {
      expect(screen.queryByText(name)).toBeNull();
    }
    expect(updateSettingsMock).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole("button", { name: "기본 수집원으로 실행" }));
    await waitFor(() => expect(runXCollectionNowMock).toHaveBeenCalled());
  });

  it("uses the confirmed Fx source for ordinary runs", async () => {
    const status = await fetchXCollectionStatusMock();
    fetchXCollectionStatusMock.mockResolvedValue({ ...status, primarySource: "fxembed" });
    render(createElement(MemberPostSettingsManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "기본 수집원으로 실행" }));
    await waitFor(() => expect(runXCollectionNowMock).toHaveBeenCalledWith(undefined, "fxembed"));
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
    expect(screen.getByRole("heading", {level: 1, name: "네이버 카페 수집"})).toBeTruthy();
    const table = await screen.findByRole("table", {name: "네이버 카페 게시판 및 점검 상태"});
    expect(table.closest("details")).toBeNull();
    expect(screen.getByRole("button", {name: "테스트 게시판 수정"}).closest("tr")?.textContent).toContain("2건");
    expect(screen.queryByRole("heading", {name: "게시판별 점검 상태"})).toBeNull();
    expect(screen.getByRole("heading", {name: "수집·공개 설정"})).toBeTruthy();
    expect(useNaverCafePostsMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "지금 점검" }));
    await waitFor(() => expect(runNaverCafeCheckNowMock).toHaveBeenCalled());
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "네이버 카페 점검이 대기열에 등록되었습니다.",
      }),
    );
  });

  it("지난 성공을 현재 정상으로 오인하지 않고 오류·지연 게시판을 중복 계산하지 않는다", async () => {
    const status = await fetchOperationsStatusMock();
    const source = status.naverCafe.sources[0];
    fetchNaverCafeSourcesMock.mockResolvedValue([cafeBoard, {...cafeBoard, id: 2, name: "오류 게시판"}]);
    status.naverCafe.sources = [
      {...source, stale: true},
      {...source, sourceId: 2, sourceName: "오류 게시판", stale: true, failing: true, latestCheck: {...source.latestCheck, status: "error"}, latestError: "점검 실패"},
    ];
    Object.assign(status.naverCafe, {sourceCount: 2, enabledSourceCount: 2, staleSourceCount: 2, failingSourceCount: 1});
    fetchOperationsStatusMock.mockResolvedValue(status);
    render(createElement(MemberPostSettingsManager, {activeSource: "naver-cafe"}), {wrapper: createQueryWrapper()});
    await screen.findByRole("row", {name: /테스트 게시판.*확인 지연/});
    expect(screen.getByRole("row", {name: /오류 게시판.*오류.*점검 실패/})).toBeTruthy();
    expect(screen.getByText("주의 게시판").parentElement?.textContent).toContain("2개");
    expect(screen.queryByRole("row", {name: /테스트 게시판.*정상/})).toBeNull();
  });
});
