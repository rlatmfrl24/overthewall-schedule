// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import type { XCollectionStatusDto } from "@contracts/x-collection";
import { fetchXCollectionStatus, changeXCollectionSource } from "../../api/x-collection-api";
import { XCollectionManager } from "./x-collection-manager";
import { XActivityManager } from "./x-activity-manager";
import { fetchXActivity, stopXActivity } from "../../api/x-activity-api";
import type { XActivityStatusDto } from "@contracts/x-activity";
vi.mock("../../api/x-activity-api", () => ({ xActivityQueryKey: ["member-posts", "x-activity"], fetchXActivity: vi.fn(), startXActivity: vi.fn(), stopXActivity: vi.fn() }));
vi.mock("../../api/x-collection-api", () => ({ xCollectionQueryKey: ["member-posts", "x-collection"], fetchXCollectionStatus: vi.fn(), changeXCollectionSource: vi.fn() }));
const status: XCollectionStatusDto = { primarySource: "fxembed", hybridPolicy: null, rss: { enabled: false, intervalHours: 6, lastHttpSuccessAt: null, lastCheckCompletedAt: null, pendingSources: 0, pendingCandidates: 0, windowReduced: false, error: null }, observedAt: 1, accounts: [], fxembed: { intervalMinutes: 30, lastSuccessAt: 1, lastCompletedAt: null, pendingSources: 1, failedSources: 0 }, xApi: { intervalHours: 24, lastRegularCompletedAt: 1, nextRegularEligibleAt: 2, pendingSources: 1, failedSources: 1, budgetReady: true }, webhook: { state: "disabled", siteActiveCount: 0, reason: "hybrid", error: null } };
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); });
it.each(["stop", "failed-stop"])("refreshes collection data after webhook %s", async action => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  const activity: XActivityStatusDto = { configured: true, callbackUrl: null, subscription: null, site: "otw", mode: "normal", budget: { limitMicros: 1000000, usedMicros: 0, reservedMicros: 0, strictDailyCap: false }, events: [], sites: [{ site: "otw", enabled: true, activeCount: 1, targetCount: 1, failedCount: 0, pauseReason: null, lastError: null, resumeAt: null }] };
  vi.mocked(fetchXActivity).mockResolvedValue(activity);
  vi.mocked(stopXActivity).mockImplementation(async () => {
    if (action === "failed-stop") throw new Error("x_activity_provider_503");
    return { ...activity, mode: "user_paused", sites: [{ ...activity.sites![0]!, enabled: false, activeCount: 0 }] };
  });
  render(createElement("div", null, createElement(XCollectionManager, { enabled: true }), createElement(XActivityManager)), { wrapper: createQueryWrapper() });
  const sourcePanel = await screen.findByRole("region", { name: "X 혼합 수집 관리" });
  expect(sourcePanel.textContent).not.toMatch(/웹훅|구독/);
  const details = (await screen.findByText("X 신규 피드 구독")).closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  fireEvent.click(await screen.findByRole("switch", { name: "웹훅 활성화" }));
  await waitFor(() => expect(fetchXCollectionStatus).toHaveBeenCalledTimes(2));
});
it("keeps official failure and incomplete work visible when Fx is healthy and webhook is Disabled", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  expect(await screen.findByRole("heading", { name: "FxEmbed 기본 수집" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "공식 X 정기 보강" })).toBeTruthy();
  expect(screen.queryByText(/웹훅/)).toBeNull();
  const official = within(screen.getByRole("article", { name: "공식 X 정기 보강" }));
  expect(official.getByText("미완료 · 오류").nextElementSibling?.textContent).toBe("1 · 1계정");
  expect(changeXCollectionSource).not.toHaveBeenCalled();
});
it("rolls back the primary source without enabling the webhook", async () => {
  vi.mocked(fetchXCollectionStatus).mockResolvedValue(status);
  vi.mocked(changeXCollectionSource).mockResolvedValue({ ...status, primarySource: "x_api" });
  render(createElement(XCollectionManager, { enabled: true }), { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "공식 X 기본 수집으로 복귀" }));
  await waitFor(() => expect(changeXCollectionSource).toHaveBeenCalledExactlyOnceWith("x_api"));
  expect(await screen.findByRole("button", { name: "FxEmbed 기본 수집 사용" })).toBeTruthy();
  expect(screen.queryByText(/웹훅/)).toBeNull();
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
  const rss = within(await screen.findByRole("article", { name: "FxEmbed RSS 보완" }));
  expect(await rss.findByText("6시간 간격")).toBeTruthy();
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
  expect(screen.getByText("확인 완료")).toBeTruthy();
  expect(screen.getByText(/상한 도달 1계정/)).toBeTruthy();
  expect(screen.getByText(/이전 탐색 기록 보존 1계정/)).toBeTruthy();
  expect(screen.queryByText(/전체 탐색 완료/)).toBeNull();
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
