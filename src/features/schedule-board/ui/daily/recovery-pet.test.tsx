// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecoveryPet } from "./recovery-pet";

const animations = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/shared/ui/animation-provider", () => ({ useAnimations: () => animations }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T00:00:00+09:00"));
  animations.enabled = true;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("appears at Korean midnight in an already-open daily view and advances the counter on focus", () => {
  vi.setSystemTime(new Date("2026-11-15T23:59:59+09:00"));
  render(<RecoveryPet siteId="luvdia" />);
  expect(screen.queryByRole("complementary", { name: "빙하유 응원 펫" })).toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByText("빙하유는 건강 회복 중!")).toBeTruthy();
  expect(screen.getByText("D+1")).toBeTruthy();
  vi.setSystemTime(new Date("2026-11-17T09:00:00+09:00"));
  fireEvent.focus(window);
  expect(screen.getByText("D+2")).toBeTruthy();
});

it.each([false, true])("does not render or schedule work on OTW even with admin=%s", (isAdmin) => {
  render(<RecoveryPet siteId="otw" isAdmin={isAdmin} />);
  expect(screen.queryByRole("complementary")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("shows an administrator preview before the cutoff only while admin status is confirmed", () => {
  vi.setSystemTime(new Date("2026-10-20T12:00:00+09:00"));
  const view = render(<RecoveryPet siteId="luvdia" isAdmin={false} />);
  expect(screen.queryByRole("complementary", { name: "빙하유 응원 펫" })).toBeNull();
  view.rerender(<RecoveryPet siteId="luvdia" isAdmin />);
  expect(screen.getByRole("img", { name: /빙하유/ })).toBeTruthy();
  expect(screen.getByText("관리자 미리보기")).toBeTruthy();
  expect(screen.queryByText(/^D\+/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "빙하유 펫 접기" }));
  expect(screen.getByRole("button", { name: "빙하유 펫 펼치기" }).textContent).toContain("미리보기");
  view.rerender(<RecoveryPet siteId="luvdia" isAdmin={false} />);
  expect(screen.queryByRole("complementary", { name: "빙하유 응원 펫" })).toBeNull();
});

it("changes an administrator preview into the real D+ counter at Korean midnight", () => {
  vi.setSystemTime(new Date("2026-11-15T23:59:59+09:00"));
  render(<RecoveryPet siteId="luvdia" isAdmin />);
  expect(screen.getByText("관리자 미리보기")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByText("관리자 미리보기")).toBeNull();
  expect(screen.getByText("D+1")).toBeTruthy();
});

it("cycles the six approved scenes without a separate pause or play control", () => {
  const view = render(<RecoveryPet siteId="luvdia" />);
  const image = screen.getByRole("img", { name: /빙하유/ });
  const seen = new Set([image.getAttribute("src")]);
  for (let scene = 1; scene < 6; scene++) {
    act(() => vi.advanceTimersByTime(15_000));
    seen.add(image.getAttribute("src"));
  }
  expect(seen.size).toBe(6);
  expect([...seen].some(src => src?.includes("duo-plant"))).toBe(true);
  expect([...seen].some(src => src?.includes("duo-snack"))).toBe(false);
  expect(screen.queryByRole("button", { name: /펫 애니메이션/ })).toBeNull();
  expect(image.getAttribute("src")).not.toContain("-still.webp");
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("follows the existing site/OS motion preference without removing the message or counter", () => {
  const view = render(<RecoveryPet siteId="luvdia" />);
  animations.enabled = false;
  view.rerender(<RecoveryPet siteId="luvdia" />);
  const source = screen.getByRole("img", { name: /빙하유/ }).getAttribute("src");
  expect(source).toContain("-still.webp");
  act(() => vi.advanceTimersByTime(30_000));
  expect(screen.getByRole("img", { name: /빙하유/ }).getAttribute("src")).toBe(source);
  expect(screen.getByText("빙하유는 건강 회복 중!")).toBeTruthy();
  expect(screen.getByText("D+1")).toBeTruthy();
});

it("can collapse to uncover the schedule and restore the pet", () => {
  render(<RecoveryPet siteId="luvdia" />);
  fireEvent.click(screen.getByRole("button", { name: "빙하유 펫 접기" }));
  expect(screen.queryByRole("img", { name: /빙하유/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "빙하유 펫 펼치기" }));
  expect(screen.getByRole("img", { name: /빙하유/ })).toBeTruthy();
  expect(screen.getByRole("img", { name: /빙하유/ }).getAttribute("src")).not.toContain("-still.webp");
  expect(screen.getByText("D+1")).toBeTruthy();
});
