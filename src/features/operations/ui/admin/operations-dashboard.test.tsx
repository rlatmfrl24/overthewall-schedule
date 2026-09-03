// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type {
  DataRetentionStatusResponse,
  D1ObservabilityResponse,
  OperationJobSummaryList,
  OperationRunList,
  OperationsStatusResponse,
} from "../../model/types";
import { OperationsDashboard } from "./operations-dashboard";

const fetchDataRetentionStatusMock = vi.hoisted(() => vi.fn());
const fetchD1ObservabilityMock = vi.hoisted(() => vi.fn());
const fetchOperationJobSummariesMock = vi.hoisted(() => vi.fn());
const fetchOperationRunsMock = vi.hoisted(() => vi.fn());
const fetchOperationsStatusMock = vi.hoisted(() => vi.fn());
const runDataRetentionPruneMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/operations", () => ({
  fetchDataRetentionStatus: fetchDataRetentionStatusMock,
  fetchD1Observability: fetchD1ObservabilityMock,
  fetchOperationJobSummaries: fetchOperationJobSummariesMock,
  fetchOperationRuns: fetchOperationRunsMock,
  fetchOperationsStatus: fetchOperationsStatusMock,
  runDataRetentionPrune: runDataRetentionPruneMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const makeOperationsStatus = (
  overrides: Partial<OperationsStatusResponse["scheduledOperations"]> = {},
): OperationsStatusResponse => ({
  updatedAt: "2026-09-01T00:00:00.000Z",
  window: { hours: 24, since: 0 },
  summary: { status: "warning", issues: [] },
  scheduledOperations: {
    activeRunCount: 3,
    staleLeaseCount: 2,
    outboxBacklog: 0,
    oldestOutboxAvailableAt: null,
    queueOperations: { used: 95, limit: 100, usedPercent: 95 },
    d1WriteGuard: {
      status: "available",
      measurement: "admission_estimate",
      used: 12_000,
      reserved: 1_000,
      limit: 40_000,
      usedPercent: 32.5,
      blockedJobTypes: [],
      resetAt: Date.UTC(2026, 8, 2, 0, 0),
    },
    dailyUsage: [],
    ...overrides,
  },
  autoUpdate: {
    enabled: true,
    intervalHours: 6,
    rangeDays: 3,
    lastRun: 1_756_684_800_000,
    nextEligibleAt: 1_756_706_400_000,
    pending: { total: 0, createCount: 0, updateCount: 0 },
    rejectionCount: 0,
    latestRun: null,
    recentRuns: [],
  },
  xCollection: {
    enabled: true,
    intervalHours: 2,
    dailyBudgetCents: 100,
    lastRun: null,
    nextEligibleAt: null,
    latestRun: null,
    recentRuns: [],
    feed: { visibility: "members", publicPath: "/", monitorPath: "/", apiPath: "/" },
    usage: {
      apiCalls: 8,
      estimatedCostMicros: 0,
      resourceCount: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      quota: {
        dailyBudgetMicros: 1,
        todayUsedMicros: 0,
        todayRemainingMicros: 1,
        todayBudgetUsedPercent: 0,
      },
      daily: [],
      byOperation: [],
      forceRefreshPaths: [],
    },
  },
  naverCafe: {
    enabled: true,
    visibility: "members",
    collection: { intervalHours: 4, lastRun: null, nextEligibleAt: null },
    publicPath: "/",
    monitorPath: "/",
    apiPath: "/",
    sourceCount: 2,
    enabledSourceCount: 2,
    staleSourceCount: 0,
    failingSourceCount: 0,
    disabledSourceCount: 0,
    sources: [],
  },
});

const retentionStatus: DataRetentionStatusResponse = {
  source: "manual",
  dryRun: false,
  startedAt: 0,
  finishedAt: 0,
  totalPrunableRows: 0,
  totalDeletedRows: 0,
  policies: [],
  recentRuns: [],
  capacity: {
    sizeBytes: 25 * 1024 * 1024,
    maxBytes: 500 * 1024 * 1024,
    usedPercent: 5,
    status: "ok",
    thresholds: [60, 75, 85],
  },
};

const operationRuns: OperationRunList = { runs: [] };

const d1Observability: D1ObservabilityResponse = {
  status: "available",
  generatedAt: "2026-09-01T00:05:00.000Z",
  cacheAgeSeconds: 45,
  timezone: "UTC",
  windowDays: 7,
  currentDay: {
    day: "2026-09-01",
    rowsRead: 120_000,
    rowsWritten: 20_000,
    readQueries: 300,
    writeQueries: 120,
    rowsReadLimit: 5_000_000,
    rowsWrittenLimit: 100_000,
    rowsReadPercent: 2.4,
    rowsWrittenPercent: 20,
  },
  daily: ["2026-08-26", "2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31", "2026-09-01"].map((day, index) => ({
    day,
    rowsRead: 100_000 + index,
    rowsWritten: 10_000 + index,
    readQueries: 100,
    writeQueries: 50,
  })),
  topWriteWorkloads: [{
    key: "scheduled_operations",
    label: "예약 작업 실행 기록",
    rowsWritten: 12_000,
    queryCount: 80,
    sharePercent: 60,
  }],
};

const jobSummaries: OperationJobSummaryList = {
  summaries: [{
    jobType: "x_collection",
    latestRun: {
      runId: "x-neutral-skip",
      jobType: "x_collection",
      source: "scheduled",
      status: "skipped",
      idempotencyKey: "scheduled:x:test",
      scheduledFor: 1_756_684_800_000,
      acceptedAt: 1_756_684_800_000,
      startedAt: 1_756_684_800_000,
      finishedAt: 1_756_684_801_000,
      progress: { total: 0, queued: 0, running: 0, succeeded: 0, failed: 0, skipped: 0, throttled: 0 },
      failures: [],
      summary: { reason: "all_handles_cooldown" },
      lastError: null,
    },
    latestCheckAt: 1_756_684_801_000,
    latestSuccessAt: 1_756_680_000_000,
    nextExpectedAt: 1_756_686_601_000,
    health: "healthy",
    normalSkip: true,
    reasonCode: "all_handles_cooldown",
    reasonLabel: "모든 X 소스가 다음 점검 대기 중",
  }],
};

describe("OperationsDashboard", () => {
  beforeEach(() => {
    fetchOperationsStatusMock.mockResolvedValue(makeOperationsStatus());
    fetchD1ObservabilityMock.mockResolvedValue(d1Observability);
    fetchOperationJobSummariesMock.mockResolvedValue(jobSummaries);
    fetchOperationRunsMock.mockResolvedValue(operationRuns);
    fetchDataRetentionStatusMock.mockResolvedValue(retentionStatus);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("puts issues and queue first while keeping the queue usage bar accessible", async () => {
    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(screen.getByText("작업 큐")).toBeTruthy());

    expect(screen.getByRole("heading", { name: "지금 확인할 것" })).toBeTruthy();
    expect(screen.getByText("지금 확인할 운영 이슈가 없습니다")).toBeTruthy();
    expect(screen.getByLabelText("자동 업데이트 상세 보기").getAttribute("href")).toBe(
      "/admin/settings?tab=runs",
    );

    const progress = screen.getByRole("progressbar", {
      name: "일일 Queue 사용량",
    });
    expect(progress.getAttribute("aria-valuenow")).toBe("95");
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect(progress.firstElementChild?.className).toContain("bg-destructive");
    expect(screen.getByText("잔여 5")).toBeTruthy();
  });

  it("keeps zero outbox neutral while calling out stale leases", async () => {
    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    const outbox = await screen.findByText("전송 대기");
    const stale = screen.getByText("만료 lease");

    expect(outbox.parentElement?.className).toContain("bg-muted/25");
    expect(stale.parentElement?.className).toContain("bg-destructive/5");
    expect(screen.getByText("2")).toBeTruthy();
  });

  it("shows a blocked D1 write guard separately from an ordinary skipped run", async () => {
    fetchOperationsStatusMock.mockResolvedValue(makeOperationsStatus({
      d1WriteGuard: {
        status: "blocked",
        measurement: "admission_estimate",
        used: 38_000,
        reserved: 2_000,
        limit: 40_000,
        usedPercent: 100,
        blockedJobTypes: ["x_collection", "retention_prune"],
        resetAt: Date.UTC(2026, 8, 2, 0, 0),
      },
    }));
    fetchOperationRunsMock.mockResolvedValue({
      runs: [{
        runId: "run-skipped",
        jobType: "source_health",
        source: "scheduled",
        status: "skipped",
        idempotencyKey: "scheduled:source_health:test",
        scheduledFor: Date.UTC(2026, 8, 1, 23, 33),
        acceptedAt: Date.UTC(2026, 8, 1, 23, 33),
        startedAt: Date.UTC(2026, 8, 1, 23, 33),
        finishedAt: Date.UTC(2026, 8, 1, 23, 33),
        progress: {
          total: 0,
          queued: 0,
          running: 0,
          succeeded: 0,
          failed: 0,
          skipped: 0,
          throttled: 0,
        },
        failures: [],
        summary: { reason: "no_eligible_targets" },
        lastError: null,
      }],
    });

    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    const guardAlert = await screen.findByRole("alert");
    expect(guardAlert.textContent).toContain("예약 작업 생성 차단");
    expect(guardAlert.textContent).toContain("보수적 예상치");
    expect(guardAlert.textContent).toContain("run을 만들지 않는 사전 차단");
    expect(guardAlert.textContent).toContain("38,000");
    expect(guardAlert.textContent).toContain("2,000");
    expect(guardAlert.textContent).toContain("40,000");
    expect(screen.getByRole("progressbar", { name: "정기 작업 일일 예상 쓰기 예산" }).getAttribute("aria-valuenow")).toBe("40000");

    expect(fetchOperationRunsMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "전체 이력" }));
    await waitFor(() => expect(fetchOperationRunsMock).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText("대상 없음")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("사유: no_eligible_targets")).length).toBeGreaterThan(0);
  });

  it("reads back genuine YouTube partial source counts instead of the wrapper item count", async () => {
    fetchOperationRunsMock.mockResolvedValue({
      runs: [{
        runId: "youtube-partial",
        jobType: "youtube_feed_collection",
        source: "scheduled",
        status: "partial",
        idempotencyKey: "scheduled:youtube:partial",
        scheduledFor: null,
        acceptedAt: 1_756_684_800_000,
        startedAt: 1_756_684_800_000,
        finishedAt: 1_756_684_801_000,
        progress: {
          total: 5,
          queued: 0,
          running: 0,
          succeeded: 4,
          failed: 1,
          skipped: 0,
          throttled: 0,
        },
        failures: [{
          itemId: "youtube-feed-item",
          targetKey: "youtube-feed",
          phase: "collect",
          code: "youtube_feed_collection_partial",
          message: "YouTube feed collection failed for 1 of 5 sources",
          attempts: 1,
          lastAttemptAt: 1_756_684_801_000,
        }],
        summary: null,
        lastError: null,
      }],
    } satisfies OperationRunList);

    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    fireEvent.click(await screen.findByRole("tab", { name: "전체 이력" }));
    expect((await screen.findAllByText("YouTube 신규 피드 수집")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("일부 실패").length).toBeGreaterThan(0);
    expect(screen.getAllByText("5/5").length).toBeGreaterThan(0);
    expect(screen.getAllByText("성공 4 · 실패 1 · 진행 0 · 대기 0").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/YouTube feed collection failed for 1 of 5 sources/).length,
    ).toBeGreaterThan(0);
  });

  it("separates Cloudflare actual usage from the internal scheduled-write estimate", async () => {
    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    expect(await screen.findByText("Cloudflare D1 실제 사용량")).toBeTruthy();
    expect(screen.getByText("정기 작업 쓰기 예산")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "실제 Rows Written · UTC 당일" }).getAttribute("aria-valuenow")).toBe("20000");
    expect(screen.getByRole("progressbar", { name: "정기 작업 일일 예상 쓰기 예산" }).getAttribute("aria-valuenow")).toBe("13000");
    expect(screen.getByText("예약 작업 실행 기록")).toBeTruthy();
    expect(screen.getByText(/청구 확정값 아님/)).toBeTruthy();
  });

  it("keeps a neutral skip healthy and hides destructive cleanup in advanced details", async () => {
    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    expect((await screen.findAllByText("모든 X 소스가 다음 점검 대기 중")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("다음 점검 대기").length).toBeGreaterThan(0);
    expect(screen.getAllByText("다음 기준").length).toBeGreaterThan(0);
    const advanced = screen.getByText("고급 작업 · 데이터 정리").closest("details");
    expect(advanced?.hasAttribute("open")).toBe(false);
    expect(fetchOperationRunsMock).not.toHaveBeenCalled();
  });

  it("treats unavailable Cloudflare metrics as non-blocking dashboard information", async () => {
    fetchD1ObservabilityMock.mockResolvedValue({
      status: "unconfigured",
      generatedAt: "2026-09-01T00:05:00.000Z",
      cacheAgeSeconds: null,
      timezone: "UTC",
      windowDays: 7,
      currentDay: null,
      daily: [],
      topWriteWorkloads: [],
      reasonCode: "token_unconfigured",
    } satisfies D1ObservabilityResponse);

    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    expect(await screen.findByText("실계측 확인 불가")).toBeTruthy();
    expect(screen.getByText(/D1 토큰이 Worker secret에 설정되지 않았습니다/))
      .toBeTruthy();
    expect(screen.getByText(/전체 운영 상태에는 영향을 주지 않습니다/)).toBeTruthy();
    expect(screen.getByText("지금 확인할 운영 이슈가 없습니다")).toBeTruthy();
  });
});
