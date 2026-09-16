// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  useAdminStatus: vi.fn(),
}));
vi.mock("@clerk/clerk-react", () => ({
  useUser: () => ({ user: { id: "user-one" } }),
}));
vi.mock("@/features/auth", () => ({ useAdminStatus: mocks.useAdminStatus }));
vi.mock("../../queries/use-member-submissions", () => ({
  useMyOtwPlaySubmissions: mocks.list,
  useMyOtwPlaySubmission: mocks.detail,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, search }: { children: React.ReactNode; to: string; search?: { performance?: string } }) => <a href={search?.performance ? `${to}?performance=${search.performance}` : to}>{children}</a>,
}));

import { OtwPlaySubmissionsPage } from "./submissions-page";

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OtwPlaySubmissionsPage />
    </QueryClientProvider>,
  );
};

describe("OtwPlaySubmissionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAdminStatus.mockReturnValue({
      data: { authenticated: true, isAdmin: false },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.detail.mockReturnValue({ isPending: false, data: null });
  });
  afterEach(cleanup);

  it("shows a focused first-proposal action without an empty detail panel", () => {
    mocks.list.mockReturnValue({
      isPending: false,
      data: { pages: [{ items: [], nextCursor: null }] },
      hasNextPage: false,
    });

    renderPage();

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
            youtubeVideoId: "abcdefghijk",
            participants: [{ displayName: "참여 멤버", participantRole: "vocal" }],
          }],
          nextCursor: null,
        }],
      },
      hasNextPage: false,
    });
    mocks.detail.mockReturnValue({ isPending: true, data: null });

    const { container } = renderPage();

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /테스트 제안/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("상세 정보를 불러오는 중");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("shows a retryable error instead of the empty state when the list fails", () => {
    const refetch = vi.fn();
    mocks.list.mockReturnValue({
      isPending: false,
      isError: true,
      data: undefined,
      refetch,
    });
    renderPage();
    expect(screen.getByRole("alert").textContent).toContain("불러오지 못했습니다");
    expect(screen.queryByText("아직 제출한 제안이 없습니다")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("links an approved catalog entry from the administrator preview", () => {
    mocks.useAdminStatus.mockReturnValue({
      data: { authenticated: true, isAdmin: true },
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    });
    mocks.list.mockReturnValue({
      isPending: false,
      data: {
        pages: [{
          items: [{
            id: "proposal-one",
            title: "승인된 제안",
            status: "approved",
            createdAt: 1,
            youtubeVideoId: "abcdefghijk",
            participants: [{ displayName: "참여 멤버", participantRole: "vocal" }],
          }],
          nextCursor: null,
        }],
      },
      hasNextPage: false,
    });
    mocks.detail.mockReturnValue({
      isPending: false,
      data: {
        id: "proposal-one",
        createdAt: 1,
        youtubeUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        title: "승인된 제안",
        status: "approved",
        tags: ["J-POP"],
        originalArtists: [{ displayName: "원곡 가수" }],
        participants: [{ displayName: "메인 보컬", participantRole: "vocal" }],
        note: null,
        approvedSong: {
          slug: "approved-song",
          performanceId: "approved-performance",
          releaseType: "broadcast",
          publicLinkAvailable: false,
        },
      },
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /승인된 제안/ }));

    expect(screen.getByText("승인되어 카탈로그에 반영되었습니다.")).toBeTruthy();
    expect(screen.getByText("J-POP")).toBeTruthy();
    expect(screen.queryByText("승인되었습니다. 운영 공개 준비 중입니다.")).toBeNull();
    expect(screen.getByRole("link", { name: "관리자 미리보기에서 확인" }).getAttribute("href")).toBe("/play/clips/$songSlug?performance=approved-performance");
  });
  it("keeps approval history visible without a broken link after catalog deletion", () => {
    const proposal = {
      id: "deleted-proposal", title: "삭제된 가창 제안", status: "approved", createdAt: 1,
      youtubeVideoId: "abcdefghijk", youtubeUrl: "https://youtu.be/abcdefghijk",
      participants: [], originalArtists: [], tags: [], approvedPerformanceDeleted: true, approvedSong: null,
    };
    mocks.list.mockReturnValue({ isPending: false, data: { pages: [{ items: [proposal], nextCursor: null }] }, hasNextPage: false });
    mocks.detail.mockReturnValue({ isPending: false, data: proposal });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /삭제된 가창 제안/ }));
    expect(screen.getByText("승인 이력은 보존되어 있으며, 연결된 카탈로그 가창은 삭제되었습니다.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /카탈로그에서 확인|관리자 미리보기에서 확인/ })).toBeNull();
  });

  it("hides only approved cards and can restore them", () => {
    const items = ["approved", "pending_review", "rejected", "withdrawn"].map(status => ({
      id: status, title: `곡 ${status}`, status, createdAt: 1,
      youtubeVideoId: "abcdefghijk", participants: [{ displayName: "멤버" }],
    }));
    mocks.list.mockReturnValue({ data: { pages: [{ items }] } });
    renderPage();
    const toggle = screen.getByRole("switch", { name: "승인된 제안 숨기기" });
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: /곡 approved/ })).toBeNull();
    for (const status of ["pending_review", "rejected", "withdrawn"]) {
      expect(screen.getByRole("button", { name: new RegExp(`곡 ${status}`) })).toBeTruthy();
    }
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /곡 approved/ })).toBeTruthy();
  });

  it("keeps pagination available when every loaded card is hidden", () => {
    const fetchNextPage = vi.fn();
    mocks.list.mockReturnValue({
      data: { pages: [{ items: [{ id: "approved", title: "승인 곡", status: "approved", createdAt: 1, youtubeVideoId: "abcdefghijk", participants: [] }] }] },
      hasNextPage: true, fetchNextPage,
    });
    renderPage();
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText(/불러온 제안은 모두 승인된 상태/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("retries detail failures and restores focus to the card after closing", async () => {
    const refetch = vi.fn();
    mocks.list.mockReturnValue({ data: { pages: [{ items: [{ id: "one", title: "상세 확인 곡", status: "pending_review", createdAt: 1, youtubeVideoId: "abcdefghijk", participants: [] }] }] } });
    mocks.detail.mockReturnValue({ isError: true, refetch });
    renderPage();
    const card = screen.getByRole("button", { name: /상세 확인 곡/ });
    fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "상세 다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "상세 닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(mocks.detail).toHaveBeenLastCalledWith(null);
  });

});
