import { createMemberFixture } from "@/test/member-fixtures";
// @vitest-environment jsdom
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "../model/schedule";
import { ScheduleDialog } from "./schedule-dialog";
import {ApiError} from "@/shared/api/client";

const fetchSchedulesMock = vi.hoisted(() => vi.fn());
vi.mock("../api/schedules", () => ({ fetchSchedulesByDate: fetchSchedulesMock }));
vi.mock("@/shared/config/site", () => ({ site: { id: "luvdia" } }));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const member: Member = createMemberFixture({
    uid: 1,
    code: "m1",
    name: "테스트 멤버",
    main_color: "#336699",
    sub_color: "#99bbdd",
    oshi_mark: "🌙"
  });

const schedule: ScheduleItem = {
  id: 10,
  member_uid: member.uid,
  date: "2026-06-23",
  start_time: "22:00",
  title: "테스트 방송",
  status: "방송",
  created_at: "2026-06-20T00:00:00.000Z",
};

const renderDialog = (
  options: {
    schedule?: ScheduleItem | null;
    onDelete?: (id: number) => void | Promise<void>;
    onSubmit?: () => Promise<void>;
    startStep?: 1 | 2;
  } = {},
) => {
  const onSubmit = vi.fn(options.onSubmit);
  const onDelete = options.onDelete ?? vi.fn();
  const onOpenChange = vi.fn();

  render(
    React.createElement(ScheduleDialog, {
      open: true,
      onOpenChange,
      onSubmit,
      members: [member],
      initialDate: new Date("2026-06-23T00:00:00+09:00"),
      initialMemberUid: member.uid,
      schedule: options.schedule ?? null,
      onDelete,
    }),
  );

  if (!options.schedule && options.startStep !== 1) {
    fireEvent.click(screen.getByRole("button", { name: "일정 내용 입력" }));
  }
  return { onSubmit, onDelete, onOpenChange };
};

const saveNewSchedule = async () => {
  const review=screen.queryByRole("button",{name:"저장 내용 확인"});
  if(review)fireEvent.click(review);
  fireEvent.click(await screen.findByRole("button",{name:"스케쥴 추가"}));
};

describe("ScheduleDialog", () => {
  it("직접 추가를 세 화면으로 나누고 최종 확인 전에는 조회하거나 저장하지 않는다", async () => {
    const {onSubmit}=renderDialog({startStep:1});
    expect(screen.getByRole("navigation",{name:"스케쥴 추가 단계"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"1. 기본 정보"}).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("textbox",{name:"제목"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"일정 내용 입력"}));
    fireEvent.change(await screen.findByLabelText("제목"),{target:{value:"단계 왕복 초안"}});
    fireEvent.click(screen.getByRole("button",{name:"22:00"}));
    fireEvent.click(screen.getByRole("button",{name:"저장 내용 확인"}));
    const summary=await screen.findByRole("region",{name:"저장할 일정"});
    expect(within(summary).getByText("단계 왕복 초안")).toBeTruthy();
    expect(within(summary).getByText("22:00")).toBeTruthy();
    expect(fetchSchedulesMock).not.toHaveBeenCalled();expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"2. 일정 내용"}));
    expect((await screen.findByRole("textbox",{name:"제목"}) as HTMLTextAreaElement).value).toBe("단계 왕복 초안");
    expect((screen.getByLabelText("방송 시작 시간") as HTMLInputElement).value).toBe("22:00");
    fireEvent.click(screen.getByRole("button",{name:"1. 기본 정보"}));
    expect(await screen.findByRole("combobox",{name:/멤버/})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"일정 내용 입력"}));
    fireEvent.click(screen.getByRole("button",{name:"저장 내용 확인"}));
    await saveNewSchedule();
    await waitFor(()=>expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({title:"단계 왕복 초안",start_time:"22:00",member_uid:member.uid}));
  });
  it("기본 정보에서 Enter를 눌러도 최종 저장을 실행하지 않는다",()=>{
    const {onSubmit}=renderDialog({startStep:1});
    fireEvent.submit(screen.getByRole("combobox",{name:/멤버/}).closest("form")!);
    expect(screen.getByRole("button",{name:"2. 일정 내용"}).getAttribute("aria-current")).toBe("step");
    expect(onSubmit).not.toHaveBeenCalled();expect(fetchSchedulesMock).not.toHaveBeenCalled();
  });
  it("멤버가 없으면 기본 정보 단계에서 Enter 진행과 저장을 차단한다",()=>{
    const onSubmit=vi.fn();
    render(React.createElement(ScheduleDialog,{open:true,onSubmit,members:[member]}));
    const selector=screen.getByRole("combobox",{name:/멤버/});
    fireEvent.submit(selector.closest("form")!);
    expect(selector.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("멤버를 선택해주세요.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"1. 기본 정보"}).getAttribute("aria-current")).toBe("step");
    expect(onSubmit).not.toHaveBeenCalled();expect(fetchSchedulesMock).not.toHaveBeenCalled();
  });
  it("저장 중에는 단계 이동과 닫기를 막고 실패 후에도 확인한 초안을 보존한다",async()=>{
    let rejectSave:(error:Error)=>void=()=>{};
    const view=renderDialog({onSubmit:()=>new Promise((_,reject)=>{rejectSave=reject;})});
    fireEvent.change(screen.getByLabelText("제목"),{target:{value:"저장 대기 중인 초안"}});
    await saveNewSchedule();
    await waitFor(()=>expect(view.onSubmit).toHaveBeenCalledOnce());
    expect(screen.getByRole("button",{name:"1. 기본 정보"}).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button",{name:"2. 일정 내용"}).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"닫기"}));
    expect(view.onOpenChange).not.toHaveBeenCalled();
    rejectSave(new Error("offline"));
    await screen.findByRole("alert");
    expect(within(screen.getByRole("region",{name:"저장할 일정"})).getByText("저장 대기 중인 초안")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"2. 일정 내용"}));
    expect((await screen.findByRole("textbox",{name:"제목"}) as HTMLTextAreaElement).value).toBe("저장 대기 중인 초안");
  });
  it("종료 이후 일반 입력을 막고 관리자에게 공개 예외 안내를 제공한다", () => {
    const props = { open: true, onSubmit: vi.fn(), members: [{ ...member, code: "bing_hayu" }],
      initialMemberUid: member.uid, initialDate: new Date("2026-11-16T12:00:00+09:00") };
    const view = render(React.createElement(ScheduleDialog, props));
    expect(screen.getByText("운영 종료 이후 일정은 관리자만 변경할 수 있습니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "일정 내용 입력" }).hasAttribute("disabled")).toBe(true);
    view.rerender(React.createElement(ScheduleDialog, { ...props, isAdmin: true }));
    expect(screen.getByText("운영 종료 이후 예외 일정으로 공개됩니다.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "일정 내용 입력" }).hasAttribute("disabled")).toBe(false);
  });
  beforeEach(() => { fetchSchedulesMock.mockReset().mockResolvedValue([]); });
  beforeAll(() => {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      value: ResizeObserverMock,
      writable: true,
    });
  });

  afterAll(() => {
    Reflect.deleteProperty(globalThis, "ResizeObserver");
  });

  afterEach(() => {
    cleanup();
  });

  it("신규 스케쥴은 시간 미정으로 시작하고 시간 없이 저장한다", async () => {
    const { onSubmit } = renderDialog();

    const timeUndecided = await screen.findByRole("checkbox", {
      name: "시간 미정",
    });
    expect(screen.queryByDisplayValue("00:00")).toBeNull();

    expect(timeUndecided.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/아직 정해지지 않았어요/)).toBeTruthy();

    await saveNewSchedule();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        member_uid: member.uid,
        start_time: null,
        status: "방송",
      }),
    );
  });

  it("이미지에서 저장한 여러 줄 제목을 정상 재편집과 제출에서도 보존한다", async () => {
    const title = "문 스위퍼즈\nw. 합방 멤버";
    const { onSubmit } = renderDialog({ schedule: { ...schedule, title } });
    const input = await screen.findByLabelText("제목") as HTMLTextAreaElement;
    expect(input.value).toBe(title);
    fireEvent.change(input, { target: { value: `${title}\n추가 설명` } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: schedule.id, title: `${title}\n추가 설명` }));
  });

  it("빠른 시간 선택지를 낮/저녁 시간대에 맞게 표시한다", () => {
    renderDialog();

    const dayGroup = screen.getByText("낮 시간대").closest("div");
    const eveningGroup = screen.getByText("저녁 시간대").closest("div");

    expect(dayGroup?.textContent).toContain("08:00");
    expect(dayGroup?.textContent).toContain("12:00");
    expect(dayGroup?.textContent).not.toContain("15:00");
    expect(eveningGroup?.textContent).toContain("15:00");
    expect(eveningGroup?.textContent).toContain("22:00");
  });

  it("빠른 시간 선택 시 시간 미정을 해제하고 선택한 시간으로 저장한다", async () => {
    const { onSubmit } = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "22:00" }));

    const timeUndecided = screen.getByRole("checkbox", { name: "시간 미정" });
    const timeInput = screen.getByDisplayValue("22:00") as HTMLInputElement;

    expect(timeUndecided.getAttribute("aria-checked")).toBe("false");
    expect(timeInput.disabled).toBe(false);

    await saveNewSchedule();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: "22:00",
        status: "방송",
      }),
    );
  });

  it.each(["휴방", "게릴라"])("방송 초안을 %s 왕복 후에도 복원한다", async (status) => {
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "보존할 방송" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "시간 미정" }));
    fireEvent.change(screen.getByLabelText("방송 시작 시간"), { target: { value: "19:30" } });
    fireEvent.click(screen.getByRole("button", { name: status }));
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "별도 상태 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "방송" }));
    expect(screen.getByDisplayValue("보존할 방송")).toBeTruthy();
    expect(screen.getByDisplayValue("19:30")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "시간 미정" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: status }));
    expect(screen.getByDisplayValue("별도 상태 초안")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "방송" }));
    await saveNewSchedule();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "보존할 방송", start_time: "19:30" })));
  });

  it("멤버 선택값에 오시마크를 표시한다", () => {
    renderDialog({startStep:1});
    expect(screen.getByRole("combobox", { name: /멤버/ }).textContent).toContain("🌙");
  });

  it("휴방의 삭제 대상이 없으면 삭제 대신 저장으로 확인한다", async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "휴방" }));
    await saveNewSchedule();
    expect(await screen.findByText(/기존 일정 변경 없음/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "삭제 후 저장" })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "휴방 저장" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it("방송 저장도 다른 멤버·방송·수정 대상을 제외한 삭제 목록을 확인한다", async () => {
    fetchSchedulesMock.mockResolvedValue([
      schedule,
      { ...schedule, id: 11, title: "삭제될 휴방", status: "휴방", start_time: null },
      { ...schedule, id: 12, title: "유지할 방송" },
      { ...schedule, id: 13, member_uid: 2, title: "다른 멤버", status: "게릴라" },
    ]);
    const { onSubmit } = renderDialog({ schedule });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(await screen.findByRole("heading", { name: "기존 일정 1건 삭제 확인" })).toBeTruthy();
    expect(screen.getByText(/삭제될 휴방/)).toBeTruthy();
    expect(screen.queryByText(/유지할 방송/)).toBeNull();
    expect(screen.queryByText(/다른 멤버/)).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "삭제 후 저장" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
  });

  it("영향 조회 실패에서는 저장을 막고 입력을 유지한 채 다시 조회한다", async () => {
    fetchSchedulesMock.mockRejectedValueOnce(new Error("offline"));
    const { onSubmit } = renderDialog();
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "유지할 입력" } });
    await saveNewSchedule();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("영향을 확인하지 못했습니다"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(within(screen.getByRole("region",{name:"저장할 일정"})).getByText("유지할 입력")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 조회하고 저장" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(fetchSchedulesMock).toHaveBeenCalledTimes(2);
  });

  it("저장 실패 시 폼에서 재시도를 안내하고 초안을 유지한다", async () => {
    const { onSubmit } = renderDialog({ onSubmit: async () => { throw new Error("offline"); } });
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "재시도할 입력" } });
    await saveNewSchedule();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("저장하지 못했습니다"));
    expect(within(screen.getByRole("region",{name:"저장할 일정"})).getByText("재시도할 입력")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it.each([
    ["CONTENT_MOVED","이 자료는 LuvDia Schedule로 이동했습니다. LuvDia에서 로그인한 뒤 편집해 주세요."],
    ["CONTENT_CONFLICT","동시 변경이 발생했습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요."],
    ["CONTENT_CONFLICT","다른 저장으로 일정이 변경되었습니다. 변경 내용을 확인해 주세요."],
  ])("%s 응답을 저장 성공으로 표시하지 않고 실제 후속 조치를 안내한다",async(code,message)=>{
    const {onSubmit}=renderDialog({onSubmit:async()=>{throw new ApiError(message,409,{code});}});
    fireEvent.change(screen.getByLabelText(/제목/),{target:{value:"보존할 이전 사이트 초안"}});
    await saveNewSchedule();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent",expect.stringContaining(message));
    expect(within(screen.getByRole("region",{name:"저장할 일정"})).getByText("보존할 이전 사이트 초안")).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("추가 모드에서도 미정 상태를 표시하지 않는다", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: "미정" })).toBeNull();
    expect(screen.getByRole("button", { name: "방송" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "휴방" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "게릴라" })).toBeTruthy();
  });

  it("닫기 취소 시 편집 내용을 보존하고 원래 값으로 복구하면 확인 없이 닫는다", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();
    render(React.createElement(UnsavedChangesContext.Provider, { value: { register: vi.fn(), confirm } },
      React.createElement(ScheduleDialog, { open: true, schedule, members: [member], onSubmit: vi.fn(), onOpenChange })));
    const input = screen.getByDisplayValue("테스트 방송");
    fireEvent.change(input, { target: { value: "보존할 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect((input as HTMLInputElement).value).toBe("보존할 제목");
    fireEvent.change(input, { target: { value: "테스트 방송" } });
    fireEvent.click(screen.getByRole("button", { name: "취소" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(confirm).toHaveBeenCalledOnce();
  });

  it("수정 모드에서는 미정 상태를 숨기고 삭제 액션을 명확히 표시한다", () => {
    renderDialog({ schedule });

    expect(screen.queryByRole("button", { name: "미정" })).toBeNull();
    expect(screen.getByRole("button", { name: "방송" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "휴방" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "게릴라" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "스케쥴 삭제" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "수정 저장" })).toBeTruthy();
  });
});
