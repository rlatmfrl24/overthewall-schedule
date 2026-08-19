// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  isAdminUser: vi.fn(),
}));
vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: { id: "user-one" } }),
}));
vi.mock("@/app/admin", () => ({ isAdminUser: mocks.isAdminUser }));
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
    mocks.isAdminUser.mockReturnValue(false);
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
    expect(screen.getByRole("link", { name: "OTW Play로 돌아가기" }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("link", { name: "첫 곡 제안하기" }).getAttribute("href")).toBe("/play/submit");
    expect(screen.queryByText("목록에서 제안을 선택하세요.")).toBeNull();
  });

  it("does not show detail loading before a proposal is selected", () => {
    mocks.list.mockReturnValue({
      isPending: false,
      data: {
        pages: [{
          items: [{
            id: "proposal-one",
            title: "테스트 제안",
            status: "pending_review",
            createdAt: 1,
          }],
          nextCursor: null,
        }],
      },
      hasNextPage: false,
    });
    mocks.detail.mockReturnValue({ isPending: true, data: null });

    const { container } = render(<OtwPlaySubmissionsPage />);

    expect(screen.getByText("목록에서 제안을 선택하세요.")).toBeTruthy();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("links an approved catalog entry from the administrator preview", () => {
    mocks.isAdminUser.mockReturnValue(true);
    mocks.list.mockReturnValue({
      isPending: false,
      data: {
        pages: [{
          items: [{
            id: "proposal-one",
            title: "승인된 제안",
            status: "approved",
            createdAt: 1,
          }],
          nextCursor: null,
        }],
      },
      hasNextPage: false,
    });
    mocks.detail.mockReturnValue({
      isPending: false,
      data: {
        title: "승인된 제안",
        status: "approved",
        originalArtists: [{ displayName: "원곡 가수" }],
        participants: [{ displayName: "메인 보컬", participantRole: "vocal" }],
        note: null,
        approvedSong: {
          slug: "approved-song",
          publicLinkAvailable: false,
        },
      },
    });

    render(<OtwPlaySubmissionsPage />);
    screen.getByRole("button", { name: /승인된 제안/ }).click();

    expect(screen.getByText("승인되어 카탈로그에 반영되었습니다.")).toBeTruthy();
    expect(screen.queryByText("승인되었습니다. 운영 공개 준비 중입니다.")).toBeNull();
    expect(screen.getByRole("link", { name: "관리자 미리보기에서 확인" })).toBeTruthy();
  });
});
