// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useConfig: vi.fn(),
  useUser: vi.fn(),
  isAdminUser: vi.fn(),
  childMounted: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUser: mocks.useUser,
}));
vi.mock("@/app/admin", () => ({
  isAdminUser: mocks.isAdminUser,
}));
vi.mock("../../queries/use-public-catalog", () => ({
  OtwPlayCatalogRequestProvider: ({
    children,
  }: {
    children: React.ReactNode;
  }) => <>{children}</>,
  useOtwPlayConfig: mocks.useConfig,
}));
vi.mock("../../player/play-player-context", () => ({
  OtwPlayPlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../player/now-playing-panel", () => ({
  OtwPlayQueuePanel: () => null,
  OtwPlayPlaybackBar: () => null,
}));

import { OtwPlayShell } from "./play-shell";

function ChildCatalogRequest() {
  mocks.childMounted();
  return <div>catalog child</div>;
}

describe("OtwPlayShell config gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "admin-user" },
    });
    mocks.isAdminUser.mockReturnValue(true);
  });
  afterEach(cleanup);

  it("does not request config or mount catalog work before auth loads", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("관리자 권한 확인 중")).toBeTruthy();
    expect(mocks.useConfig).not.toHaveBeenCalled();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("requires login without requesting public catalog state", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("로그인이 필요합니다")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(mocks.useConfig).not.toHaveBeenCalled();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("rejects signed-in non-admins without requesting catalog state", () => {
    mocks.isAdminUser.mockReturnValue(false);

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("접근 권한이 없습니다")).toBeTruthy();
    expect(mocks.useConfig).not.toHaveBeenCalled();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("mounts the administrator preview while public read is off", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: false, navigationVisible: false } },
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("관리자 미리보기 · 공개 비활성")).toBeTruthy();
    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledOnce();
    expect(mocks.useConfig).toHaveBeenCalledWith({ adminPreview: true });
    expect(screen.getByRole("link", { name: "발견" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "곡 검색" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "홈" })).toBeNull();
    expect(screen.queryByRole("link", { name: "전체 곡" })).toBeNull();
    expect(screen.queryByRole("link", { name: "오리지널" })).toBeNull();
    expect(screen.queryByRole("link", { name: "커버" })).toBeNull();
    expect(screen.getByRole("search", { name: "OTW Play 빠른 검색" })).toBeTruthy();
    fireEvent.change(
      screen.getByRole("textbox", { name: "곡, 원곡 가수, 참여자 검색" }),
      { target: { value: "  공식 커버  " } },
    );
    fireEvent.submit(screen.getByRole("search", { name: "OTW Play 빠른 검색" }));
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/play/songs",
      search: { q: "공식 커버" },
    });
    expect(screen.getByTestId("otw-play-app-frame").className).toContain("overflow-hidden");
    expect(screen.getByTestId("otw-play-content-scroll").className).toContain("overflow-y-auto");
  });

  it("mounts the nested public experience only after the config gate opens", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: false } },
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledOnce();
  });
});
