// @vitest-environment jsdom

import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteCopyrightNotice } from "@/shared/lib/site-rights";
import { Footer } from "./footer";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children?: ReactNode;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

describe("Footer", () => {
  it("keeps the rights notice reachable from the public footer", () => {
    render(<Footer />);

    const rightsLink = screen.getByRole("link", {
      name: "저작권 및 권리 안내",
    });
    expect(rightsLink.getAttribute("href")).toBe("/rights");
    expect(rightsLink.textContent).toBe(getSiteCopyrightNotice());
    expect(screen.queryByText("권리/카피라이트")).toBeNull();
  });
});
