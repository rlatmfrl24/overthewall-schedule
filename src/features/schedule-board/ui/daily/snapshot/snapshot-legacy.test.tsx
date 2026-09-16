// @vitest-environment jsdom
import React from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import type { ScheduleItem } from "@/features/schedules";
import { SnapshotLegacy } from "./snapshot-legacy";

afterEach(cleanup);
const members = Array.from({ length: 6 }, (_, index) => createMemberFixture({ uid: index + 1, code: `m${index}`, name: `긴 이름 멤버 ${index + 1}` }));
const schedule = (id: number, status: string, title: string, start_time: string | null): ScheduleItem => ({ id, member_uid: id, date: "2026-09-16", status, title, start_time, created_at: null } as ScheduleItem);

describe("legacy snapshot", () => {
  it("sorts times and retains full notes, secondary times and all status groups", () => {
    const longTitle = "긴 제목과 상세 방송 내용이 여러 줄이어도 생략되지 않습니다 ".repeat(5);
    render(<SnapshotLegacy date="2026-09-16" members={members} updatedAt="2026-09-15T14:51:00Z" schedules={[
      schedule(2, "방송", "동시 방송", "18:00"), schedule(1, "방송", longTitle, "16:30"),
      schedule(3, "게릴라", "밤에 잠깐 방송", "23:00"), schedule(4, "미정", "회의 후 공지", null),
      schedule(5, "휴방", "휴방", null),
    ]} />);
    const timed = within(screen.getByRole("region", { name: "방송 일정" })).getAllByRole("listitem");
    expect(timed[0].textContent).toContain("16:30");
    expect(timed[1].textContent).toContain("18:00");
    expect(screen.getByRole("heading", { name: longTitle.trim() }).textContent).toBe(longTitle.trim());
    expect(within(screen.getByRole("region", { name: "게릴라 예정" })).getByText("23:00")).toBeTruthy();
    expect(screen.getByText("회의 후 공지")).toBeTruthy();
    expect(screen.getByText("오늘은 휴방입니다")).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "일정 없음" })).getByText("긴 이름 멤버 6")).toBeTruthy();
    expect(screen.getByText(/최종 편집/)).toBeTruthy();
  });
  it("preserves both simultaneous broadcasts and lists all members on empty days", () => {
    const { rerender } = render(<SnapshotLegacy date="2026-09-16" members={members} updatedAt={null} schedules={[schedule(1,"방송","첫 방송","18:00"),schedule(2,"방송","동시 방송","18:00")]} />);
    expect(screen.getAllByText("18:00")).toHaveLength(2);
    rerender(<SnapshotLegacy date="2026-09-16" members={members} updatedAt={null} schedules={[]} />);
    expect(screen.queryByRole("region", { name: "방송 일정" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "일정 없음" })).getAllByRole("listitem")).toHaveLength(6);
  });
});
