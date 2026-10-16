// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { SiteCountdown } from "./site-countdown";
vi.stubGlobal("React", React);
afterEach(cleanup);
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
});
