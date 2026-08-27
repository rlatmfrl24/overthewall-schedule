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
  providerModes: [] as boolean[],
  playerModes: [] as boolean[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: React.forwardRef<HTMLAnchorElement, { children: React.ReactNode; to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>>(
    ({ children, to, ...props }, ref) => <a ref={ref} href={to} {...props}>{children}</a>,
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
    adminPreview = false,
  }: {
    children: React.ReactNode;
    adminPreview?: boolean;
  }) => {
    mocks.providerModes.push(adminPreview);
    return <>{children}</>;
  },
  useOtwPlayConfig: mocks.useConfig,
}));
vi.mock("../../player/play-player-context", () => ({
  OtwPlayPlayerProvider: ({
    children,
    adminPreview = false,
  }: {
    children: React.ReactNode;
    adminPreview?: boolean;
  }) => {
    mocks.playerModes.push(adminPreview);
    return <>{children}</>;
  },
}));
vi.mock("../player/now-playing-panel", () => ({
  OtwPlayPlayerQueuePanel: () => null,
}));

import { OtwPlayShell } from "./play-shell";

function ChildCatalogRequest() {
  mocks.childMounted();
  return <div>catalog child</div>;
}

describe("OtwPlayShell config gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerModes.length = 0;
    mocks.playerModes.length = 0;
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "admin-user" },
    });
    mocks.isAdminUser.mockReturnValue(true);
    mocks.useConfig.mockImplementation((options?: { adminPreview?: boolean }) => ({
      isPending: false,
      isError: false,
      data: {
        data: options?.adminPreview
          ? { publicReadEnabled: false, navigationVisible: false }
          : { publicReadEnabled: false, navigationVisible: false },
      },
      refetch: vi.fn(),
    }));
  });
  afterEach(cleanup);

  it("reads anonymous config before waiting for administrator preview auth", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: false,
      isSignedIn: false,
      user: null,
    });

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("관리자 미리보기 권한 확인 중")).toBeTruthy();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("keeps 0/0 anonymous access closed after reading public config", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("OTW Play 공개 준비 중입니다")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("keeps member contribution routes available while public read is off", () => {
    mocks.isAdminUser.mockReturnValue(false);

    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("OTW Play 공개 준비 중입니다")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "곡 제안하기" }).getAttribute("href"),
    ).toBe("/play/submit");
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("mounts the administrator preview while public read is off", () => {
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("관리자 미리보기 · 공개 비활성")).toBeTruthy();
    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledOnce();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.useConfig).toHaveBeenCalledWith({ adminPreview: true });
    expect(mocks.providerModes).toEqual([true]);
    expect(mocks.playerModes).toEqual([true]);
    expect(screen.getByRole("link", { name: "발견" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "곡 검색" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "곡 제안 메뉴" })).toBeTruthy();
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

  it("opens the integrated contribution menu with keyboard navigation", async () => {
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    const trigger = screen.getByRole("button", { name: "곡 제안 메뉴" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const createSubmissionItem = await screen.findByRole("menuitem", {
      name: "새 곡 제안",
    });
    expect(
      createSubmissionItem.closest('[data-slot="dropdown-menu-content"]')?.className,
    ).toContain("z-[80]");
    expect(screen.getByRole("menuitem", { name: "내 제안" })).toBeTruthy();
  });

  it("mounts the anonymous public experience for 1/0 without preview auth", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
    mocks.isAdminUser.mockReturnValue(false);
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: false } },
      refetch: vi.fn(),
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledOnce();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.providerModes).toEqual([false]);
    expect(mocks.playerModes).toEqual([false]);
    expect(screen.queryByText("관리자 미리보기 · 공개 비활성")).toBeNull();
  });

  it("uses the same public API/cache experience for signed-in members in 1/0", () => {
    mocks.isAdminUser.mockReturnValue(false);
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: false } },
      refetch: vi.fn(),
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.providerModes).toEqual([false]);
    expect(mocks.playerModes).toEqual([false]);
    expect(screen.queryByText("OTW Play 공개 준비 중입니다")).toBeNull();
  });

  it("uses the real public path for administrators after public read opens", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: true } },
      refetch: vi.fn(),
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(mocks.useConfig).toHaveBeenCalledTimes(1);
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.providerModes).toEqual([false]);
    expect(mocks.playerModes).toEqual([false]);
  });
});
