// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Member, ScheduleItem } from "@/lib/types";
import { ScheduleDialog } from "./schedule-dialog";

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
  oshi_mark: null,
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
  } = {},
) => {
  const onSubmit = vi.fn();
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
    const timeInput = screen.getByDisplayValue("00:00") as HTMLInputElement;

    expect(timeUndecided.getAttribute("aria-checked")).toBe("true");
    expect(timeInput.disabled).toBe(true);

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

  it("추가 모드에서도 미정 상태를 표시하지 않는다", () => {
    renderDialog();

    expect(screen.queryByRole("button", { name: "미정" })).toBeNull();
    expect(screen.getByRole("button", { name: "방송" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "휴방" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "게릴라" })).toBeTruthy();
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
