// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { getPublicNavigationSections } from "./app-navigation";
import { Footer } from "./footer";
import { RightsPage } from "@/features/rights";

vi.mock("@/shared/config/site", async () => ({ site: { ...(await import("@contracts/site-definition")).getSiteDefinition("luvdia"), publicOrigin: "http://localhost:5174" } }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => createElement("a", { href: to, ...props }, children) }));
afterEach(cleanup);

it("keeps public Play navigation and points the community link to LuvDia's official cafe", () => {
  const sections = getPublicNavigationSections({ isAdmin: false, memberPosts: { visible: true, requiresAuth: true } });
  const items = sections.flatMap(s => s.items);
  expect(items.find(i => i.id === "otw-play")).toMatchObject({ label: "LuvDia Play", to: "/play" });
  expect(items.find(i => i.id === "otw-play")?.requiresAuth).toBeUndefined();
  expect(items.find(i => i.id === "feed")).toMatchObject({ to: "/feed", requiresAuth: true });
  expect(items.find(i => i.id === "multiview")).toMatchObject({ label: "멀티뷰" });
  expect(items.find(i => i.id === "fan-cafe")).toMatchObject({ label: "공식 팬카페", externalHref: "https://cafe.naver.com/s2dia" });
  expect(items.find(i => i.id === "related-schedule")).toMatchObject({ label: "오버더월 스케쥴", group: "external", externalHref: "https://otw-schedule.info" });
  const hidden = getPublicNavigationSections({ isAdmin: false, memberPosts: { visible: false, requiresAuth: false }, showRelatedScheduleLink: false });
  expect(hidden.flatMap(s => s.items).some(i => i.id === "related-schedule")).toBe(false);
  expect(hidden.flatMap(s => s.items).some(i => i.id === "fan-cafe")).toBe(true);
});

it("shows site ownership, nonofficial notice and configured rights contact", () => {
  render(createElement(Footer));
  expect(screen.getByRole("link", { name: "저작권 및 권리 안내" }).textContent).toContain("LuvDia Schedule");
  expect(screen.getByRole("link", { name: "문의 메일" }).getAttribute("href")).toBe("mailto:397love@gmail.com");
  cleanup();
  render(createElement(RightsPage));
  expect(screen.getByText(/LuvDia Schedule은 팬이 운영하는 비공식/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "397love@gmail.com" }).getAttribute("href")).toBe("mailto:397love@gmail.com");
});
