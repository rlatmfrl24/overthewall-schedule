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
const approveSelectedPendingSchedulesMock = vi.hoisted(() => vi.fn());
const rejectSelectedPendingSchedulesMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
  runAutoUpdateNow: runAutoUpdateNowMock,
  fetchPendingSchedules: fetchPendingSchedulesMock,
  approvePendingSchedule: approvePendingScheduleMock,
  rejectPendingSchedule: rejectPendingScheduleMock,
  resetPendingScheduleProcessed: resetPendingScheduleProcessedMock,
  approveSelectedPendingSchedules: approveSelectedPendingSchedulesMock,
  rejectSelectedPendingSchedules: rejectSelectedPendingSchedulesMock,
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

const makePendingSchedule = (overrides = {}) => ({
  id: 101,
  member_uid: 1,
  member_name: "테스트 멤버",
  date: "2026-07-09",
  start_time: "12:20",
  title: "수집된 방송",
  status: "upcoming",
  action_type: "create",
  existing_schedule_id: null,
  previous_status: null,
  previous_title: null,
  vod_id: "vod-101",
  vod_started_at: "2026-07-09T03:20:00.000Z",
  vod_duration_seconds: 3600,
  vod_thumbnail_url: null,
  processed_reset_at: null,
  created_at: "2026-07-09T00:00:00.000Z",
  has_same_day_schedule: true,
  same_day_schedule_count: 2,
  same_day_schedules: [
    {
      id: 201,
      start_time: "12:00",
      title: "기존 방송",
      status: "scheduled",
    },
    {
      id: 202,
      start_time: "13:00",
      title: "다른 기존 방송",
      status: "scheduled",
    },
  ],
  existing_schedule: null,
  empty_target_schedule: null,
  can_apply_to_empty_target: false,
  is_processed: false,
  processed_decision: null,
  processed_at: null,
  processed_actor_name: null,
  ...overrides,
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
    approveSelectedPendingSchedulesMock.mockResolvedValue({
      success: true,
      totalRequested: 1,
      successCount: 1,
      failedCount: 0,
      results: [{ id: 101, success: true }],
    });
    rejectSelectedPendingSchedulesMock.mockResolvedValue({
      success: true,
      totalRequested: 1,
      successCount: 1,
      failedCount: 0,
      results: [{ id: 101, success: true }],
    });
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

  it("승인 대기 항목의 중복/변경 경고와 일괄 승인 확인을 표시한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValueOnce([
      makePendingSchedule(),
    ]).mockResolvedValueOnce([]);

    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(screen.getByText("중복 가능")).toBeTruthy());
    expect(screen.getByText("변경 2개")).toBeTruthy();
    expect(screen.getByText("검토 필요")).toBeTruthy();
    expect(screen.getByText("중복 후보")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "전체 승인" }));

    expect(screen.getByText("승인 대기 전체 승인")).toBeTruthy();
    expect(screen.getByText(/현재 목록의 처리 전 항목 1건/)).toBeTruthy();
    expect(screen.getAllByText("중복 가능 1건").length).toBeGreaterThanOrEqual(
      2,
    );

    const approveButtons = screen.getAllByRole("button", { name: "전체 승인" });
    fireEvent.click(approveButtons[approveButtons.length - 1]);

    await waitFor(() =>
      expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101]),
    );
  });
});
