// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { XCollectionStatusDto } from "@contracts/x-collection";
import { fetchXCollectionStatus, changeXCollectionSource } from "../../api/x-collection-api";
import { XCollectionManager } from "./x-collection-manager";
vi.mock("../../api/x-collection-api", () => ({ xCollectionQueryKey: ["member-posts", "x-collection"], fetchXCollectionStatus: vi.fn(), changeXCollectionSource: vi.fn() }));
const status: XCollectionStatusDto = { primarySource: "fxembed", observedAt: 1, accounts: [], fxembed: { intervalMinutes: 30, lastSuccessAt: 1, lastCompletedAt: null, pendingSources: 1, failedSources: 0 }, xApi: { intervalHours: 24, lastRegularCompletedAt: 1, nextRegularEligibleAt: 2, pendingSources: 1, failedSources: 1, budgetReady: true }, webhook: { state: "disabled", siteActiveCount: 0, reason: "hybrid", error: null } };
afterEach(() => { cleanup(); vi.clearAllMocks(); });
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
