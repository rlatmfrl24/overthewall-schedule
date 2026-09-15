// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OtwPlayMemberProfileLink } from "./member-profile-link";

const mocks = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("../../queries/use-public-catalog", () => ({ useOtwPlayConfig: mocks.config }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, search, children }: { to: string; search: { member: string }; children: ReactNode }) =>
    <a href={`${to}?member=${encodeURIComponent(JSON.stringify(search.member))}`}>{children}</a>,
}));
afterEach(cleanup);

describe("profile Play search link", () => {
  it("uses the supplied profile UID without requesting a songbook or song counts", () => {
    mocks.config.mockReturnValue({ data: { data: { publicReadEnabled: true, navigationVisible: true } } });
    render(<OtwPlayMemberProfileLink memberUid={8} />);
    expect(screen.getByRole("link", { name: "OTW Play에서 노래 듣기" }).getAttribute("href")).toBe("/play/songs?member=%228%22");
  });
  it.each([
    { data: { data: { publicReadEnabled: false, navigationVisible: false } } },
    { data: { data: { publicReadEnabled: true, navigationVisible: false } } },
    { isPending: true },
    { isError: true, data: { data: { publicReadEnabled: true, navigationVisible: true } } },
  ])("keeps the link hidden when public navigation is unavailable", state => {
    mocks.config.mockReturnValue(state);
    render(<OtwPlayMemberProfileLink memberUid={8} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
