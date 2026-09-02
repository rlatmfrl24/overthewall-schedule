// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { XPostHistoryManager } from "./x-post-history-manager";

const fetchActiveMembersMock = vi.hoisted(() => vi.fn());
const fetchXHistoryPostsMock = vi.hoisted(() => vi.fn());
const redactXHistoryPostMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/members", () => ({
  fetchActiveMembers: fetchActiveMembersMock,
}));

vi.mock("../../api/x-history-api", () => ({
  fetchXHistoryPosts: fetchXHistoryPostsMock,
  redactXHistoryPost: redactXHistoryPostMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe("XPostHistoryManager", () => {
  beforeEach(() => {
    fetchActiveMembersMock.mockResolvedValue([]);
    fetchXHistoryPostsMock.mockResolvedValue({
      posts: [{
        postId: "2092687186093388108",
        memberUid: 1,
        memberName: "테스트 멤버",
        postType: "post",
        createdAt: Date.parse("2026-09-02T05:00:00.000Z"),
        firstSeenAt: Date.parse("2026-09-02T05:01:00.000Z"),
        mediaCount: 0,
        linkCount: 0,
        status: "visible",
        hiddenAt: null,
        hiddenReason: null,
        post: {
          id: "2092687186093388108",
          text: "보관된 게시물",
          createdAt: "2026-09-02T05:00:00.000Z",
          url: "https://x.com/test/status/2092687186093388108",
          username: "test",
          metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 },
          media: [],
          quote: null,
          reply: null,
        },
      }],
      hasMore: false,
      nextCursor: null,
    });
    redactXHistoryPostMock.mockResolvedValue("ok");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("기본 화면에서는 보관 기록을 조회하지 않고 삭제 작업을 두 단계 안에 숨긴다", async () => {
    render(createElement(XPostHistoryManager, { enabled: true }), {
      wrapper: createQueryWrapper(),
    });

    expect(screen.getByText("보관 기록 관리")).toBeTruthy();
    expect(fetchXHistoryPostsMock).not.toHaveBeenCalled();

    const archiveDetails = screen.getByText("보관 기록 관리").closest("details");
    if (!archiveDetails) throw new Error("Archive details were not found");
    archiveDetails.open = true;
    fireEvent(archiveDetails, new Event("toggle"));

    await waitFor(() => expect(fetchXHistoryPostsMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("보관된 게시물")).toBeTruthy();

    const actionsDetails = screen.getByText("기타 관리").closest("details");
    if (!actionsDetails) throw new Error("Post actions details were not found");
    expect(actionsDetails.open).toBe(false);
    actionsDetails.open = true;
    fireEvent(actionsDetails, new Event("toggle"));

    expect(screen.getByRole("button", { name: "원문 제거 및 숨김" })).toBeTruthy();
  });

  it("색인이 비활성화된 경우 보관 영역을 열어도 기록 API를 호출하지 않는다", async () => {
    render(createElement(XPostHistoryManager, { enabled: false }), {
      wrapper: createQueryWrapper(),
    });

    const archiveDetails = screen.getByText("보관 기록 관리").closest("details");
    if (!archiveDetails) throw new Error("Archive details were not found");
    archiveDetails.open = true;
    fireEvent(archiveDetails, new Event("toggle"));

    expect(await screen.findByText(/기록 분석 킬스위치가 꺼져 있습니다/)).toBeTruthy();
    expect(fetchXHistoryPostsMock).not.toHaveBeenCalled();
  });
});
