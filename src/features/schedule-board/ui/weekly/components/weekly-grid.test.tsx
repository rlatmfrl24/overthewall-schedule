// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import type { ScheduleItem } from "@/features/schedules";
import type { DDayItem } from "@/features/ddays";
import { WeeklyGrid } from "./weekly-grid";

beforeEach(() => vi.stubGlobal("React", React));

const member = createMemberFixture({ main_color: "#f66479" });
const weekDays = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 19 + index));
const schedule: ScheduleItem = {
  id: 1, member_uid: 1, date: "2026-10-19", start_time: "20:00",
  title: "멤버와 함께하는 이번 주 긴 방송 제목", status: "방송", created_at: null,
};
const ddays: DDayItem[] = [
  { id: 1, title: "긴 이름의 데뷔 기념일", date: "2024-10-19", type: "debut", description: null, color: "#fef08a", created_at: null },
  { id: 2, title: "두 번째 기념일의 전체 제목", date: "2026-10-19", type: "event", description: null, color: null, created_at: null },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("WeeklyGrid", () => {
  it("멤버가 한 명이어도 날짜·멤버 표 관계와 기존 추가·편집 흐름을 유지한다", () => {
    const onAddSchedule = vi.fn();
    const onEditSchedule = vi.fn();
    render(<WeeklyGrid members={[member]} weekDays={weekDays} schedules={[schedule]} ddays={[]} onAddSchedule={onAddSchedule} onEditSchedule={onEditSchedule} />);

    const table = screen.getByRole("table", { name: "멤버별 주간 일정" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(8);
    expect(within(table).getAllByRole("row")).toHaveLength(2);
    expect(within(table).getByRole("rowheader", { name: "멤버" })).toBeTruthy();
    expect(within(table).getAllByRole("cell")).toHaveLength(7);
    expect(screen.getByRole("region", { name: "주간 일정표 스크롤" }).tabIndex).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /방송 멤버와 함께하는/ }));
    expect(onEditSchedule).toHaveBeenCalledWith(schedule);
    fireEvent.click(screen.getByRole("button", { name: `멤버 ${weekDays[1].toLocaleDateString("ko-KR")} 스케쥴 추가` }));
    expect(onAddSchedule).toHaveBeenCalledWith(weekDays[1], member.uid);
  });

  it("기념일을 펼치면 모든 제목과 주년을 읽고 Escape로 닫은 뒤 버튼으로 초점을 돌린다", async () => {
    render(<WeeklyGrid members={[member]} weekDays={weekDays} schedules={[]} ddays={ddays} onAddSchedule={vi.fn()} onEditSchedule={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "10월 19일 기념일 2개 보기" });
    fireEvent.click(trigger);
    const detail = screen.getByRole("dialog", { name: "10월 19일 기념일" });
    expect(within(detail).getByText("긴 이름의 데뷔 기념일 · 2주년")).toBeTruthy();
    expect(within(detail).getByText("두 번째 기념일의 전체 제목")).toBeTruthy();
    fireEvent.keyDown(detail, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("단일 기념일의 전체 제목이 버튼의 접근 가능한 이름에도 포함된다", () => {
    render(<WeeklyGrid members={[member]} weekDays={weekDays} schedules={[]} ddays={[ddays[0]]} onAddSchedule={vi.fn()} onEditSchedule={vi.fn()} />);
    expect(screen.getByRole("button", { name: "10월 19일 긴 이름의 데뷔 기념일 보기" })).toBeTruthy();
  });

  it("프로필 사진이 없으면 기본 표시와 이름을 유지하고 새 사진 경로는 다시 시도한다", () => {
    const props = { members: [member], weekDays, schedules: [], ddays: [], onAddSchedule: vi.fn(), onEditSchedule: vi.fn() };
    const view = render(<WeeklyGrid {...props} />);
    const image = view.container.querySelector("img");
    expect(image).not.toBeNull();
    fireEvent.error(image!);
    expect(view.container.querySelector("img")?.getAttribute("aria-hidden")).toBe("true");
    expect(view.container.querySelector("svg.lucide-user")).not.toBeNull();
    expect(screen.getByRole("rowheader", { name: "멤버" })).toBeTruthy();
    view.rerender(<WeeklyGrid {...props} members={[{ ...member, code: "new-photo" }]} />);
    expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/profile/new-photo.webp");
    expect(view.container.querySelector("svg.lucide-user")).toBeNull();
    fireEvent.load(view.container.querySelector("img")!);
    expect(view.container.querySelector("img")?.getAttribute("aria-hidden")).toBeNull();
  });
});
