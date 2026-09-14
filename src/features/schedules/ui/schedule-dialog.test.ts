// @vitest-environment jsdom
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "../model/schedule";
import { ScheduleDialog } from "./schedule-dialog";

const fetchSchedulesMock = vi.hoisted(() => vi.fn());
vi.mock("../api/schedules", () => ({ fetchSchedulesByDate: fetchSchedulesMock }));

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const member: Member = {
  uid: 1,
  code: "m1",
  name: "테스트 멤버",
  main_color: "#336699",
  sub_color: "#99bbdd",
  oshi_mark: "🌙",
  url_twitter: null,
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
};

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
  } = {},
) => {
  const onSubmit = vi.fn(options.onSubmit);
  const onDelete = options.onDelete ?? vi.fn();

  render(
    React.createElement(ScheduleDialog, {
      open: true,
      onOpenChange: vi.fn(),
      onSubmit,
      members: [member],
      initialDate: new Date("2026-06-23T00:00:00+09:00"),
      initialMemberUid: member.uid,
      schedule: options.schedule ?? null,
      onDelete,
    }),
  );

  return { onSubmit, onDelete };
};

describe("ScheduleDialog", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        member_uid: member.uid,
        start_time: null,
        status: "방송",
      }),
    );
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

    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));

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
    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "보존할 방송", start_time: "19:30" })));
  });

  it("멤버 선택값에 오시마크를 표시한다", () => {
    renderDialog();
    expect(screen.getByRole("combobox", { name: /멤버/ }).textContent).toContain("🌙");
  });

  it("휴방의 삭제 대상이 없으면 삭제 대신 저장으로 확인한다", async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "휴방" }));
    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));
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
    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("영향을 확인하지 못했습니다"));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("유지할 입력")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 조회하고 저장" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(fetchSchedulesMock).toHaveBeenCalledTimes(2);
  });

  it("저장 실패 시 폼에서 재시도를 안내하고 초안을 유지한다", async () => {
    const { onSubmit } = renderDialog({ onSubmit: async () => { throw new Error("offline"); } });
    fireEvent.change(screen.getByLabelText(/제목/), { target: { value: "재시도할 입력" } });
    fireEvent.click(screen.getByRole("button", { name: "스케쥴 추가" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("저장하지 못했습니다"));
    expect(screen.getByDisplayValue("재시도할 입력")).toBeTruthy();
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
