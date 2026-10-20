// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import type { ScheduleItem } from "@/features/schedules";
import { WeeklyGrid } from "./weekly-grid";

beforeEach(() => vi.stubGlobal("React", React));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("기존 주간표에서 멤버별 일정 추가와 편집 흐름을 유지한다", () => {
  const member = createMemberFixture();
  const weekDays = Array.from({ length: 7 }, (_, index) => new Date(2026, 9, 19 + index));
  const schedule: ScheduleItem = {
    id: 1, member_uid: member.uid, date: "2026-10-19", start_time: "20:00",
    title: "이번 주 방송", status: "방송", created_at: null,
  };
  const onAddSchedule = vi.fn();
  const onEditSchedule = vi.fn();
  render(<WeeklyGrid members={[member]} weekDays={weekDays} schedules={[schedule]} ddays={[]} onAddSchedule={onAddSchedule} onEditSchedule={onEditSchedule} />);
  fireEvent.click(screen.getByRole("button", { name: /방송 이번 주 방송/ }));
  expect(onEditSchedule).toHaveBeenCalledWith(schedule);
  fireEvent.click(screen.getByRole("button", { name: `${member.name} ${weekDays[1].toLocaleDateString("ko-KR")} 스케쥴 추가` }));
  expect(onAddSchedule).toHaveBeenCalledWith(weekDays[1], member.uid);
});
