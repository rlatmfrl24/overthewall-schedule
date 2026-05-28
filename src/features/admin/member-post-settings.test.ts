// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberPostSettingsManager } from "./member-post-settings";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runXCollectionNowMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
  runXCollectionNow: runXCollectionNowMock,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("./naver-cafe-source-manager", () => ({
  NaverCafeSourceManager: () => createElement("div", null, "카페 소스 관리"),
}));

const makeSettings = () => ({
  auto_update_enabled: "true",
  auto_update_interval_hours: "6",
  auto_update_last_run: null,
  auto_update_range_days: "3",
  x_rich_link_preview_enabled: "false",
  x_posts_visibility: "members",
  naver_cafe_posts_enabled: "true",
  naver_cafe_posts_visibility: "members",
  x_collection_enabled: "true",
  x_collection_daily_budget_cents: "100",
  x_collection_interval_hours: "6",
  x_collection_last_run: null,
});

describe("MemberPostSettingsManager", () => {
  beforeEach(() => {
    fetchSettingsMock.mockResolvedValue(makeSettings());
    updateSettingsMock.mockResolvedValue(undefined);
    runXCollectionNowMock.mockResolvedValue({
      success: true,
      status: "success",
      checkedHandles: 2,
      refreshedHandles: 2,
      postsReturned: 4,
      postsStored: 4,
      apiCalls: 4,
      estimatedCostMicros: 40_000,
      error: null,
      updatedAt: "2026-05-28T08:00:00.000Z",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("X 수집 주기와 수동 실행 결과를 표시한다", async () => {
    render(createElement(MemberPostSettingsManager));

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());
    expect(screen.getByText("수집 주기")).toBeTruthy();
    expect(screen.getByText("6시간마다")).toBeTruthy();
    expect(screen.getByText(/마지막 실행:/)).toBeTruthy();

    const runButton = screen.getByRole("button", { name: /지금 수집/ });
    fireEvent.click(runButton);

    await waitFor(() => expect(runXCollectionNowMock).toHaveBeenCalled());
    expect(screen.getByText("완료")).toBeTruthy();
    expect(screen.getByText("확인 2개")).toBeTruthy();
    expect(screen.getByText("저장 4개")).toBeTruthy();
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "X 게시글 4개를 저장했습니다.",
      }),
    );
  });
});
