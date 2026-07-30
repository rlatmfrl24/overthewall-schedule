// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/clerk-react", async () => {
  const { createElement, Fragment } = await import("react");

  return {
    SignedIn: ({ children }: { children?: ReactNode }) =>
      createElement(Fragment, null, children),
    SignedOut: () => null,
    SignInButton: ({ children }: { children?: ReactNode }) =>
      createElement(Fragment, null, children),
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
});
