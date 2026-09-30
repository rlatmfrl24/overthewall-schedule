// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import type { YouTubeFeedStatusDto } from "@contracts/youtube";
import type { OperationRunDto } from "@contracts/scheduled-operations";
import { createTestQueryClient } from "@/test/query-client";
import { YouTubeFeedManager } from "./youtube-feed-manager";

const status = vi.hoisted(() => vi.fn());
const execute = vi.hoisted(() => vi.fn());
const monitor = vi.hoisted(() => vi.fn());
vi.mock("../../api/youtube-feed", () => ({ fetchYouTubeFeedStatus: status }));
vi.mock("@/features/operations", () => ({ createOperationRun: execute, useOperationRun: monitor }));
vi.mock("@/shared/ui/toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const snapshot: YouTubeFeedStatusDto = {
  updatedAt: Date.now(), window: { hours: 24, since: 0, until: Date.now() },
  automaticEnabled: true, apiConfigured: true, configurationIssues: [],
  channels: [{ channelId: "UCone", names: ["테스트 채널"], roles: ["official", "vod"], state: "delayed", initialized: true, lastAttemptAt: 1, lastSuccessAt: 1, nextCheckAt: 1, videoCount: 4, metadataPending: 3, oldestMetadataAt: 1, error: null }],
  summary: { channels: 1, videos: 4, metadataPending: 3, oldestMetadataAt: 1, states: { misconfigured: 0, failed: 0, delayed: 1, due: 0, initializing: 0, paused: 0, healthy: 0, unknown: 0 } },
  usage: { apiCalls: 3, quotaUnits: 3, failures: 0, byOrigin: [{ origin: "scheduled", apiCalls: 3, quotaUnits: 3, failures: 0 }] },
  quota: { day: "2026-09-29", since: 1, nextResetAt: Date.now(), used: 4, limit: 1000, lowPriorityLimit: 700 }, recentRuns: [],
};
const run: OperationRunDto = {
  runId: "previous", jobType: "youtube_feed_collection", source: "manual", status: "partial",
  idempotencyKey: "previous-key", scheduledFor: null, acceptedAt: 1000, startedAt: 2000, finishedAt: 5000,
  progress: { total: 1, succeeded: 1, failed: 0, queued: 0, running: 0, skipped: 0, throttled: 0 },
  failures: [], summary: null, lastError: null,
  youtubeCollection: { attempted: 5, succeeded: 4, failed: 1, metadataRefreshed: 100, unavailableMarked: 2, shortsStored: 9, scanPages: 2, exhaustedSources: 0, quotaBlocked: true, backoffSources: 1, backfillFailed: 1 },
};
function mount() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...render(<YouTubeFeedManager />, { wrapper }), client };
}
function selectTab(name: RegExp | string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0, ctrlKey: false });
}
describe("YouTube collection control flow", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    status.mockReset().mockResolvedValue(snapshot);
    execute.mockReset().mockResolvedValue({ runId: "manual", acceptedAt: Date.now() });
    monitor.mockReset().mockReturnValue({ data: undefined, dataUpdatedAt: 0, isFetching: false, isError: false, refetch: vi.fn() });
  });
  afterEach(cleanup);
  it("keeps a static table, cancels without collecting, and distinguishes acceptance from completion", async () => {
    render(<YouTubeFeedManager />, { wrapper: ({ children }) => <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider> });
    await within(await screen.findByRole("table")).findByText("테스트 채널");
    const button = screen.getAllByRole("button", { name: "대기 작업 실행" })[0];
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "취소" }));
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "대기 작업 실행" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith("youtube_feed_collection"));
    await screen.findByText("실행 접수 완료 · 종료 결과 확인 중");
    expect(screen.getByRole("table").textContent).toContain("테스트 채널");
    expect(button.hasAttribute("disabled")).toBe(true);
  });
  it("retains the last snapshot on refresh failure and never substitutes a normal zero", async () => {
    const client = createTestQueryClient();
    render(<YouTubeFeedManager />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await within(await screen.findByRole("table")).findByText("테스트 채널");
    status.mockRejectedValueOnce(new Error("D1 unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "상태 새로고침" }));
    await screen.findByText(/조회 실패 · 이전 정보/);
    expect(screen.getByRole("table").textContent).toContain("테스트 채널");
    const metrics = screen.getByRole("region", { name: "수집 상태 요약" });
    expect(within(metrics).getByText("메타데이터 갱신 대기").parentElement?.textContent).toContain("3");
  });
  it("keeps due work visible even when automatic collection is paused", async () => {
    status.mockResolvedValue({ ...snapshot, automaticEnabled: false, channels: [{ ...snapshot.channels[0], state: "paused" }], summary: { ...snapshot.summary, states: { ...snapshot.summary.states, delayed: 0, paused: 1 } } });
    const client = createTestQueryClient();
    render(<YouTubeFeedManager />, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await screen.findByText(/자동 수집 중지 · 저장 영상/);
    expect(screen.getByRole("button", { name: "확인 대기 1 상세 보기" }).textContent).toBe("1");
    expect(screen.getAllByRole("button", { name: "대기 작업 실행" })[0].hasAttribute("disabled")).toBe(false);
  });
  it("filters from numeric cards and keyboard-equivalent chart controls, searches, and opens full channel details", async () => {
    const other = { ...snapshot.channels[0], channelId: "UChealthy", names: ["정상 채널"], state: "healthy", nextCheckAt: snapshot.updatedAt + 50000, metadataPending: 0, oldestMetadataAt: null };
    status.mockResolvedValue({ ...snapshot, channels: [other, snapshot.channels[0]], summary: { ...snapshot.summary, channels: 2, states: { ...snapshot.summary.states, healthy: 1 } } });
    mount();
    const table = await screen.findByRole("table");
    expect(within(table).getAllByRole("row")[1].textContent).toContain("테스트 채널");
    fireEvent.keyDown(screen.getByRole("combobox", { name: "채널 정렬" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "이름순" }));
    expect(within(table).getAllByRole("row")[1].textContent).toContain("정상 채널");
    fireEvent.click(screen.getByRole("button", { name: "정상 1채널 보기" }));
    expect(table.textContent).toContain("정상 채널");
    expect(table.textContent).not.toContain("테스트 채널");
    fireEvent.click(screen.getByRole("button", { name: "확인 대기 1 상세 보기" }));
    expect(table.textContent).toContain("테스트 채널");
    expect(table.textContent).not.toContain("정상 채널");
    fireEvent.click(screen.getByRole("button", { name: "등록 채널 2 상세 보기" }));
    fireEvent.change(screen.getByRole("textbox", { name: "채널 이름 검색" }), { target: { value: "UCone" } });
    expect(table.textContent).not.toContain("정상 채널");
    fireEvent.click(screen.getByRole("button", { name: "테스트 채널 상세 보기" }));
    const detail = screen.getByRole("dialog");
    expect(within(detail).getByText("UCone")).toBeTruthy();
    expect(within(detail).getByText("마지막 시도")).toBeTruthy();
    expect(within(detail).getByText("공식 · 다시보기")).toBeTruthy();
  });
  it("uses source counters instead of wrapper 1/1 and exposes budget/backfill details", async () => {
    status.mockResolvedValue({ ...snapshot, recentRuns: [run] });
    mount();
    await screen.findByRole("button", { name: "최근 실행 결과 4 / 5 상세 보기" });
    selectTab(/최근 실행 1/);
    const table = screen.getByRole("table", { name: "최근 수집 실행" });
    expect(table.textContent).toContain("4 / 5");
    expect(table.textContent).toContain("일부 미완료");
    expect(table.textContent).toContain("대기 있음");
    expect(screen.getByText(/최대 8건/)).toBeTruthy();
    fireEvent.click(within(table).getByRole("button"));
    expect(within(screen.getByRole("dialog")).getByText("백필 실패")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).getByText("재시도 대기")).toBeTruthy();
  });
  it("shows real zeroes, unknown limits, configuration issues and no-target runs distinctly", async () => {
    status.mockResolvedValue({ ...snapshot, apiConfigured: false, quota: { ...snapshot.quota, limit: null, lowPriorityLimit: null }, recentRuns: [{ ...run, status: "skipped", youtubeCollection: { ...run.youtubeCollection!, attempted: 0, succeeded: 0 } }], configurationIssues: [{ channelId: null, name: "미등록 채널", issue: "채널 ID 없음" }] });
    mount();
    await screen.findByRole("button", { name: "최근 실행 결과 처리 대상 없음 상세 보기" });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByRole("button", { name: "오류 채널 0 상세 보기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "대기 작업 실행" }).hasAttribute("disabled")).toBe(true);
    selectTab(/설정 문제 1/);
    expect(screen.getByRole("table", { name: "등록·수집 설정 문제" }).textContent).toContain("채널 ID 없음");
  });
  it("reports initial read failure without fake metrics or collection", async () => {
    status.mockRejectedValue(new Error("D1 unavailable"));
    mount();
    await screen.findByText("수집 상태 조회 실패");
    expect(screen.queryByRole("region", { name: "수집 상태 요약" })).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
  it("does not call a metadata-only completed run a no-target run", async () => {
    status.mockResolvedValue({ ...snapshot, recentRuns: [{ ...run, status: "succeeded", youtubeCollection: { ...run.youtubeCollection!, attempted: 0, succeeded: 0 } }] });
    mount();
    await screen.findByRole("button", { name: "최근 실행 결과 채널 시도 없음 상세 보기" });
    expect(screen.queryByText("처리 대상 없음")).toBeNull();
    expect(screen.getByText(/메타데이터 100 · 종료/)).toBeTruthy();
  });
  it("restores monitoring on re-entry and refetches remaining work only after terminal readback", async () => {
    const activeRun = { ...run, status: "running", finishedAt: null, youtubeCollection: undefined };
    status.mockResolvedValue({ ...snapshot, recentRuns: [activeRun] });
    monitor.mockReturnValue({ data: activeRun, dataUpdatedAt: 1, isError: false, isFetching: false, refetch: vi.fn() });
    const { rerender } = mount();
    await screen.findByText("실행 중");
    expect(monitor).toHaveBeenCalledWith(expect.objectContaining({ runId: "previous" }));
    expect(screen.getByRole("button", { name: "대기 작업 실행" }).hasAttribute("disabled")).toBe(true);
    const previousCalls = status.mock.calls.length;
    status.mockResolvedValue({ ...snapshot, channels: [], summary: { ...snapshot.summary, channels: 0, metadataPending: 0 }, recentRuns: [run] });
    monitor.mockReturnValue({ data: run, dataUpdatedAt: 2, isError: false, isFetching: false, refetch: vi.fn() });
    rerender(<YouTubeFeedManager />);
    await waitFor(() => expect(status.mock.calls.length).toBeGreaterThan(previousCalls));
    await screen.findByText("현재 남은 채널 대기 0 · 메타데이터 대기 0영상");
    expect(screen.getByText(/채널 성공 \/ 시도 4 \/ 5/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "대기 작업 실행" }).hasAttribute("disabled")).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });
  it("changes only usage/run period and retains the prior cached period on failure", async () => {
    mount();
    await screen.findByRole("table");
    status.mockRejectedValueOnce(new Error("D1 unavailable"));
    fireEvent.keyDown(screen.getByRole("combobox", { name: "사용량·실행 조회 기간" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "최근 7일" }));
    await waitFor(() => expect(status).toHaveBeenCalledWith(168));
    await screen.findByText("조회 실패 · 이전 조회 결과");
    expect(screen.getByRole("table").textContent).toContain("테스트 채널");
    expect(screen.getByText(/채널·할당량: 현재 상태 · 사용량·실행: 최근 24시간/)).toBeTruthy();
  });
});
