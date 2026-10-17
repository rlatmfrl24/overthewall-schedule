// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { SiteCountdown } from "./site-countdown";
import { gsap } from "gsap";
vi.stubGlobal("React", React);
beforeEach(() => vi.stubGlobal("matchMedia", () => ({ matches: false, addListener() {}, removeListener() {} })));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
vi.mock("@clerk/clerk-react", () => ({ SignInButton: ({ children }: { children: React.ReactNode }) => children, SignedOut: ({ children }: { children: React.ReactNode }) => children, SignedIn: () => null }));

it("shows the confirmed launch time and remaining time without an announcement every second", () => {
  render(<SiteCountdown phase="countdown" remainingMs={90_061_000} />);
  expect(screen.getByText("2026년 10월 19일 오전 0시 공개")).toBeTruthy();
  expect(screen.getByLabelText("공개까지 1일 1시간 1분 1초")).toBeTruthy();
  expect(screen.getByRole("button", { name: "관리자 로그인" })).toBeTruthy();
});

it("shows a preparation message when an operational hold overrides midnight", () => {
  render(<SiteCountdown phase="held" remainingMs={0} />);
  expect(screen.getByText("공개 준비를 마무리하고 있습니다.")).toBeTruthy();
  expect(screen.queryByRole("timer")).toBeNull();
  expect(screen.queryByRole("link", { name: /공개 일정 저장/ })).toBeNull();
});

it("keeps zero time readable with the member silhouette and no calendar action", () => {
  render(<SiteCountdown phase="countdown" remainingMs={-1000} />);
  expect(screen.getByRole("timer").getAttribute("aria-live")).toBe("off");
  expect(screen.getByLabelText("공개까지 0일 0시간 0분 0초")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /공개 일정 저장/ })).toBeNull();
  expect(screen.getByRole("img", { name: "빙하유, 유리리, 양메이의 합동 실루엣" }).getAttribute("src")).toBe("/launch/luvdia-members-silhouette.webp");
});

it("animates only a changed value and respects reduced motion", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addListener() {}, removeListener() {} }));
  const animation = vi.spyOn(gsap, "fromTo");
  const view = render(<SiteCountdown phase="countdown" remainingMs={61_000} />);
  animation.mockClear();
  view.rerender(<SiteCountdown phase="countdown" remainingMs={60_000} />);
  expect(animation).toHaveBeenCalledOnce();
  expect((animation.mock.calls[0][0] as HTMLElement).textContent).toBe("00");
  view.unmount();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addListener() {}, removeListener() {} }));
  animation.mockClear();
  render(<SiteCountdown phase="countdown" remainingMs={59_000} />);
  expect(animation).not.toHaveBeenCalled();
});
