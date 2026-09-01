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
import { summarizePendingRejectionBatch } from "./pending-rejection-batch";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runAutoUpdateNowMock = vi.hoisted(() => vi.fn());
const fetchOperationsStatusMock = vi.hoisted(() => vi.fn());
const fetchPendingSchedulesMock = vi.hoisted(() => vi.fn());
const approvePendingScheduleMock = vi.hoisted(() => vi.fn());
const rejectPendingScheduleMock = vi.hoisted(() => vi.fn());
const resetPendingScheduleProcessedMock = vi.hoisted(() => vi.fn());
const approveSelectedPendingSchedulesMock = vi.hoisted(() => vi.fn());
const rejectSelectedPendingSchedulesMock = vi.hoisted(() => vi.fn());
const fetchScheduleCandidateRejectionsMock = vi.hoisted(() => vi.fn());
const reopenScheduleCandidateRejectionMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/settings", () => ({
  fetchSettings: fetchSettingsMock,
  updateSettings: updateSettingsMock,
}));

vi.mock("@/features/operations", () => ({
  fetchOperationsStatus: fetchOperationsStatusMock,
  runAutoUpdateNow: runAutoUpdateNowMock,
  useOperationRun: () => ({ data: null, isLoading: false }),
}));

vi.mock("@/features/schedules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/schedules")>();
  return {
    ...actual,
    fetchPendingSchedules: fetchPendingSchedulesMock,
    approvePendingSchedule: approvePendingScheduleMock,
    rejectPendingSchedule: rejectPendingScheduleMock,
    resetPendingScheduleProcessed: resetPendingScheduleProcessedMock,
    approveSelectedPendingSchedules: approveSelectedPendingSchedulesMock,
    rejectSelectedPendingSchedules: rejectSelectedPendingSchedulesMock,
    fetchScheduleCandidateRejections:
      fetchScheduleCandidateRejectionsMock,
    reopenScheduleCandidateRejection:
      reopenScheduleCandidateRejectionMock,
  };
});

vi.mock("@/shared/ui/toast", () => ({
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
  otw_play_submission_daily_limit: "5",
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
  previous_start_time: null,
  previous_title: null,
  candidate_kind: null,
  match_reason: null,
  match_confidence: null,
  missing_fields: [],
  ranked_schedules: [],
  source_vod_ids: ["vod-101"],
  session_started_at: "2026-07-09T03:20:00.000Z",
  session_ended_at: "2026-07-09T04:20:00.000Z",
  vod_segment_count: 1,
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
      segmentCount: 0,
      sessionCount: 0,
      resumeMergedCount: 0,
      rejectedSuppressed: 0,
      duplicatePending: 0,
      shortSuppressed: 0,
      holidaySuppressed: 0,
      ambiguous: 0,
      obsoletePending: 0,
      details: [],
    });
    fetchOperationsStatusMock.mockResolvedValue({
      autoUpdate: {
        lastRun: null,
        nextEligibleAt: null,
        rejectionCount: 0,
        latestRun: null,
        recentRuns: [],
      },
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
    fetchScheduleCandidateRejectionsMock.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
    });
    reopenScheduleCandidateRejectionMock.mockResolvedValue({
      success: true,
      action: "reopen_rejection",
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("압축된 자동 업데이트 KPI 바에 후보와 실행 정보를 표시한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([
      makePendingSchedule({ id: 101, action_type: "create" }),
      makePendingSchedule({ id: 102, action_type: "update" }),
    ]);
    fetchOperationsStatusMock.mockResolvedValue({
      autoUpdate: {
        lastRun: 1_756_684_800_000,
        nextEligibleAt: 1_756_706_400_000,
        rejectionCount: 4,
        latestRun: { rejectedSuppressedCount: 6 },
        recentRuns: [],
      },
    });

    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    const pendingLabel = await screen.findByText("처리 전 후보");
    expect(pendingLabel.parentElement?.parentElement?.parentElement?.className).toContain(
      "divide-y",
    );
    await waitFor(() =>
      expect(screen.getByText("신규 1 · 수정 1")).toBeTruthy(),
    );
    expect(screen.getByText("다시 수집하지 않는 후보")).toBeTruthy();
    expect(screen.getByText("최근 실행에서 제외된 후보")).toBeTruthy();
    expect(screen.getByText(/^다음 /)).toBeTruthy();
  });

  it("라이브 자동 입력 토글을 저장한다", async () => {
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("tab", { name: "설정" }));

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

  it("OTW Play 회원 제안 일일 제한을 저장한다", async () => {
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("tab", { name: "설정" }));

    const input = screen.getByLabelText("회원 곡 제안/일");
    fireEvent.change(input, { target: { value: "7" } });
    fireEvent.blur(input);

    await waitFor(() =>
      expect(updateSettingsMock).toHaveBeenCalledWith({
        otw_play_submission_daily_limit: "7",
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
    expect(screen.getByText("변경 3개")).toBeTruthy();
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

  it("V2 자동 업데이트 승인 시 가장 가까운 30분 단위 시간을 안내하고 전송한다", async () => {
    const pending = makePendingSchedule({
      candidate_kind: "missing_schedule",
      match_reason: "missing_schedule",
      match_confidence: "high",
      missing_fields: ["time", "title"],
      same_day_schedule_count: 1,
      same_day_schedules: [
        {
          id: 203,
          start_time: null,
          title: "게릴라",
          status: "게릴라",
        },
      ],
    });
    fetchPendingSchedulesMock
      .mockResolvedValueOnce([pending])
      .mockResolvedValueOnce([]);
    approvePendingScheduleMock.mockResolvedValue({
      success: true,
      action: "create",
      scheduleId: 301,
    });

    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    expect(
      await screen.findByText("가장 가까운 30분 단위로 적용"),
    ).toBeTruthy();
    expect(screen.getAllByText("12:30").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "승인" }));

    await waitFor(() =>
      expect(approvePendingScheduleMock).toHaveBeenCalledWith(101, {
        applyMode: "all",
        targetMode: "create",
        timeMode: "nearest_half_hour",
        targetScheduleId: null,
      }),
    );
  });

  it("거부 확인에서 영구 제외 영향과 필수 사유를 안내한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule()]);
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    const rejectButton = await screen.findByRole("button", { name: "거부" });
    fireEvent.click(rejectButton);

    expect(
      screen.getByRole("alertdialog", { name: "후보 영구 제외" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/동일 VOD ID는 제목이나 시간이 바뀌어도/),
    ).toBeTruthy();
    expect(screen.getByText("거부 사유")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "거부하고 제외" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  it("일괄 거부의 부분 실패와 전체 실패를 성공으로 표시하지 않는다", () => {
    expect(
      summarizePendingRejectionBatch({
        success: false,
        totalRequested: 2,
        successCount: 1,
        failedCount: 1,
        results: [
          { id: 101, success: true },
          { id: 102, success: false, error: "stale" },
        ],
      }),
    ).toEqual({
      successfulIds: [101],
      variant: "info",
      description: "거부 제외 처리: 성공 1건, 실패 1건",
    });
    expect(
      summarizePendingRejectionBatch({
        success: false,
        totalRequested: 2,
        successCount: 0,
        failedCount: 2,
        results: [
          { id: 101, success: false, error: "stale" },
          { id: 102, success: false, error: "not found" },
        ],
      }),
    ).toMatchObject({
      successfulIds: [],
      variant: "error",
      description: "거부 제외 처리에 실패했습니다: 실패 2건",
    });
  });

  it("매칭 불확실 V2 후보는 대상 일정 선택 전 승인을 비활성화한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([
      makePendingSchedule({
        action_type: "update",
        candidate_kind: "ambiguous",
        match_reason: "ambiguous",
        match_confidence: "low",
        missing_fields: [],
        ranked_schedules: [
          {
            id: 201,
            start_time: "12:00",
            title: "기존 방송",
            status: "scheduled",
            reason: "time_window",
            confidence: "medium",
            time_difference_minutes: 20,
            title_similarity: 0.2,
          },
          {
            id: 202,
            start_time: "13:00",
            title: "다른 기존 방송",
            status: "scheduled",
            reason: "time_window",
            confidence: "medium",
            time_difference_minutes: 40,
            title_similarity: 0.1,
          },
        ],
      }),
    ]);
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    expect((await screen.findAllByText("매칭 불확실")).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText(/승인할 기존 일정을 반드시 선택하세요/),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "승인" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("button", { name: "전체" })
        .some((button) => button.hasAttribute("disabled")),
    ).toBe(true);
  });
});
