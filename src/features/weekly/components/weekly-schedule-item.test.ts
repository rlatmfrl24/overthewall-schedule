// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduleItem } from "@/lib/types";
import { WeeklyScheduleItem } from "./weekly-schedule-item";

const makeSchedule = (partial: Partial<ScheduleItem>): ScheduleItem =>
  ({
    id: 1,
    member_uid: 1,
    date: "2026-06-29",
    start_time: null,
    title: "",
    status: "방송",
    created_at: null,
    ...partial,
  }) as ScheduleItem;

describe("WeeklyScheduleItem", () => {
  afterEach(() => {
    cleanup();
  });

  it("방송 카드는 축약 ON 대신 상태명과 시간을 읽기 좋게 표시한다", () => {
    const onClick = vi.fn();

    render(
      createElement(WeeklyScheduleItem, {
        schedule: makeSchedule({
          status: "방송",
          start_time: "08:00",
          title: "",
        }),
        mainColor: "#ef4444",
        onClick,
      }),
    );

    const card = screen.getByRole("button", {
      name: "방송 방송 예정 08:00",
    });

    expect(screen.queryByText("ON")).toBeNull();
    expect(screen.getByText("방송")).toBeTruthy();
    expect(screen.getByText("08:00")).toBeTruthy();
    expect(screen.getByText("방송 예정")).toBeTruthy();

    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("시간 없는 게릴라 방송은 미정 시간칩과 fallback 제목을 표시한다", () => {
    render(
      createElement(WeeklyScheduleItem, {
        schedule: makeSchedule({
          status: "게릴라",
          title: "게릴라",
        }),
        mainColor: "#84cc16",
        onClick: vi.fn(),
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "게릴라 게릴라 방송 예정 미정",
      }),
    ).toBeTruthy();
    expect(screen.getByText("미정")).toBeTruthy();
    expect(screen.getByText("게릴라 방송 예정")).toBeTruthy();
  });

  it("휴방 카드는 낮은 대비 텍스트 대신 명확한 fallback 제목을 표시한다", () => {
    render(
      createElement(WeeklyScheduleItem, {
        schedule: makeSchedule({
          status: "휴방",
          title: "휴방",
        }),
        mainColor: "#60a5fa",
        onClick: vi.fn(),
      }),
    );

    expect(
      screen.getByRole("button", {
        name: "휴방 오늘은 휴방입니다",
      }),
    ).toBeTruthy();
    expect(screen.getByText("오늘은 휴방입니다")).toBeTruthy();
  });
});
