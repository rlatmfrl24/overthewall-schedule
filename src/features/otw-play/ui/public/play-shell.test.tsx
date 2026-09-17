// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useCatalog: vi.fn(() => ({ isPending: false, isError: false, data: { pages: [{ data: { items: [] } }] } })),
  useConfig: vi.fn(),
  useUser: vi.fn(),
  useAdminStatus: vi.fn(),
  childMounted: vi.fn(),
  navigate: vi.fn(),
  pathname: "/play/songs",
  providerModes: [] as boolean[],
  playerModes: [] as boolean[],
}));

vi.mock("@tanstack/react-router", () => ({
  Link: React.forwardRef<HTMLAnchorElement, { children: React.ReactNode; to: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>>(
    ({ children, to, ...props }, ref) => <a ref={ref} href={to} {...props}>{children}</a>,
  ),
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ subscribe: () => () => {} }),
  useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => unknown }) => select({ location: { pathname: mocks.pathname } }),
}));
vi.mock("@clerk/clerk-react", () => ({
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useUser: mocks.useUser,
}));
vi.mock("@/features/auth", () => ({
  useAdminStatus: mocks.useAdminStatus,
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
  useOtwPlayCatalog: mocks.useCatalog,
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
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    mocks.pathname = "/play/songs";
    mocks.providerModes.length = 0;
    mocks.playerModes.length = 0;
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: { id: "admin-user" },
    });
    mocks.useAdminStatus.mockReturnValue({
      data: { authenticated: true, isAdmin: true },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
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
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it.each([true, false])("hides mobile proposal entry points for admin=%s", (isAdmin) => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    mocks.useAdminStatus.mockReturnValue({ data: { authenticated: true, isAdmin }, isPending: false, isError: false });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.queryByRole("button", { name: "곡 제안 메뉴" })).toBeNull();
    expect(screen.queryByRole("link", { name: "곡 제안하기" })).toBeNull();
    if (isAdmin) {
      expect(screen.queryByRole("link", { name: "곡 검색" })).toBeNull();
      expect(screen.getByRole("link", { name: "플레이리스트" }).getAttribute("href")).toBe("/play/playlists");
    }
  });

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

    expect(screen.getByText("로그인하고 OTW Play를 만나보세요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.childMounted).not.toHaveBeenCalled();
  });

  it("keeps member contribution routes available while public read is off", () => {
    mocks.useAdminStatus.mockReturnValue({
      data: { authenticated: true, isAdmin: false },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });

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
    expect(screen.getByText("관리자 전용 · 노래 클립 비공개")).toBeTruthy();
    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.childMounted).toHaveBeenCalledOnce();
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.useConfig).toHaveBeenCalledWith({ adminPreview: true });
    expect(mocks.providerModes).toEqual([true]);
    expect(mocks.playerModes).toEqual([true]);
    expect(screen.getByRole("link", { name: "Discover" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "곡 검색" })).toBeNull();
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
    // Focus must scroll the content, without scrolling the header out of the frame.
    expect(screen.getByTestId("otw-play-app-frame").className).toContain("overflow-clip");
    expect(screen.getByTestId("otw-play-content-scroll").className).toContain("overflow-y-auto");
  });

  it("searches paused Hangul composition without submitting the page", () => {
    vi.useFakeTimers();
    try {
      render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
      const input = screen.getByRole("textbox", { name: "곡, 원곡 가수, 참여자 검색" });
      fireEvent.compositionStart(input);
      fireEvent.change(input, { target: { value: "바" } });
      expect(screen.getByRole("status", { name: "노래 검색 중" })).toBeTruthy();
      act(() => vi.advanceTimersByTime(250));
      expect(mocks.useCatalog).toHaveBeenLastCalledWith({ q: "바", limit: 6 }, { enabled: true });
      expect(screen.queryByRole("status", { name: "노래 검색 중" })).toBeNull();
      fireEvent.submit(screen.getByRole("search", { name: "OTW Play 빠른 검색" }));
      expect(mocks.navigate).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: "바움" } });
      act(() => vi.advanceTimersByTime(250));
      expect(mocks.useCatalog).toHaveBeenLastCalledWith({ q: "바움", limit: 6 }, { enabled: true });
      fireEvent.compositionEnd(input);
      fireEvent.submit(screen.getByRole("search", { name: "OTW Play 빠른 검색" }));
      expect(mocks.navigate).toHaveBeenCalledWith({ to: "/play/songs", search: { q: "바움" } });
    } finally { vi.useRealTimers(); }
  });

  it("clears a search without navigation and returns focus to the input", () => {
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    const input = screen.getByRole("textbox", { name: "곡, 원곡 가수, 참여자 검색" });
    fireEvent.change(input, { target: { value: "바움" } });
    fireEvent.click(screen.getByRole("button", { name: "검색어 초기화" }));
    expect((input as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole("button", { name: "검색어 초기화" })).toBeNull();
    expect(screen.queryByRole("button", { name: "전체 검색 결과 보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "곡 검색 실행" })).toBeNull();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("opens compact search in place and dismisses with Escape or an outside press", () => {
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    const trigger = screen.getByRole("button", { name: "곡 검색 열기" });
    const input = screen.getByRole("textbox", { name: "곡, 원곡 가수, 참여자 검색" });
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("names icon navigation and explains it on keyboard focus", async () => {
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    const link = screen.getByRole("link", { name: "플레이리스트" });
    act(() => link.focus());
    expect((await screen.findByRole("tooltip")).textContent).toBe("플레이리스트");
    expect(link.getAttribute("href")).toBe("/play/playlists");
  });

  it("navigates search actions with arrows and returns focus with Escape", () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    const previousScroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scroll;
    try {
      render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
      const input = screen.getByRole("textbox", { name: "곡, 원곡 가수, 참여자 검색" });
      fireEvent.change(input, { target: { value: "바" } });
      act(() => vi.advanceTimersByTime(250));
      act(() => input.focus());
      fireEvent.keyDown(input, { key: "ArrowDown" });
      const all = screen.getByRole("button", { name: "전체 검색 결과 보기" });
      expect(document.activeElement).toBe(all);
      fireEvent.keyDown(all, { key: "ArrowUp" });
      expect(document.activeElement).toBe(input);
      fireEvent.keyDown(input, { key: "ArrowDown" });
      fireEvent.keyDown(all, { key: "Escape" });
      expect(document.activeElement).toBe(input);
      expect(screen.queryByRole("button", { name: "전체 검색 결과 보기" })).toBeNull();
    } finally {
      HTMLElement.prototype.scrollIntoView = previousScroll;
      vi.useRealTimers();
    }
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

  it("requires login even when catalog reads are enabled", () => {
    mocks.useUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
      user: null,
    });
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: false } },
      refetch: vi.fn(),
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("로그인하고 OTW Play를 만나보세요")).toBeTruthy();
    expect(mocks.childMounted).not.toHaveBeenCalled();
    expect(mocks.playerModes).toEqual([]);
  });

  it("uses the same public API/cache experience for signed-in members in 1/0", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: false } },
      refetch: vi.fn(),
    });
    mocks.useAdminStatus.mockReturnValue({ data: { isAdmin: false }, isPending: false, isError: false });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(screen.getByText("catalog child")).toBeTruthy();
    expect(mocks.providerModes).toEqual([false]);
    expect(mocks.playerModes).toEqual([false]);
    expect(screen.queryByText("OTW Play 공개 준비 중입니다")).toBeNull();
  });

  it("hides clip navigation and blocks a direct clip route for members", () => {
    mocks.useAdminStatus.mockReturnValue({ data: { isAdmin: false }, isPending: false, isError: false });
    mocks.useConfig.mockReturnValue({ isPending: false, isError: false, data: { data: { publicReadEnabled: true, navigationVisible: true } } });
    const view = render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.queryByRole("link", { name: "노래 클립" })).toBeNull();
    mocks.pathname = "/play/clips/song";
    view.rerender(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("노래 클립은 아직 비공개입니다")).toBeTruthy();
    expect(screen.queryByText("catalog child")).toBeNull();
    mocks.useUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });
    view.rerender(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByRole("button", { name: "로그인" })).toBeTruthy();
    expect(screen.queryByText("catalog child")).toBeNull();
  });

  it("uses the real public path for administrators after public read opens", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: true, navigationVisible: true } },
      refetch: vi.fn(),
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);

    expect(mocks.useConfig).toHaveBeenCalledTimes(2);
    expect(mocks.useConfig).toHaveBeenCalledWith();
    expect(mocks.providerModes).toEqual([true]);
    expect(mocks.playerModes).toEqual([true]);
  });
});
