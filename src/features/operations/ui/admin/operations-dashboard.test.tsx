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
});
