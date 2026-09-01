// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkState = vi.hoisted(() => ({
  status: "signed-in" as "error" | "loading" | "signed-in" | "signed-out",
  signIn: vi.fn(),
}));

vi.mock("@clerk/clerk-react", async () => {
  const { cloneElement, createElement, Fragment, isValidElement } = await import(
    "react"
  );

  return {
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
    UserButton: () =>
      createElement("button", {
        "aria-label": "사용자 메뉴",
        type: "button",
      }),
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

vi.mock("@/app/layout/mode-toggle", async () => {
  const { createElement } = await import("react");

  return {
    ModeToggle: () =>
      createElement(
        "button",
        { "aria-label": "테마 선택", type: "button" },
        "테마",
      ),
  };
});

import { PublicAppShell } from "./app-shell";

describe("PublicAppShell", () => {
  beforeEach(() => {
    clerkState.status = "signed-in";
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("keeps collapsed sidebar utilities separated within a tall enough footer", () => {
    const { container } = render(
      React.createElement(
        PublicAppShell,
        null,
        React.createElement("div", null, "content"),
      ),
    );

    const sidebar = container.querySelector("aside");
    const footer = sidebar?.lastElementChild as HTMLElement | null;
    const controls = footer?.firstElementChild as HTMLElement | null;

    expect(sidebar?.className).toContain("w-16");
    expect(footer?.className).toContain("h-[5.5rem]");
    expect(footer?.className).toContain("py-2");
    expect(controls?.className).toContain("flex-col");
    expect(controls?.className).toContain("gap-2");
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

    const loginButtons = screen.getAllByRole("button", { name: "로그인" });

    expect(loginButtons).toHaveLength(2);
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

      const loginButtons = screen.getAllByRole("button", { name: "로그인" });

      expect(loginButtons).toHaveLength(2);
      expect(
        loginButtons.every(
          (button) =>
            button.hasAttribute("disabled") && button.getAttribute("title") === title,
        ),
      ).toBe(true);
    },
  );
});
