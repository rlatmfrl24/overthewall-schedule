// @vitest-environment jsdom
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

  const holidayPending = (overrides = {}) => makePendingSchedule({
    candidate_kind: "holiday_suggestion", status: "휴방", title: "휴방 추정",
    start_time: null, vod_id: null, vod_started_at: null, source_vod_ids: [],
    session_started_at: null, session_ended_at: null, vod_segment_count: 0,
    same_day_schedules: [], same_day_schedule_count: 0, has_same_day_schedule: false,
    holiday_evidence: { checked_at: Date.parse("2026-07-10T09:00:00+09:00"), range_start: Date.parse("2026-07-09T00:00:00+09:00"), range_end: Date.parse("2026-07-10T00:00:00+09:00"), scan_status: "complete", broadcast_seen: false },
    ...overrides,
  });

  it("휴방 추정은 날짜와 근거를 표시하고 방송 옵션 없이 확인 후 승인한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([holidayPending()]);
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });
    const card = await screen.findByRole("article", { name: "테스트 멤버 휴방 추정" });
    expect(within(card).getByText("2026-07-09 (목) · 한국 시간")).toBeTruthy();
    expect(within(card).getByText(/기록이 남지 않은 방송/)).toBeTruthy();
    expect(within(card).queryByText("반영 범위")).toBeNull();
    expect(within(card).queryByText(/30분 단위/)).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: "휴방 승인" }));
    expect(approvePendingScheduleMock).not.toHaveBeenCalled();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText(/2026-07-09.*휴방 1건을 등록/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "휴방 1건 승인" }));
    await waitFor(() => expect(approvePendingScheduleMock).toHaveBeenCalledWith(101, expect.objectContaining({ targetMode: "create" })));
  });

  it("일괄 승인 확인에도 휴방 날짜와 건수를 표시하고 오래된 요청은 개별 승인할 수 없다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([holidayPending({ holiday_evidence: null })]);
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });
    const card = await screen.findByRole("article", { name: "테스트 멤버 휴방 추정" });
    expect(within(card).getByRole("status").textContent).toContain("오래된 요청");
    expect((within(card).getByRole("button", { name: "휴방 승인" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "전체 승인" }));
    expect(within(screen.getByRole("alertdialog")).getByText(/휴방 추정 1건 · 대상: 2026-07-09/)).toBeTruthy();
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

    fireEvent.click(await screen.findByRole("tab", { name: "설정" }));
    expect(await screen.findByText("처리 전 후보")).toBeTruthy();
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

  it("일정 수집에는 Play 전용 설정을 표시하지 않는다", async () => {
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("tab", { name: "설정" }));
    expect(screen.queryByLabelText("회원 곡 제안/일")).toBeNull();
    expect(screen.queryByText("Play 자동화")).toBeNull();
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
    expect(screen.getByRole("region", { name: "테스트 멤버 2026-07-09 기존 일정 비교" })).toBeTruthy();

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

  it("같은 날짜의 전체 일정과 시간 차이를 표시하고 실제 수정 대상을 강조한다", async () => {
    const fullTitle = "기존 방송의 긴 제목도 생략하지 않고 검토할 수 있도록 전체 내용을 표시합니다";
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({
      same_day_schedules: [
        { id: 202, start_time: "13:00", title: "오후 방송", status: "방송" },
        { id: 201, start_time: "12:00", title: fullTitle, status: "방송" },
      ],
    })]);
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });

    const comparison = await screen.findByRole("region", { name: "테스트 멤버 2026-07-09 기존 일정 비교" });
    expect(within(comparison).getByText("테스트 멤버 · 2026-07-09 (목) · 한국 시간")).toBeTruthy();
    const rows = within(comparison).getAllByRole("listitem");
    expect(within(rows[0]).getByText(fullTitle)).toBeTruthy();
    expect(within(rows[0]).getByText("추천 시작보다 20분 전 (20분 차이)")).toBeTruthy();
    expect(within(rows[1]).getByText("추천 시작보다 40분 후 (40분 차이)")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기존 수정" }));
    expect(within(comparison).getByText("현재 수정 대상")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "새로 추가" }));
    expect(within(comparison).queryByText("현재 수정 대상")).toBeNull();
  });

  it("시간 미정과 휴방을 임의의 시작 시각으로 비교하지 않는다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({
      same_day_schedules: [
        { id: 201, start_time: null, title: null, status: "미정" },
        { id: 202, start_time: null, title: "쉬어갑니다", status: "휴방" },
      ],
    })]);
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });
    const comparison = await screen.findByRole("region", { name: "테스트 멤버 2026-07-09 기존 일정 비교" });
    expect(within(comparison).getByText("시간 미정")).toBeTruthy();
    expect(within(comparison).getByText("보완할 정보: 시간 미입력 · 제목 미입력")).toBeTruthy();
    expect(within(comparison).getByText("종일")).toBeTruthy();
    expect(within(comparison).queryByText(/분 차이/)).toBeNull();
    expect(within(comparison).queryByText("추천 시각과 가장 가까움")).toBeNull();
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
