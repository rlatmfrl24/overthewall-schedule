// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type {
  DataRetentionStatusResponse,
  OperationRunList,
  OperationsStatusResponse,
} from "../../model/types";
import { OperationsDashboard } from "./operations-dashboard";

const fetchDataRetentionStatusMock = vi.hoisted(() => vi.fn());
const fetchOperationRunsMock = vi.hoisted(() => vi.fn());
const fetchOperationsStatusMock = vi.hoisted(() => vi.fn());
const runDataRetentionPruneMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/operations", () => ({
  fetchDataRetentionStatus: fetchDataRetentionStatusMock,
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

describe("OperationsDashboard", () => {
  beforeEach(() => {
    fetchOperationsStatusMock.mockResolvedValue(makeOperationsStatus());
    fetchOperationRunsMock.mockResolvedValue(operationRuns);
    fetchDataRetentionStatusMock.mockResolvedValue(retentionStatus);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders compact status-card log links and an accessible queue usage bar", async () => {
    render(createElement(OperationsDashboard), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(screen.getByText("작업 큐")).toBeTruthy());

    expect(screen.getByLabelText("전체 상태 로그 보기").getAttribute("href")).toBe(
      "#issues",
    );
    expect(screen.getByLabelText("자동 업데이트 로그 보기").getAttribute("href")).toBe(
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

    const outbox = await screen.findByText("대기 outbox");
    const stale = screen.getByText("stale lease");

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
    expect(guardAlert.textContent).toContain("Workflow 생성 차단");
    expect(guardAlert.textContent).toContain("예상치");
    expect(guardAlert.textContent).toContain("run을 만들지 않는 사전 차단");
    expect(guardAlert.textContent).toContain("38,000");
    expect(guardAlert.textContent).toContain("2,000");
    expect(guardAlert.textContent).toContain("40,000");
    expect(guardAlert.textContent).toContain("X 게시글 수집");
    expect(guardAlert.textContent).toContain("D1 데이터 보존");
    expect(guardAlert.textContent).toContain("추가 D1 쓰기 작업을 피하세요");
    expect(screen.getByRole("progressbar", { name: "D1 일일 예상 쓰기 사용량" }).getAttribute("aria-valuenow")).toBe("100");

    expect(screen.getByText("건너뜀")).toBeTruthy();
    expect(screen.getByText("대상 없음")).toBeTruthy();
    expect(screen.getByText("사유: no_eligible_targets")).toBeTruthy();
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

    expect(await screen.findByText("YouTube 신규 피드 수집")).toBeTruthy();
    expect(screen.getByText("일부 실패")).toBeTruthy();
    expect(screen.getByText("5/5")).toBeTruthy();
    expect(screen.getByText("성공 4 · 실패 1 · 진행 0 · 대기 0")).toBeTruthy();
    expect(
      screen.getByText(/YouTube feed collection failed for 1 of 5 sources/),
    ).toBeTruthy();
  });
});
