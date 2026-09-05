// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { OperationRunDto, XCollectionOperationItemDto } from "@contracts/scheduled-operations";
import { XCollectionRuns } from "./x-collection-monitoring";

afterEach(cleanup);
const item = (): XCollectionOperationItemDto => ({
  itemId: "item", targetKey: "handles:0:member", status: "partial", attempts: 1,
  updatedAt: 1, errorCode: "x_api_503", error: "원문 보강 재시도 대기",
  retryPending: false, nextRetryAt: null,
  collection: { status: "success", checkedHandles: 1, refreshedHandles: 1, postsReturned: 5, postsStored: 5, error: null },
  referenceHydration: { status: "failed", scanned: 2, hydrated: 1, authorsResolved: 0, deferred: 1, failed: 1, terminal: 0, coalesced: 0, retryAt: 2, errorCode: "x_api_503" },
});
const run = (items = [item()]): OperationRunDto => ({
  runId: "run", jobType: "x_collection", source: "scheduled", status: "partial",
  idempotencyKey: "test", scheduledFor: 1, acceptedAt: 1, startedAt: 1, finishedAt: 2,
  progress: { total: items.length, succeeded: 1, queued: 0, running: 0, failed: 0, skipped: 0, throttled: 0 },
  failures: [], summary: null, lastError: null, xCollection: { items },
});
const show = (value: OperationRunDto) => render(createElement(XCollectionRuns, { runs: [value], loading: false, error: false, updatedAt: Date.now() }));

describe("XCollectionRuns", () => {
  it("keeps overall partial and collection success separate from failed hydration", () => {
    show(run());
    const row = screen.getByRole("button", { name: /전체 결과/ });
    expect(row.textContent).toContain("일부 실패");
    expect(row.textContent).toContain("성공 · 저장 5건");
    expect(row.textContent).toContain("오류·재시도 대기");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/작업 묶음: 성공·부분 완료/)).toBeTruthy();
    expect(screen.getByText(/보강 재시도:/)).toBeTruthy();
    expect(screen.getByText(/검토 관계 2건 · 원문 연결 1건/)).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("can show skipped collection and completed hydration on the same run", () => {
    const value = item();
    value.status = "skipped";
    value.collection!.status = "skipped";
    value.collection!.postsStored = 0;
    value.collection!.refreshedHandles = 0;
    Object.assign(value.referenceHydration!, { status: "complete", failed: 0, deferred: 0, retryAt: null, errorCode: null });
    show({ ...run([value]), status: "skipped" });
    const row = screen.getByRole("button", { name: /전체 결과/ });
    expect(row.textContent).toContain("건너뜀 · 저장 0건");
    expect(row.textContent).toContain("이번 처리 완료");
  });

  it("explains a budget-skipped run that actually persisted posts", () => {
    const value = item();
    value.status = "skipped";
    Object.assign(value.collection!, { status: "skipped", postsStored: 98, error: "budget_exceeded" });
    show({ ...run([value]), status: "skipped" });
    const row = screen.getByRole("button", { name: /전체 결과/ });
    expect(row.textContent).toContain("전체 결과: 건너뜀");
    expect(row.textContent).toContain("일부 수집 후 대기 · 저장 98건");
  });

  it("never infers hydration completion from a succeeded legacy wrapper", () => {
    const value = item();
    value.status = "succeeded";
    value.referenceHydration = null;
    show({ ...run([value]), status: "succeeded" });
    expect(screen.getByRole("button", { name: /전체 결과/ }).textContent).toContain("보강 결과 기록 없음");
    expect(screen.queryByText(/이번 처리 완료/)).toBeNull();
  });

  it("does not mistake an active shard's previous retry result for final success", () => {
    const value = item();
    value.status = "running";
    show({ ...run([value]), status: "running", finishedAt: null });
    expect(screen.getByRole("button", { name: /전체 결과/ }).textContent).toContain("진행 중 또는 일부 결과 미확인");
  });

  it("exposes list read failures separately from empty history", () => {
    render(createElement(XCollectionRuns, { runs: [], loading: false, error: true, updatedAt: 0 }));
    expect(screen.getByRole("alert").textContent).toContain("작업 이력을 갱신하지 못했습니다");
    expect(screen.queryByText("작업 이력이 없습니다.")).toBeNull();
  });
});
