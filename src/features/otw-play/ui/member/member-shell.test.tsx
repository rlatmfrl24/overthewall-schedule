// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useUserMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUser: useUserMock,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

import { OtwPlayMemberHome, OtwPlayMemberShell } from "./member-shell";

describe("OtwPlayMemberShell", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows a login call to action without mounting member requests", () => {
    const childMounted = vi.fn();
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const Child = () => {
      childMounted();
      return <div>member content</div>;
    };

    render(<OtwPlayMemberShell><Child /></OtwPlayMemberShell>);

    expect(screen.getByText("로그인 후 곡을 제안할 수 있어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(childMounted).not.toHaveBeenCalled();
  });

  it("mounts only the member shell for a signed-in member", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    render(<OtwPlayMemberShell><div>member content</div></OtwPlayMemberShell>);

    expect(screen.getByText("member content")).toBeTruthy();
    expect(screen.getByRole("link", { name: "OTW Play" }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("button", { name: "곡 제안 메뉴" })).toBeTruthy();
    expect(screen.queryByRole("search")).toBeNull();
    expect(screen.queryByText("발견")).toBeNull();
    expect(screen.queryByText("곡 검색")).toBeNull();
  });

  it("provides a member-safe OTW Play landing without mounting the catalog", () => {
    useUserMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    render(
      <OtwPlayMemberShell>
        <OtwPlayMemberHome />
      </OtwPlayMemberShell>,
    );

    expect(screen.getByRole("link", { name: /새 곡 제안/ }).getAttribute("href"))
      .toBe("/play/submit");
    expect(screen.getByRole("link", { name: /내 제안/ }).getAttribute("href"))
      .toBe("/play/submissions");
    expect(screen.queryByRole("search")).toBeNull();
  });
});
