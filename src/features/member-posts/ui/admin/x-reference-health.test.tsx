// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { XReferenceHealth } from "./x-reference-health";
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
  render(createElement(QueryClientProvider, { client }, createElement(XReferenceHealth)));
  return client;
}

describe("XReferenceHealth", () => {
  it("separates body and author backlog and explains stored deferral without claiming collection failure", async () => {
    vi.mocked(fetchXHistoryHealth).mockResolvedValue(health());
    const client = show();
    expect(await screen.findByText("보강 대기")).toBeTruthy();
    expect(screen.getByText("원문 2건")).toBeTruthy();
    expect(screen.getByText("작성자 1건")).toBeTruthy();
    expect(screen.getByText(/원문 보강 예산 대기/)).toBeTruthy();
    expect(screen.getByText(/미리보기 설정에 따른 보류/)).toBeTruthy();
    expect(screen.getByText(/예산 대기는 신규 수집 실패가 아닙니다/)).toBeTruthy();
    expect(screen.getByText(/접근 불가 3건/)).toBeTruthy();
    expect(screen.queryByText("재시도 확인 필요")).toBeNull();
    client.clear();
  });

  it("shows author-only errors even when body collection is complete", async () => {
    const value = health();
    Object.assign(value.referenceHydration!, { pendingPosts: 0, errors: 1,
      pendingReasons: [{ stage: "author", code: "x_api_503", count: 1, nextAttemptAt: 2 }] });
    vi.mocked(fetchXHistoryHealth).mockResolvedValue(value);
    const client = show();
    expect(await screen.findByText("재시도 확인 필요")).toBeTruthy();
    expect(screen.getByText(/조회 오류 \(x_api_503\)/)).toBeTruthy();
    client.clear();
  });

  it("shows terminal-only references as no pending work", async () => {
    const value = health();
    Object.assign(value.referenceHydration!, { pendingPosts: 0, pendingAuthors: 0, pendingReasons: [], nextAttemptAt: null });
    vi.mocked(fetchXHistoryHealth).mockResolvedValue(value);
    const client = show();
    expect(await screen.findAllByText("대기 없음")).not.toHaveLength(0);
    expect(screen.getByText(/접근 불가 3건/)).toBeTruthy();
    client.clear();
  });

  it("keeps stale evidence visibly stale after a refresh failure", async () => {
    vi.mocked(fetchXHistoryHealth).mockRejectedValue(new Error("offline"));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(xReferenceHealthQueryKey, health(), { updatedAt: Date.now() - 180_000 });
    show(client);
    expect(await screen.findByText("이전 조회 결과")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("최신 상태를 확인하지 못했습니다");
    client.clear();
  });

  it("does not show zero or healthy on a failed initial read", async () => {
    vi.mocked(fetchXHistoryHealth).mockRejectedValue(new Error("offline"));
    const client = show();
    expect(await screen.findByText("확인 불가")).toBeTruthy();
    expect(screen.queryByText("대기 없음")).toBeNull();
    expect(screen.queryByText("원문 대기")).toBeNull();
    client.clear();
  });
});

describe("XCollectionBudget", () => {
  it("shows nested limits and uses the smaller available balance including reservations", () => {
    render(createElement(XCollectionBudget, { health: health().referenceHydration }));
    expect(screen.getByRole("progressbar", { name: "전체 X 예산" }).getAttribute("aria-valuenow")).toBe("98");
    expect(screen.getByRole("progressbar", { name: /원문 보강 한도/ }).getAttribute("aria-valuenow")).toBe("60");
    expect(screen.getByText(/현재 보강에 사용 가능한 금액 \$0.020/)).toBeTruthy();
    expect(screen.getByText(/두 금액을 더하지 않습니다/)).toBeTruthy();
  });
});
