// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkState = vi.hoisted(() => ({
  status: "signed-in" as "error" | "loading" | "signed-in" | "signed-out",
  signIn: vi.fn(),
  openUserProfile: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@clerk/clerk-react", async () => {
  const { cloneElement, createElement, Fragment, isValidElement } = await import(
    "react"
  );

  return {
    useUser: () => ({ user: clerkState.status === "signed-in" ? { imageUrl: "/avatar.png", username: "테스트닉네임" } : null }),
    useClerk: () => ({ openUserProfile: clerkState.openUserProfile, signOut: clerkState.signOut }),
    SignedIn: ({ children }: { children?: ReactNode }) =>
      clerkState.status === "signed-in"
        ? createElement(Fragment, null, children)
        : null,
    SignedOut: ({ children }: { children?: ReactNode }) =>
      clerkState.status === "signed-out"
        ? createElement(Fragment, null, children)
        : null,
    ClerkLoading: ({ children }: { children?: ReactNode }) =>
      clerkState.status === "loading"
        ? createElement(Fragment, null, children)
        : null,
    ClerkFailed: ({ children }: { children?: ReactNode }) =>
      clerkState.status === "error"
        ? createElement(Fragment, null, children)
        : null,
    SignInButton: ({ children }: { children?: ReactNode }) =>
      isValidElement<{ onClick?: () => void }>(children)
        ? cloneElement(children, { onClick: clerkState.signIn })
        : createElement(Fragment, null, children),
  };
});

vi.mock("@tanstack/react-router", async () => {
  const { createElement } = await import("react");

  return {
    Link: ({
      children,
      to: _to,
      ...props
    }: {
      children?: ReactNode;
      to?: string;
      className?: string;
      "aria-label"?: string;
    }) => {
      void _to;
      return createElement("a", props, children);
    },
    useLocation: () => ({ pathname: "/multiview" }),
  };
});

vi.mock("./app-navigation", () => ({
  getPublicSidebarMode: () => "compact",
  isNavItemActive: () => false,
  usePublicNavigationSections: () => [],
}));

import { AnimationProvider } from "@/shared/ui/animation-provider";
import { PublicAppShell } from "./app-shell";

describe("PublicAppShell", () => {
  beforeEach(() => {
    clerkState.status = "signed-in";
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("persists the profile animation switch across remounts", () => {
    const app = () => React.createElement(AnimationProvider, null, React.createElement(PublicAppShell, null, "content"));
    const first = render(app());
    fireEvent.click(screen.getAllByRole("button", { name: /사용자 메뉴$/ })[0]);
    const toggle = screen.getByRole("switch", { name: "애니메이션 활성화" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(document.documentElement.dataset.animations).toBe("disabled");
    expect(localStorage.getItem("otw-animations-enabled")).toBe("false");
    first.unmount();
    render(app());
    fireEvent.click(screen.getAllByRole("button", { name: /사용자 메뉴$/ })[0]);
    expect(screen.getByRole("switch", { name: "애니메이션 활성화" }).getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("switch", { name: "애니메이션 활성화" }));
    expect(document.documentElement.dataset.animations).toBe("enabled");
    expect(localStorage.getItem("otw-animations-enabled")).toBe("true");
  });

  it("groups account and theme controls behind one footer button", () => {
    const { container } = render(
      React.createElement(PublicAppShell, null, "content"),
    );
    const footer = container.querySelector("aside")?.lastElementChild;
    expect(footer?.className).toContain("h-14");
    expect(footer?.querySelector("button")?.getAttribute("aria-label")).toBe("테스트닉네임 사용자 메뉴");
    expect(footer?.querySelectorAll("button")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "테마 선택" })).toBeNull();

    fireEvent.click(screen.getAllByRole("button", { name: /사용자 메뉴$/ })[0]);
    expect(screen.getByRole("button", { name: "계정 관리" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "계정 관리" }));
    expect(clerkState.openUserProfile).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(clerkState.signOut).toHaveBeenCalledOnce();
    expect(screen.getByRole("group", { name: "테마 선택" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("group", { name: "테마 선택" })).toBeNull();
  });

  it("renders the login action when the viewer is signed out", () => {
    clerkState.status = "signed-out";

    render(
      React.createElement(
        PublicAppShell,
        null,
        React.createElement("div", null, "content"),
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /사용자 메뉴$/ })[0]);
    const loginButtons = screen.getAllByRole("button", { name: "로그인" });

    expect(loginButtons).toHaveLength(1);
    expect(loginButtons.every((button) => !button.hasAttribute("disabled"))).toBe(
      true,
    );
    loginButtons[0].click();
    expect(clerkState.signIn).toHaveBeenCalledOnce();
  });

  it.each([
    ["loading", "로그인 서비스를 불러오는 중입니다."],
    ["error", "로그인 서비스를 불러오지 못했습니다."],
  ] as const)(
    "keeps a visible login control while Clerk is %s",
    (status, title) => {
      clerkState.status = status;

      render(
        React.createElement(
          PublicAppShell,
          null,
          React.createElement("div", null, "content"),
        ),
      );

      fireEvent.click(screen.getAllByRole("button", { name: /사용자 메뉴$/ })[0]);
      const loginButtons = screen.getAllByRole("button", { name: "로그인" });

      expect(loginButtons).toHaveLength(1);
      expect(
        loginButtons.every(
          (button) =>
            button.hasAttribute("disabled") && button.getAttribute("title") === title,
        ),
      ).toBe(true);
    },
  );
});
