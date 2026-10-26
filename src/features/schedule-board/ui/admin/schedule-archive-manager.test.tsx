// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScheduleArchiveManager } from "./schedule-archive-manager";

const { site, board } = vi.hoisted(() => ({
  site: { id: "otw" },
  board: {
    members: [
      { uid: 1, code: "kurenai_natsuki", name: "쿠레나이 나츠키", content_access: "normal" },
      { uid: 3, code: "bing_hayu", name: "빙하유", content_access: "normal" },
      { uid: 4, code: "yang_mei", name: "양메이", content_access: "normal" },
      { uid: 5, code: "u_lili", name: "유리리", content_access: "normal" },
      { uid: 9, code: "retired", name: "다른 보관 멤버", content_access: "admin_archive" },
    ],
    schedules: [{ id: 12, member_uid: 4, title: "기존 보관 일정", start_time: "12:00", status: "방송", content_access: "admin_archive" }],
    loading: false, error: null,
  },
}));
vi.mock("@/shared/config/site", () => ({ site }));
vi.mock("../../queries/use-schedule-board", () => ({ useScheduleBoard: () => board }));
vi.mock("@/features/members", () => ({
  MemberProfilePage: ({ code }: { code: string }) => createElement("div", { "data-testid": "profile" }, code),
}));
afterEach(() => { cleanup(); vi.useRealTimers(); site.id = "otw"; });

it("removes transferred OTW profile controls while retaining historical owners and other archived profiles", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T05:00:00Z"));
  render(createElement(ScheduleArchiveManager));
  for (const name of ["빙하유", "양메이", "유리리"]) {
    expect(screen.queryByRole("button", { name: `${name} 프로필` })).toBeNull();
  }
  expect(screen.getByText(/양메이 · 12:00/)).toBeTruthy();
  expect(screen.getByText("기존 보관 일정")).toBeTruthy();
  expect(screen.getByRole("button", { name: "다른 보관 멤버 프로필 · 관리자 보관" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "쿠레나이 나츠키 프로필" }));
  expect(screen.getByTestId("profile").textContent).toBe("kurenai_natsuki");
});

it("retains all three LuvDia profile controls and opens the selected profile", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T05:00:00Z")); site.id = "luvdia";
  render(createElement(ScheduleArchiveManager));
  for (const name of ["빙하유", "양메이", "유리리"]) {
    expect(screen.getByRole("button", { name: `${name} 프로필` })).toBeTruthy();
  }
  fireEvent.click(screen.getByRole("button", { name: "유리리 프로필" }));
  expect(screen.getByTestId("profile").textContent).toBe("u_lili");
});
