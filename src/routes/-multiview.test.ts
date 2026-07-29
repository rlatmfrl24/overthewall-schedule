// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/multiview", () => ({
  MultiviewPage: () =>
    React.createElement("div", { "data-testid": "multiview-page" }, "multiview"),
}));

import { Route } from "./multiview";

describe("/multiview route", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("mounts the multiview page without an auth gate", () => {
    const RouteComponent = Route.options.component as React.ComponentType;

    render(React.createElement(RouteComponent));

    expect(screen.getByTestId("multiview-page")).toBeTruthy();
    expect(screen.queryByText("로그인이 필요합니다")).toBeNull();
  });
});
