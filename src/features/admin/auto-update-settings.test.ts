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
import { createQueryWrapper } from "@/test/query-client";
import { AutoUpdateSettingsManager } from "./auto-update-settings";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runAutoUpdateNowMock = vi.hoisted(() => vi.fn());
const fetchPendingSchedulesMock = vi.hoisted(() => vi.fn());
const approvePendingScheduleMock = vi.hoisted(() => vi.fn());
const rejectPendingScheduleMock = vi.hoisted(() => vi.fn());
const resetPendingScheduleProcessedMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
  runAutoUpdateNow: runAutoUpdateNowMock,
  fetchPendingSchedules: fetchPendingSchedulesMock,
  approvePendingSchedule: approvePendingScheduleMock,
  rejectPendingSchedule: rejectPendingScheduleMock,
  resetPendingScheduleProcessed: resetPendingScheduleProcessedMock,
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const makeSettings = () => ({
  auto_update_enabled: "true",
  auto_update_interval_hours: "6",
  auto_update_last_run: null,
  auto_update_range_days: "3",
  live_schedule_auto_fill_enabled: "true",
  x_rich_link_preview_enabled: "false",
  x_posts_visibility: "members",
  naver_cafe_posts_enabled: "true",
  naver_cafe_posts_visibility: "members",
  x_collection_enabled: "true",
  x_collection_daily_budget_cents: "100",
  x_collection_interval_hours: "2",
  x_collection_last_run: null,
});

describe("AutoUpdateSettingsManager", () => {
  beforeEach(() => {
    fetchSettingsMock.mockResolvedValue(makeSettings());
    updateSettingsMock.mockResolvedValue(undefined);
    runAutoUpdateNowMock.mockResolvedValue({
      success: true,
      updated: 0,
      checked: 0,
      details: [],
    });
    fetchPendingSchedulesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("라이브 자동 입력 토글을 저장한다", async () => {
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());

    const switchControl = screen.getByRole("switch", {
      name: "라이브 자동 입력",
    });
    expect(switchControl.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(switchControl);

    await waitFor(() =>
      expect(updateSettingsMock).toHaveBeenCalledWith({
        live_schedule_auto_fill_enabled: "false",
      }),
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "라이브 자동 입력을 비활성화했습니다.",
      }),
    );
  });
});
