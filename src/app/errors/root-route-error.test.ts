// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { RootRouteError } from "./root-route-error";

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-router")>(
    "@tanstack/react-router",
  );
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) =>
      React.createElement("a", { href: "/" }, children),
  };
});

describe("RootRouteError", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("hides exception details from the nosnippet UI and retries", () => {
    const reset = vi.fn();
    const error = new Error("private database failure");
    const props = { error, reset } as ErrorComponentProps;
    const { container } = render(React.createElement(RootRouteError, props));
    expect(container.querySelector("section[data-nosnippet]")).not.toBeNull();
    expect(container.textContent).not.toContain(error.message);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith("[router] rendering failed", error);
  });
});
