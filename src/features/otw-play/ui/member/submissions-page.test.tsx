// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock("../../queries/use-member-submissions", () => ({
  useMyOtwPlaySubmissions: mocks.list,
  useMyOtwPlaySubmission: mocks.detail,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

import { OtwPlaySubmissionsPage } from "./submissions-page";

describe("OtwPlaySubmissionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.detail.mockReturnValue({ isPending: false, data: null });
  });
  afterEach(cleanup);

  it("shows a focused first-proposal action without an empty detail panel", () => {
    mocks.list.mockReturnValue({
      isPending: false,
      data: { pages: [{ items: [], nextCursor: null }] },
      hasNextPage: false,
    });

    render(<OtwPlaySubmissionsPage />);

    expect(screen.getByText("아직 제출한 제안이 없습니다")).toBeTruthy();
    expect(screen.getByRole("link", { name: "첫 곡 제안하기" }).getAttribute("href")).toBe("/play/submit");
    expect(screen.queryByText("목록에서 제안을 선택하세요.")).toBeNull();
  });
});
