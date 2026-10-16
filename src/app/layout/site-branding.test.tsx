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

it("keeps schedule/content navigation and member Play policy with no unconfigured community link", () => {
  const sections = getPublicNavigationSections({ isAdmin: false, isSignedIn: true, memberPosts: { visible: true, requiresAuth: true } });
  const items = sections.flatMap(s => s.items);
  expect(items.find(i => i.id === "otw-play")).toMatchObject({ label: "LuvDia Play", to: "/play/submit", requiresAuth: true });
  expect(items.find(i => i.id === "feed")).toMatchObject({ to: "/feed", requiresAuth: true });
  expect(items.find(i => i.id === "multiview")).toMatchObject({ label: "멀티뷰" });
  expect(items.some(i => i.id === "fan-cafe")).toBe(false);
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
