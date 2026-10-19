// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { createMemberFixture } from "@/test/member-fixtures";
import { WeeklyGridDayCell } from "./weekly-grid-day-cell";
import React from "react";
vi.stubGlobal("React", React);
vi.mock("@/shared/config/site", () => ({ site: { id: "luvdia" } }));
afterEach(cleanup);
it("종료 이후 빈 칸에서 일정 추가를 제공하지 않는다", () => {
  render(<WeeklyGridDayCell day={new Date("2026-11-16T12:00:00+09:00")}
    member={createMemberFixture({ code: "bing_hayu" })} schedules={[]}
    mainColor="#ffffff" subColor="#ffffff" onAddSchedule={vi.fn()} onEditSchedule={vi.fn()} />);
  expect(screen.queryByRole("button")).toBeNull();
});
