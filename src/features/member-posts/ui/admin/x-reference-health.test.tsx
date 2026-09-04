// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XReferenceHealth } from "./x-reference-health";
import { fetchXHistoryHealth } from "../../api/x-history-api";

vi.mock("../../api/x-history-api", () => ({ fetchXHistoryHealth: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("XReferenceHealth", () => {
  it("separates reference backlog, UTC preview spending, and neutral budget deferral", async () => {
    vi.mocked(fetchXHistoryHealth).mockResolvedValue({
      lastCollectionSuccessAt: null,
      budgetUsedMicros: 500_000,
      optimizer: {
        enabled: true,
        configuredIntervalMinutes: 120,
        effectiveIntervalMinutes: 120,
        fallbackReason: null,
        referencePreviewMode: "cached_author",
        previewBacklog: 2,
        authorCacheHitsToday: 0,
        authorCacheMissesToday: 0,
        coalescedHandlesToday: 0,
      },
      utcCost: {
        day: "2026-09-04",
        uniquePosts: 0,
        uniqueUsers: 0,
        uniqueMedia: 0,
        listedCostMicros: 0,
        conservativeCostMicros: 0,
      },
      referenceHydration: {
        pendingPosts: 2,
        pendingAuthors: 1,
        terminal: 3,
        oldestPendingAt: 1,
        nextAttemptAt: 2,
        errors: 0,
        budgetDay: "2026-09-04",
        budgetLimitMicros: 100_000,
        budgetUsedMicros: 50_000,
        budgetReservedMicros: 10_000,
      },
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(XReferenceHealth),
      ),
    );
    expect(await screen.findByText("2 / 1건")).toBeTruthy();
    expect(screen.getByText("2026-09-04 UTC 미리보기 예산")).toBeTruthy();
    expect(screen.getByText("사용 $0.050 · 예약 $0.010 / $0.100")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "신규 수집과 별도로",
    );
    expect(
      screen.getByText(/예산 대기는 신규 수집 실패가 아닙니다/),
    ).toBeTruthy();
    client.clear();
  });
});
