// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useUserMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "sign-in-button" }, children),
  useUser: useUserMock,
}));

vi.mock("@/features/multiview/multiview-page", () => ({
  MultiviewPage: () =>
    React.createElement("div", { "data-testid": "multiview-page" }, "multiview"),
}));

import { RouteComponent } from "./multiview";

describe("/multiview route", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a loading state while Clerk auth is loading", () => {
    useUserMock.mockReturnValue({ isLoaded: false, isSignedIn: false });

    render(React.createElement(RouteComponent));

    expect(screen.queryByTestId("multiview-page")).toBeNull();
    expect(screen.queryByText("로그인이 필요합니다")).toBeNull();
  });

  it("blocks anonymous users before mounting the multiview page", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: false });

    render(React.createElement(RouteComponent));

    expect(screen.getByText("로그인이 필요합니다")).toBeTruthy();
    expect(screen.getByText("오버더월 멀티뷰는 로그인한 사용자에게만 제공됩니다."))
      .toBeTruthy();
    expect(screen.getByTestId("sign-in-button")).toBeTruthy();
    expect(screen.queryByTestId("multiview-page")).toBeNull();
  });

  it("mounts the multiview page for signed-in users", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true });

    render(React.createElement(RouteComponent));

    expect(screen.getByTestId("multiview-page")).toBeTruthy();
    expect(screen.queryByText("로그인이 필요합니다")).toBeNull();
  });
});
