// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useConfig: vi.fn(),
  childMounted: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("../../queries/use-public-catalog", () => ({
  useOtwPlayConfig: mocks.useConfig,
}));
vi.mock("../../player/play-player-context", () => ({
  OtwPlayPlayerProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("../player/now-playing-panel", () => ({
  OtwPlayNowPlayingPanel: () => null,
}));

import { OtwPlayShell } from "./play-shell";

function ChildCatalogRequest() {
  mocks.childMounted();
  return <div>catalog child</div>;
}

describe("OtwPlayShell config gate", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows preparation state and mounts zero child catalog work while public read is off", () => {
    mocks.useConfig.mockReturnValue({
      isPending: false,
      isError: false,
      data: { data: { publicReadEnabled: false, navigationVisible: false } },
    });
    render(<OtwPlayShell><ChildCatalogRequest /></OtwPlayShell>);
    expect(screen.getByText("OTW Play 준비 중")).toBeTruthy();
    expect(screen.queryByText("catalog child")).toBeNull();
    expect(mocks.childMounted).not.toHaveBeenCalled();
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
