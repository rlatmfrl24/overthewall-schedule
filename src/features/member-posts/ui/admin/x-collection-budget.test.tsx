// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XCollectionBudget } from "./x-collection-monitoring";
import { fetchXHistoryHealth } from "../../api/x-history-api";
import { xReferenceHealthQueryKey } from "../../queries/use-x-reference-health";
import type { XHistoryHealthResponseDto } from "@contracts/x-posts";

vi.mock("../../api/x-history-api", () => ({ fetchXHistoryHealth: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

const health = (): XHistoryHealthResponseDto => ({
  lastCollectionSuccessAt: null, budgetUsedMicros: 950_000,
  optimizer: { enabled: true, configuredIntervalMinutes: 120, effectiveIntervalMinutes: 120,
    fallbackReason: null, referencePreviewMode: "cached_author", previewBacklog: 2,
    authorCacheHitsToday: 0, authorCacheMissesToday: 0, coalescedHandlesToday: 0 },
  utcCost: { day: "2026-09-05", uniquePosts: 0, uniqueUsers: 0, uniqueMedia: 0, listedCostMicros: 0, conservativeCostMicros: 0 },
  referenceHydration: {
    pendingPosts: 2, pendingAuthors: 1, terminal: 3, errors: 0,
    oldestPendingAt: 1, nextAttemptAt: 2, budgetDay: "2026-09-05",
    budgetLimitMicros: 100_000, budgetUsedMicros: 50_000, budgetReservedMicros: 10_000,
    globalBudget: { limitMicros: 1_000_000, usedMicros: 970_000, reservedMicros: 10_000 },
    byRelation: [{ relation: "reply", pendingPosts: 2, pendingAuthors: 1, terminal: 3 }],
    pendingReasons: [
      { stage: "post", code: "preview_budget_exceeded", count: 2, nextAttemptAt: 2 },
      { stage: "author", code: "preview_disabled", count: 1, nextAttemptAt: 2 },
    ],
  },
});

function show(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(createElement(QueryClientProvider, { client }, createElement(XCollectionBudget)));
}

describe("XCollectionBudget", () => {
  it("shows nested limits and uses the smaller available balance including reservations", async () => {
    vi.mocked(fetchXHistoryHealth).mockResolvedValue(health());
    show();
    expect((await screen.findByRole("progressbar", { name: "전체 X 예산" })).getAttribute("aria-valuenow")).toBe("98");
    expect(screen.getByRole("progressbar", { name: /원문 보강 한도/ }).getAttribute("aria-valuenow")).toBe("60");
    expect(screen.getByText("보강 가능").textContent).toContain("$0.020");
  });

  it("identifies the last known budget after a refresh fails", async () => {
    vi.mocked(fetchXHistoryHealth).mockRejectedValue(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(xReferenceHealthQueryKey, health(), { updatedAt: Date.now() - 180_000 });
    show(client);
    expect((await screen.findByRole("alert")).textContent).toContain("마지막으로 조회한 값");
    expect(screen.getByRole("progressbar", { name: "전체 X 예산" })).toBeTruthy();
  });
});
