// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createMemberFixture } from "@/test/member-fixtures";
import { SnapshotSchedule } from "./snapshot-schedule";

vi.mock("@/shared/config/site", async () => ({ site: { ...(await import("@contracts/site-definition")).getSiteDefinition("luvdia"), publicOrigin: "http://localhost:5174" } }));
vi.mock("../../../queries/use-schedule-board", () => ({ useScheduleBoard: () => ({
  board: { updatedAt: null }, members: [createMemberFixture({ uid: 1, name: "빙하유", unit_name: "러브다이아" })], schedules: [{ id: 1, member_uid: 1, date: "2026-10-14", start_time: "20:00", status: "방송", title: "방송", created_at: null }], hasLoaded: true,
}) }));
vi.mock("./use-snapshot-fonts", () => ({ useSnapshotFonts: () => "system" }));
afterEach(cleanup);

it.each([ ["grid", "poster"], ["timeline", "poster"], ["timeline", "legacy"] ] as const)("brands the %s/%s export from its selected site", (mode, design) => {
  render(createElement(SnapshotSchedule, { date: "2026-10-14", mode, design, theme: "light" }));
  expect(screen.getByRole("img", { name: "LuvDia Schedule" }).getAttribute("src")).toBe("/logo_luvdia.webp");
  expect(screen.getByText("localhost:5174")).toBeTruthy();
  expect(screen.getByText("개인 방송인")).toBeTruthy();
  expect(screen.queryByText("러브다이아")).toBeNull();
});
