// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import type { XCollectionStatusDto } from "@contracts/x-collection";
import { fetchXCollectionStatus, changeXCollectionSource } from "../../api/x-collection-api";
import { XCollectionManager } from "./x-collection-manager";
import { XActivityManager } from "./x-activity-manager";
import { fetchXActivity, startXActivity, stopXActivity } from "../../api/x-activity-api";
import type { XActivityStatusDto } from "@contracts/x-activity";
vi.mock("../../api/x-activity-api", () => ({ xActivityQueryKey: ["member-posts", "x-activity"], fetchXActivity: vi.fn(), startXActivity: vi.fn(), stopXActivity: vi.fn() }));
vi.mock("../../api/x-collection-api", () => ({ xCollectionQueryKey: ["member-posts", "x-collection"], fetchXCollectionStatus: vi.fn(), changeXCollectionSource: vi.fn() }));
const status: XCollectionStatusDto = { primarySource: "fxembed", hybridPolicy: null, rss: { enabled: false, intervalHours: 6, lastHttpSuccessAt: null, lastCheckCompletedAt: null, pendingSources: 0, pendingCandidates: 0, windowReduced: false, error: null }, observedAt: 1, accounts: [], fxembed: { intervalMinutes: 30, lastSuccessAt: 1, lastCompletedAt: null, pendingSources: 1, failedSources: 0 }, xApi: { intervalHours: 24, lastRegularCompletedAt: 1, nextRegularEligibleAt: 2, pendingSources: 1, failedSources: 1, budgetReady: true }, webhook: { state: "disabled", siteActiveCount: 0, reason: "hybrid", error: null } };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it.each(["start", "stop", "failed-stop"])("refreshes both mounted collection consumers after webhook %s", async action => {
  let current = { ...status, webhook: { ...status.webhook, state: action === "start" ? "disabled" : "enabled" } } as XCollectionStatusDto;
  const activity: XActivityStatusDto = { configured: true, callbackUrl: null, subscription: null, site: "otw", mode: "normal", budget: { limitMicros: 1000000, usedMicros: 0, reservedMicros: 0, strictDailyCap: false }, events: [], sites: [{ site: "otw", enabled: action !== "start", activeCount: action === "start" ? 0 : 1, targetCount: 1, failedCount: 0, pauseReason: null, lastError: null, resumeAt: null }] };
  vi.mocked(fetchXCollectionStatus).mockImplementation(async () => current);
  vi.mocked(fetchXActivity).mockResolvedValue(activity);
  const mutate = async () => {
    current = { ...current, webhook: { ...current.webhook, state: action === "start" ? "enabled" : "disabled" } };
    if (action === "failed-stop") throw new Error("x_activity_provider_503");
    return activity;
  };
  vi.mocked(startXActivity).mockImplementation(mutate);
  vi.mocked(stopXActivity).mockImplementation(mutate);
  render(createElement("div", null, createElement(XCollectionManager, { enabled: true }), createElement(XCollectionManager, { enabled: true }), createElement(XActivityManager)), { wrapper: createQueryWrapper() });
  const title = action === "start" ? "웹훅 Disabled" : "웹훅 활성";
  expect(await screen.findAllByRole("heading", { name: title })).toHaveLength(2);
  const details = screen.getByText("X 신규 피드 구독").closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  fireEvent.click(await screen.findByRole("button", { name: action === "start" ? "전체 대상 적용" : "이 사이트 웹훅 중지" }));
  await waitFor(() => expect(screen.getAllByRole("heading", { name: action === "start" ? "웹훅 활성" : "웹훅 Disabled" })).toHaveLength(2));
  expect(fetchXCollectionStatus).toHaveBeenCalledTimes(2);
});
it("keeps official failure and incomplete work visible when Fx is healthy and webhook is Disabled", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  expect(await screen.findByRole("heading", { name: "FxEmbed 기본 수집" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "공식 X 정기 보강" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "웹훅 Disabled" })).toBeTruthy();
  expect(screen.getByText(/공식 X 미완료 1개 · 오류 1개/)).toBeTruthy();
  expect(changeXCollectionSource).not.toHaveBeenCalled();
});
it("rolls back the primary source without enabling the webhook", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  vi.mocked(changeXCollectionSource).mockResolvedValue({ ...status, primarySource: "x_api" });
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "공식 X 기본 수집으로 복귀" }));
  await waitFor(() => expect(changeXCollectionSource).toHaveBeenCalledExactlyOnceWith("x_api"));
  expect(await screen.findByRole("button", { name: "FxEmbed 기본 수집 사용" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "웹훅 Disabled" })).toBeTruthy();
});
it("retains the actual source after a failed switch and does not retry the mutation", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue({ ...status, primarySource: "x_api" });
  vi.mocked(changeXCollectionSource).mockRejectedValue(new Error("x_activity_provider_500"));
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "FxEmbed 기본 수집 사용" }));
  expect(await screen.findByText(/수집원 전환을 완료하지 못했습니다/)).toBeTruthy();
  await waitFor(() => expect(fetchXCollectionStatus).toHaveBeenCalledTimes(2));
  expect(changeXCollectionSource).toHaveBeenCalledTimes(1);
});
it("unconfigured_legacy_does_not_show_rss_enabled and applies policy through the same PATCH control", async () => {
  const invalidation = vi.spyOn(QueryClient.prototype,"invalidateQueries");
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  vi.mocked(changeXCollectionSource).mockResolvedValue({ ...status, hybridPolicy: "rss_v1", rss: { ...status.rss, enabled: true } });
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "혼합 구성 적용" }));
  await waitFor(() => expect(changeXCollectionSource).toHaveBeenCalledExactlyOnceWith("fxembed"));
  expect(await screen.findByRole("heading", { name: "FxEmbed RSS 보완 활성" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "혼합 구성 적용" })).toBeNull();
  expect(invalidation).toHaveBeenCalledWith({queryKey:queryKeys.settings.detail()});
  expect(invalidation).toHaveBeenCalledWith({queryKey:queryKeys.operations.all});
});
it("rss_success_cannot_hide_official_overdue", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue({ ...status, hybridPolicy: "rss_v1", rss: { ...status.rss, enabled: true, lastHttpSuccessAt: Date.now() }, accounts: [{
    handle: "member", fxLastSuccessAt: Date.now(), fxLastCompletedAt: null, fxPending: false, fxError: null, consecutiveFailures: 0, consecutiveSuccesses: 2, fallbackActive: false,
    officialLastCompletedAt: 1, officialRegularCompletedAt: 1, officialPending: true, officialError: "upstream_unavailable", officialNextEligibleAt: 2, officialNominalDueAt: 1, officialBlockedReason: "shared_budget_unavailable", officialRegularAgeMs: 25*3600000, officialHealth: "overdue",
    rssLastHttpSuccessAt: Date.now(), rssLastCheckCompletedAt: null, rssPendingCandidates: 2, rssWindowReduced: true, rssError: null,
  }] });
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  expect(await screen.findByText(/공식 정기 완료 24시간 지연/)).toBeTruthy();
  expect(screen.getByText(/공통 예산 확인 불가로 REST 실행 차단/)).toBeTruthy();
});
it("labels the bounded recent check and its limit without claiming full traversal", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue({ ...status, fxembed: { ...status.fxembed, lookbackHours: 48, maxPages: 4, lastCompletedAt: 100, lastWindowUntilAt: 90, pendingSources: 0, limitedSources: 1, retiredSources: 1 } });
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  expect(await screen.findByText(/최근 48시간 · 최대 4페이지 확인/)).toBeTruthy();
  expect(screen.getByText(/^확인 완료 /)).toBeTruthy();
  expect(screen.getByText(/상한 도달 1계정/)).toBeTruthy();
  expect(screen.getByText(/이전 탐색 기록 보존 1계정/)).toBeTruthy();
  expect(screen.queryByText(/전체 탐색 완료/)).toBeNull();
  expect(screen.getByText(/공식 X 미완료 1개 · 오류 1개/)).toBeTruthy();
});
it("marks stale collection status after GET failure and disables mutation", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  await screen.findByText(/현재 기본 수집원/);
  vi.mocked(fetchXCollectionStatus).mockRejectedValue(new Error("offline"));
  fireEvent.click(screen.getByRole("button", { name: "수집원 상태 새로고침" }));
  expect(await screen.findByText(/아래는 이전 조회 정보/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "혼합 구성 적용" }) as HTMLButtonElement).disabled).toBe(true);
});
