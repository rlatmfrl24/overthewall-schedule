// @vitest-environment jsdom
import { createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { AutoUpdateSettingsManager } from "./auto-update-settings";
import { summarizePendingRejectionBatch } from "./pending-rejection-batch";

const fetchSettingsMock = vi.hoisted(() => vi.fn());
const updateSettingsMock = vi.hoisted(() => vi.fn());
const runAutoUpdateNowMock = vi.hoisted(() => vi.fn());
const useOperationRunMock = vi.hoisted(() => vi.fn());
const fetchScheduleOperationsStatusMock = vi.hoisted(() => vi.fn());
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
  fetchScheduleOperationsStatus: fetchScheduleOperationsStatusMock,
  runAutoUpdateNow: runAutoUpdateNowMock,
  useOperationRun: useOperationRunMock,
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
  it("개별 승인 중 거부 제외로 이동하면 숨긴 후보는 읽지 않고 복귀 시 한 번 갱신한다", async () => {
    let finish!: (value: unknown) => void;
    approvePendingScheduleMock.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fetchPendingSchedulesMock.mockResolvedValueOnce([makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0})]).mockResolvedValue([]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.click(await screen.findByRole("button",{name:/^승인$/}));
    fireEvent.click(screen.getByRole("tab",{name:/거부 제외/}));
    await screen.findByLabelText("멤버·제목·VOD ID 검색");
    finish({success:true,action:"create",scheduleId:301});
    await waitFor(()=>expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({description:"대기 스케줄을 승인했습니다."})));
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab",{name:/^전체/}));
    await waitFor(()=>expect(screen.getByRole("tab",{name:/^전체 0$/})).toBeTruthy());
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(2);
    expect(approvePendingScheduleMock).toHaveBeenCalledTimes(1);
  });

  it("전체 승인 확인의 신규·수정 건수는 실제 선택한 반영 방식을 따른다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({action_type:"update",existing_schedule_id:201})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.click(await screen.findByRole("button",{name:"새로 추가"}));
    fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("신규 1건")).toBeTruthy();
    expect(within(dialog).getByText("수정 0건")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button",{name:"전체 승인"}));
    await waitFor(()=>expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101],{"101":expect.objectContaining({targetMode:"create"})}));
  });

  it.each([false, true])("전체 승인 확인 중 대상이 바뀌면 확인을 막는다 (직접 편집: %s)", async edited => {
    const existing = {id:201,title:null,start_time:"12:00",status:"방송"};
    const candidate = makePendingSchedule({candidate_kind:"fill_missing_fields",action_type:"update",existing_schedule:existing,same_day_schedules:[existing]});
    fetchPendingSchedulesMock.mockResolvedValue([candidate]);
    const client = createTestQueryClient();
    render(createElement(QueryClientProvider,{client},createElement(AutoUpdateSettingsManager)));
    const title = await screen.findByRole("textbox",{name:"승인할 제목"});
    if (edited) fireEvent.change(title,{target:{value:"내 편집"}});
    fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
    act(()=>client.setQueryData(queryKeys.settings.pending(),[{...candidate,existing_schedule:{...existing,title:"다른 관리자"},same_day_schedules:[{...existing,title:"다른 관리자"}]}]));
    const dialog = screen.getByRole("alertdialog");
    await waitFor(()=>expect(within(dialog).getByRole("button",{name:"전체 승인"})).toHaveProperty("disabled",true));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/Diff.*다시 확인/);
    expect(approveSelectedPendingSchedulesMock).not.toHaveBeenCalled();
  });

  it.each(["single", "batch"])("%s 승인은 수정 후보의 기본 선택과 비교 대상 값을 함께 전송한다", async mode => {
    const existing = {id:201,start_time:"12:00",title:"기존 제목",status:"미정"};
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"fill_missing_fields",action_type:"update",existing_schedule:existing,same_day_schedules:[existing],missing_fields:["title"]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    expect((await screen.findByRole("checkbox",{name:"제목 반영"})).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox",{name:"방송 시간 반영"}).getAttribute("aria-checked")).toBe("true");
    const payload = expect.objectContaining({applyMode:"all",targetMode:"update",targetScheduleId:201,changes:{title:"수집된 방송",startTime:"12:30"},expectedTarget:{title:"기존 제목",startTime:"12:00",status:"미정"}});
    if (mode === "single") {
      fireEvent.click(screen.getByRole("button",{name:"승인"}));
      await waitFor(()=>expect(approvePendingScheduleMock).toHaveBeenCalledWith(101,payload));
    } else {
      fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"전체 승인"}));
      await waitFor(()=>expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101],{"101":payload}));
    }
  });

  it("수집된 제목이 없으면 기존 제목을 유지하고 유효한 시간만 기본 반영한다", async () => {
    const existing = {id:201,start_time:"12:00",title:"기존 제목",status:"미정"};
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"fill_missing_fields",action_type:"update",title:" ",existing_schedule:existing,same_day_schedules:[existing]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    expect((await screen.findByRole("checkbox",{name:"제목 반영"})).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button",{name:"승인"}));
    await waitFor(()=>expect(approvePendingScheduleMock).toHaveBeenCalledWith(101,expect.objectContaining({applyMode:"time",changes:{startTime:"12:30"}})));
  });

  it("Diff 편집은 선택한 기존 제목만 바꾸고 입력 중에는 요청하지 않는다", async () => {
    const existing = {id:201,start_time:"12:00",title:"보존할 기존 제목",status:"미정"};
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"fill_missing_fields",action_type:"update",existing_schedule:existing,same_day_schedules:[existing]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const title = await screen.findByRole("checkbox",{name:"제목 반영"});
    expect(title.getAttribute("data-state")).toBe("checked");
    fireEvent.click(screen.getByRole("checkbox",{name:"방송 시간 반영"}));
    fireEvent.change(screen.getByRole("textbox",{name:"승인할 제목"}),{target:{value:"관리자 수정 제목"}});
    expect(within(screen.getByRole("table",{name:"테스트 멤버 2026-07-09 변경 비교"})).getByText("보존할 기존 제목")).toBeTruthy();
    expect(approvePendingScheduleMock).not.toHaveBeenCalled();
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button",{name:/^승인$/}));
    await waitFor(()=>expect(approvePendingScheduleMock).toHaveBeenCalledWith(101,expect.objectContaining({changes:{title:"관리자 수정 제목"},expectedTarget:{title:"보존할 기존 제목",startTime:"12:00",status:"미정"}})));
  });

  it("Diff 편집의 미선택·잘못된 값은 승인을 막고 입력과 승인 시각을 구분한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.click(await screen.findByRole("checkbox",{name:"제목 반영"}));
    fireEvent.click(screen.getByRole("checkbox",{name:"방송 시간 반영"}));
    expect(screen.getByText("반영할 항목을 하나 이상 선택하세요.")).toBeTruthy();
    expect(screen.getByRole("button",{name:/^승인$/})).toHaveProperty("disabled",true);
    fireEvent.click(screen.getByRole("checkbox",{name:"방송 시간 반영"}));
    fireEvent.change(screen.getByLabelText("승인할 방송 시간"),{target:{value:""}});
    expect(screen.getByRole("button",{name:/^승인$/})).toHaveProperty("disabled",true);
    fireEvent.change(screen.getByLabelText("승인할 방송 시간"),{target:{value:"13:16"}});
    expect(screen.getByText(/승인 시각.*13:30/)).toBeTruthy();
    expect(screen.getByRole("button",{name:/^승인$/})).toHaveProperty("disabled",false);
    expect(approvePendingScheduleMock).not.toHaveBeenCalled();
  });

  it("항목별 편집값은 전체 승인에도 전달하고 실패한 항목의 draft를 유지한다", async () => {
    const first = makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0});
    const second = makePendingSchedule({id:102,member_name:"후속 멤버",candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0});
    fetchPendingSchedulesMock.mockResolvedValueOnce([first,second]).mockResolvedValue([second]);
    approveSelectedPendingSchedulesMock.mockResolvedValue({success:false,totalRequested:2,successCount:1,failedCount:1,results:[{id:101,success:true},{id:102,success:false,error:"conflict"}]});
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const titles = await screen.findAllByRole("textbox",{name:"승인할 제목"});
    fireEvent.change(titles[0],{target:{value:"첫 제목 수정"}});
    fireEvent.change(screen.getAllByLabelText("승인할 방송 시간")[1],{target:{value:"14:16"}});
    fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"전체 승인"}));
    await waitFor(()=>expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101,102],expect.objectContaining({
      "101":expect.objectContaining({changes:expect.objectContaining({title:"첫 제목 수정"})}),
      "102":expect.objectContaining({changes:expect.objectContaining({startTime:"14:16"})}),
    })));
    await waitFor(()=>expect(screen.getAllByLabelText("승인할 방송 시간")).toHaveLength(1));
    expect(screen.getByLabelText("승인할 방송 시간")).toHaveProperty("value","14:16");
  });

  it("일괄 승인 중 개별 조작과 Diff 입력을 잠근다", async () => {
    let finish!: (value: unknown) => void;
    approveSelectedPendingSchedulesMock.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    await screen.findByRole("textbox",{name:"승인할 제목"});
    fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"전체 승인"}));
    await waitFor(()=>expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledTimes(1));
    try {
      expect(screen.getByRole("button",{name:/^승인$/})).toHaveProperty("disabled",true);
      expect(screen.getByRole("button",{name:/^거부$/})).toHaveProperty("disabled",true);
      expect(screen.getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("disabled",true);
    } finally {
      finish({success:true,totalRequested:1,successCount:1,failedCount:0,results:[{id:101,success:true}]});
    }
    await waitFor(()=>expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("Diff 편집 중 대상이 새로 바뀌면 draft를 보존하고 재확인 전 승인을 막는다", async () => {
    const existing = {id:201,start_time:"12:00",title:"기존",status:"방송"};
    const candidate = makePendingSchedule({candidate_kind:"fill_missing_fields",action_type:"update",existing_schedule:existing,same_day_schedules:[existing]});
    fetchPendingSchedulesMock.mockResolvedValueOnce([candidate]).mockResolvedValue([{...candidate,existing_schedule:{...existing,title:"다른 관리자"},same_day_schedules:[{...existing,title:"다른 관리자"}]}]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.change(await screen.findByRole("textbox",{name:"승인할 제목"}),{target:{value:"내 수정"}});
    fireEvent.click(screen.getByRole("button",{name:"상태 새로고침"}));
    expect(await screen.findByText(/기존 일정이 바뀌었습니다/)).toBeTruthy();
    expect(screen.getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","내 수정");
    expect(screen.getByRole("button",{name:/^승인$/})).toHaveProperty("disabled",true);
  });

  it.each(["single", "batch"])("%s 승인은 체크 재선택 후 제목·시간 초안을 복원하고 선택 필드만 전송한다", async mode => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.change(await screen.findByRole("textbox",{name:"승인할 제목"}),{target:{value:"재선택해도 유지할 제목"}});
    fireEvent.change(screen.getByLabelText("승인할 방송 시간"),{target:{value:"14:16"}});
    for (const name of ["제목 반영", "방송 시간 반영"]) {
      fireEvent.click(screen.getByRole("checkbox",{name}));
      fireEvent.click(screen.getByRole("checkbox",{name}));
    }
    expect(screen.getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","재선택해도 유지할 제목");
    expect(screen.getByLabelText("승인할 방송 시간")).toHaveProperty("value","14:16");
    fireEvent.click(screen.getByRole("checkbox",{name:"방송 시간 반영"}));
    if (mode === "single") {
      fireEvent.click(screen.getByRole("button",{name:/^승인$/}));
      await waitFor(()=>expect(approvePendingScheduleMock).toHaveBeenCalledWith(101,expect.objectContaining({changes:{title:"재선택해도 유지할 제목"}})));
      expect(approvePendingScheduleMock.mock.calls[0][1]).not.toHaveProperty("draftValues");
    } else {
      fireEvent.click(screen.getByRole("button",{name:"전체 승인"}));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button",{name:"전체 승인"}));
      await waitFor(()=>expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101],{"101":expect.objectContaining({changes:{title:"재선택해도 유지할 제목"}})}));
      expect(approveSelectedPendingSchedulesMock.mock.calls[0][1]["101"]).not.toHaveProperty("draftValues");
    }
  });

  it("이미 처리된 읽기 전용 후보는 전체 승인 대상에서 제외한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({is_processed:true,processed_decision:"approved"})]);
    render(createElement(AutoUpdateSettingsManager),{wrapper:createQueryWrapper()});
    await screen.findByRole("article",{name:"테스트 멤버 일정 후보"});
    expect(screen.getByRole("button",{name:"전체 승인"})).toHaveProperty("disabled",true);
    expect(screen.queryByRole("textbox",{name:"승인할 제목"})).toBeNull();
  });

  it("거부 제외 내부 탭은 필요한 목록만 읽고 돌아와도 편집과 후보 캐시를 보존한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"missing_schedule",same_day_schedules:[],same_day_schedule_count:0})]);
    render(createElement<{activeTab:"review"}>(AutoUpdateSettingsManager,{activeTab:"review"}),{wrapper:createQueryWrapper()});
    const input = await screen.findByRole("textbox",{name:"승인할 제목"});
    fireEvent.change(input,{target:{value:"탭을 오가도 유지할 편집"}});
    fireEvent.click(screen.getByRole("tab",{name:/거부 제외/}));
    await screen.findByRole("tabpanel",{name:"거부 제외"});
    expect(screen.queryByRole("button",{name:"전체 승인"})).toBeNull();
    expect(screen.queryByRole("combobox",{name:"정렬"})).toBeNull();
    expect(fetchScheduleCandidateRejectionsMock).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText("멤버·제목·VOD ID 검색"),{target:{value:"검색 유지"}});
    await waitFor(()=>expect(fetchScheduleCandidateRejectionsMock).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("tab",{name:"전체 1"}));
    expect(await screen.findByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","탭을 오가도 유지할 편집");
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("tab",{name:/거부 제외/}));
    expect(await screen.findByLabelText("멤버·제목·VOD ID 검색")).toHaveProperty("value","검색 유지");
    expect(fetchScheduleCandidateRejectionsMock).toHaveBeenCalledTimes(2);
    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(1);
    expect(runAutoUpdateNowMock).not.toHaveBeenCalled();
    expect(reopenScheduleCandidateRejectionMock).not.toHaveBeenCalled();
  });
  it("기존 수정의 이전값과 변경값을 구분하고 제목만 반영할 때 시간은 유지한다", async () => {
    const existing = {id:201,start_time:"12:00",title:"기존 방송",status:"방송"};
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({action_type:"update",status:"방송",existing_schedule:existing,same_day_schedule_count:1,same_day_schedules:[existing]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const diff = await screen.findByRole("table", {name:"테스트 멤버 2026-07-09 변경 비교"});
    expect(within(within(diff).getByRole("row",{name:/상태/})).getByText("동일")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox",{name:"방송 시간 반영"}));
    const title = within(diff).getByRole("row",{name:/제목/});
    expect(within(title).getByText("변경")).toBeTruthy();
    expect(within(title).getByText("기존 방송")).toBeTruthy();
    expect(within(title).getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","수집된 방송");
    expect(within(within(diff).getByRole("row",{name:/방송 시간/})).getByText("유지")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/^승인$/}));
    await waitFor(()=>expect(approvePendingScheduleMock).toHaveBeenCalledWith(101,{applyMode:"title",targetMode:"update",timeMode:"nearest_half_hour",targetScheduleId:201,changes:{title:"수집된 방송"},expectedTarget:{title:"기존 방송",startTime:"12:00",status:"방송"}}));
  });

  it("신규 비교는 미등록 상태와 승인 후 추가 값을 구분하고 정상 추가를 위험 경고로 표시하지 않는다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"missing_schedule",status:"방송",same_day_schedule_count:0,same_day_schedules:[]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const diff = await screen.findByRole("table", {name:"테스트 멤버 2026-07-09 변경 비교"});
    expect(within(diff).getByRole("columnheader",{name:"기존 값"})).toBeTruthy();
    expect(within(diff).getByRole("columnheader",{name:/승인 후/})).toBeTruthy();
    expect(within(diff).getAllByText("미등록")).toHaveLength(3);
    expect(within(diff).getAllByText("추가",{exact:true})).toHaveLength(3);
    expect(within(diff).getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","수집된 방송");
    expect(screen.queryByText("검토 필요")).toBeNull();
    expect(screen.queryByRole("button",{name:"기존 수정"})).toBeNull();
  });

  it("매칭 대상을 고른 뒤 해당 일정만 비교하고 기본 반영 항목을 바꿀 수 있다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule({candidate_kind:"ambiguous",action_type:"update",missing_fields:["title"],same_day_schedule_count:2,same_day_schedules:[
      {id:201,start_time:"12:00",title:null,status:"방송"},
      {id:202,start_time:"13:00",title:"다른 방송",status:"방송"},
    ]})]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    expect(await screen.findByText("수정 대상을 선택하면 변경 내용을 비교할 수 있습니다.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button",{name:"승인"})).toHaveProperty("disabled",true);
    const targetPicker = screen.getByRole("group",{name:"수정할 기존 일정"});
    const firstTarget = within(targetPicker).getByRole("radio",{name:/#201 12:00/});
    fireEvent.click(firstTarget);
    expect(firstTarget).toHaveProperty("checked",true);
    const diff = await screen.findByRole("table",{name:"테스트 멤버 2026-07-09 변경 비교"});
    expect(within(within(diff).getByRole("row",{name:/제목/})).getByText("보완")).toBeTruthy();
    const time = within(diff).getByRole("row",{name:/방송 시간/});
    expect(within(time).getByRole("checkbox",{name:"방송 시간 반영"}).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(within(time).getByRole("checkbox",{name:"방송 시간 반영"}));
    expect(within(time).getByText("유지")).toBeTruthy();
    expect(within(time).getByText("12:00")).toBeTruthy();
    expect(within(time).queryByLabelText("승인할 방송 시간")).toBeNull();
    expect(within(screen.getByRole("region",{name:"수집 원본"})).getByText("수집된 방송")).toBeTruthy();
    fireEvent.click(within(targetPicker).getByRole("radio",{name:/#202 13:00/}));
    expect(within(diff).getByText("다른 방송")).toBeTruthy();
    expect(within(diff).getByRole("textbox",{name:"승인할 제목"})).toHaveProperty("value","수집된 방송");
    expect(within(time).queryByLabelText("승인할 방송 시간")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"선택 해제"}));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("button",{name:"승인"})).toHaveProperty("disabled",true);
    expect(approvePendingScheduleMock).not.toHaveBeenCalled();
  });

  it("자동 수집 설정을 저장하면 다음 실행 자격도 갱신한다", async () => {
    let enabled = true;
    fetchSettingsMock.mockImplementation(async()=>({...makeSettings(),auto_update_enabled:String(enabled)}));
    updateSettingsMock.mockImplementation(async(patch:{auto_update_enabled:string})=>{enabled=patch.auto_update_enabled==="true";});
    fetchScheduleOperationsStatusMock.mockImplementation(async()=>({autoUpdate:{lastRun:1,nextEligibleAt:enabled?1793836800000:null,rejectionCount:0,latestRun:null,recentRuns:[]}}));
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const control = await screen.findByRole("switch",{name:"자동 수집"});
    await screen.findByText(/^다음 가능 (?!-)/);
    fireEvent.click(control);
    expect(await screen.findByText("다음 가능 -")).toBeTruthy();
    expect(control.getAttribute("aria-checked")).toBe("false");
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(2);
  });

  it("수집 상태 조회 실패는 표시하고 자동 재조회 없이 수동 새로고침으로 복구한다", async () => {
    const client = createTestQueryClient();
    client.setDefaultOptions({queries:{retry:1,retryDelay:0,gcTime:Infinity}});
    fetchScheduleOperationsStatusMock.mockRejectedValueOnce(new Error("D1 unavailable"));
    render(createElement(AutoUpdateSettingsManager), {wrapper:({children})=>createElement(QueryClientProvider,{client,children})});
    expect(await screen.findByRole("alert")).toBeTruthy();
    await new Promise(resolve=>setTimeout(resolve,40));
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(1);
    const refresh = screen.getByRole("button",{name:"상태 새로고침"});
    await waitFor(()=>expect(refresh).toHaveProperty("disabled",false));
    fireEvent.click(refresh);
    await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(2);
  });

  it("거부 제외는 공통 설정/상태와 선택한 목록만 읽고 숨긴 후보를 조회하지 않는다", async () => {
    render(createElement<{activeTab:"rejections"}>(AutoUpdateSettingsManager, {activeTab:"rejections"}), {wrapper:createQueryWrapper()});
    await screen.findByRole("tabpanel", {name:"거부 제외"});
    await waitFor(() => expect(fetchScheduleCandidateRejectionsMock).toHaveBeenCalledTimes(1));
    const refresh = screen.getByRole("button", {name:"상태 새로고침"});
    await waitFor(() => expect(refresh).toHaveProperty("disabled",false));
    fireEvent.click(refresh);
    await waitFor(() => expect(fetchScheduleCandidateRejectionsMock).toHaveBeenCalledTimes(2));
    expect(fetchSettingsMock).toHaveBeenCalledTimes(2);
    expect(fetchPendingSchedulesMock).not.toHaveBeenCalled();
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("tab",{name:"전체 —"})).toBeTruthy();
  });

  it("사유 확인 후 거부하면 후보를 한 번만 갱신하고 설정을 다시 읽지 않는다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule()]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    fireEvent.click(await screen.findByRole("button", {name:"거부"}));
    const dialog = screen.getByRole("alertdialog", {name:"후보 영구 제외"});
    expect(rejectPendingScheduleMock).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("combobox"));
    fireEvent.click(await screen.findByRole("option", {name:"중복 후보"}));
    fireEvent.click(within(dialog).getByRole("button", {name:"거부하고 제외"}));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(rejectPendingScheduleMock).toHaveBeenCalledWith(101, {reasonCode:"duplicate",reasonNote:null});
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(2);
    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
  });

  it("후보 건수를 필터에 모으고 보관 항목과 실제 일괄 처리 대상을 구분한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([
      makePendingSchedule({id:101}),
      makePendingSchedule({id:102,content_access:"admin_archive"}),
      makePendingSchedule({id:103,action_type:"update"}),
    ]);
    render(createElement(AutoUpdateSettingsManager), {wrapper:createQueryWrapper()});
    const filters = await screen.findByRole("tablist", {name:"후보 유형"});
    await within(filters).findByRole("tab", {name:"전체 3"});
    expect(screen.queryByText("처리 전 후보")).toBeNull();
    fireEvent.click(within(filters).getByRole("tab", {name:"신규 2"}));
    expect(screen.getByText("표시 2 / 전체 3건")).toBeTruthy();
    expect(screen.getByText("처리 가능 1건")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", {name:"전체 승인"}));
    expect(within(screen.getByRole("alertdialog")).getByText(/처리 전 항목 1건/)).toBeTruthy();
    expect(approveSelectedPendingSchedulesMock).not.toHaveBeenCalled();
  });

  it("일정 검수에서 수집 설정과 승인 대기를 한 번의 조회로 함께 표시한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([makePendingSchedule()]);
    render(createElement<{activeTab:"review"}>(AutoUpdateSettingsManager, {activeTab:"review"}), {wrapper:createQueryWrapper()});
    expect(await screen.findByRole("switch", {name:"라이브 자동 입력"})).toBeTruthy();
    expect(screen.getByRole("switch", {name:"자동 수집"})).toBeTruthy();
    expect(screen.getByRole("heading", {name:"승인 대기 스케줄"})).toBeTruthy();
    const settings = screen.getByRole("region", {name:"일정 수집 설정"});
    expect(within(settings).getByRole("button", {name:"지금 수집"})).toBeTruthy();
    expect(within(settings).getByRole("button", {name:"상태 새로고침"})).toBeTruthy();
    const toolbar = screen.getByRole("group", {name:"후보 목록 조작"});
    expect(within(toolbar).getByRole("tablist", {name:"후보 유형"})).toBeTruthy();
    expect(within(toolbar).getByRole("button", {name:"전체 승인"})).toBeTruthy();
    expect(within(toolbar).getByRole("button", {name:"전체 거부"})).toBeTruthy();
    expect(screen.queryByRole("link", {name:"수집 설정·실행"})).toBeNull();
    expect(fetchSettingsMock).toHaveBeenCalledTimes(1);
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(1);
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(1);
  });

  it("검수 화면의 수집 요청은 대기열 등록과 진행 상태를 보여주고 승인하지 않는다", async () => {
    render(createElement<{activeTab:"review"}>(AutoUpdateSettingsManager, {activeTab:"review"}), {wrapper:createQueryWrapper()});
    const run = await screen.findByRole("button", {name:"지금 수집"});
    await waitFor(() => expect(run).toHaveProperty("disabled", false));
    fireEvent.click(run);
    expect(await screen.findByText("최근 비동기 수집")).toBeTruthy();
    expect(screen.getByText("실행 ID schedule-run")).toBeTruthy();
    expect(screen.getByText("작업 상태를 확인하고 있습니다.")).toBeTruthy();
    expect(runAutoUpdateNowMock).toHaveBeenCalledTimes(1);
    expect(approvePendingScheduleMock).not.toHaveBeenCalled();
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("통합 새로고침은 설정·후보·운영 상태를 각각 한 번 갱신한다", async () => {
    render(createElement<{activeTab:"review"}>(AutoUpdateSettingsManager, {activeTab:"review"}), {wrapper:createQueryWrapper()});
    const refresh = await screen.findByRole("button", {name:"상태 새로고침"});
    await waitFor(() => expect(refresh).toHaveProperty("disabled", false));
    fireEvent.click(refresh);
    await waitFor(() => expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(2));
    expect(fetchSettingsMock).toHaveBeenCalledTimes(2);
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(2);
    expect(runAutoUpdateNowMock).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "partial"])("%s 수집 종료 뒤 상태와 후보를 한 번만 갱신한다", async status => {
    const finished = {runId:"schedule-run",status,progress:{succeeded:1,total:2,failed:status==="partial"?1:0,queued:0}};
    useOperationRunMock.mockImplementation(accepted => ({data:accepted?finished:null,isLoading:false}));
    const view = render(createElement<{activeTab:"review"}>(AutoUpdateSettingsManager, {activeTab:"review"}), {wrapper:createQueryWrapper()});
    const run = await screen.findByRole("button", {name:"지금 수집"});
    await waitFor(() => expect(run).toHaveProperty("disabled", false));
    fireEvent.click(run);
    await waitFor(() => expect(fetchPendingSchedulesMock.mock.calls.length).toBeGreaterThan(1));
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(screen.getByText(status, {exact:true})).toBeTruthy();
    view.unmount();
    expect(fetchSettingsMock).toHaveBeenCalledTimes(2);
    expect(fetchPendingSchedulesMock).toHaveBeenCalledTimes(2);
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(2);
  });

  beforeEach(() => {
    vi.resetAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    useOperationRunMock.mockReturnValue({data:null,isLoading:false});
    fetchSettingsMock.mockResolvedValue(makeSettings());
    updateSettingsMock.mockResolvedValue(undefined);
    runAutoUpdateNowMock.mockResolvedValue({runId:"schedule-run",jobType:"schedule_auto_update",status:"queued",acceptedAt:1,idempotencyKey:"manual-test",statusUrl:"/api/operations/runs/schedule-run"});
    fetchScheduleOperationsStatusMock.mockResolvedValue({
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

  it("수집 상태는 설정에 모으고 후보 건수는 유형 필터에만 표시한다", async () => {
    fetchPendingSchedulesMock.mockResolvedValue([
      makePendingSchedule({ id: 101, action_type: "create" }),
      makePendingSchedule({ id: 102, action_type: "update" }),
    ]);
    fetchScheduleOperationsStatusMock.mockResolvedValue({
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

    await screen.findByRole("region", { name: "일정 수집 설정" });
    const settings = screen.getByRole("region", {name:"일정 수집 설정"});
    expect(within(settings).getByText("활성 제외 4건")).toBeTruthy();
    expect(within(settings).getByText("최근 제외 6건")).toBeTruthy();
    expect(within(settings).getByText(/^최근 실행 /)).toBeTruthy();
    expect(within(settings).getByText(/^다음 가능 /)).toBeTruthy();
    expect(within(screen.getByRole("tablist", {name:"후보 유형"})).getByRole("tab", {name:"신규 1"})).toBeTruthy();
    expect(screen.queryByText("처리 전 후보")).toBeNull();
  });

  it("라이브 자동 입력 토글을 저장한다", async () => {
    render(createElement(AutoUpdateSettingsManager), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(fetchSettingsMock).toHaveBeenCalled());
    expect(screen.queryByRole("tab", { name: "설정" })).toBeNull();

    const switchControl = await screen.findByRole("switch", {
      name: "라이브 자동 입력",
    });
    expect(switchControl.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(screen.getByText("라이브 자동 입력"));

    await waitFor(() =>
      expect(updateSettingsMock).toHaveBeenCalledWith({
        live_schedule_auto_fill_enabled: "false",
      }),
    );
    expect(updateSettingsMock).toHaveBeenCalledTimes(1);
    expect(fetchScheduleOperationsStatusMock).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "라이브 자동 입력을 비활성화했습니다.",
      }),
    );
  });

  it("일정 수집에는 Play 전용 설정을 표시하지 않는다", async () => {
    render(createElement(AutoUpdateSettingsManager), { wrapper: createQueryWrapper() });
    await screen.findByRole("region", { name: "일정 수집 설정" });
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
    expect(screen.getByRole("table", {name:"테스트 멤버 2026-07-09 변경 비교"})).toBeTruthy();
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
      expect(approveSelectedPendingSchedulesMock).toHaveBeenCalledWith([101],{"101":expect.objectContaining({targetMode:"update",targetScheduleId:201})}),
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
      await screen.findByText(/가장 가까운 30분 단위로 적용/),
    ).toBeTruthy();
    expect(screen.getByText(/승인 시각 12:30/)).toBeTruthy();
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
    expect(within(screen.getByRole("article", {name:"테스트 멤버 일정 후보"})).getByRole("heading", {name:"테스트 멤버 2026-07-09 (목) · 한국 시간"})).toBeTruthy();
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
  it.each(["CONTENT_MOVED","CONTENT_CONFLICT"])("이관 응답 %s는 성공에서 제외하고 실제 안내를 표시한다",code=>{
    expect(summarizePendingRejectionBatch({success:false,totalRequested:2,successCount:1,failedCount:1,results:[{id:101,success:true},{id:102,success:false,error:code,message:"현재 사이트에서 저장 완료되지 않았습니다."}]})).toEqual({successfulIds:[101],variant:"info",description:"거부 제외 처리: 성공 1건, 실패 1건 · 현재 사이트에서 저장 완료되지 않았습니다."});
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
    expect(screen.queryByRole("button", {name:"전체"})).toBeNull();
    expect(screen.queryByRole("button", {name:"새로 추가"})).toBeNull();
  });
});
