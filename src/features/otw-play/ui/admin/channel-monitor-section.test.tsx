// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { ChannelMonitorSection } from "./channel-monitor-section";

const reconcileMock = vi.hoisted(() => vi.fn());
const createMonitorMock = vi.hoisted(() => vi.fn());
const updateMonitorMock = vi.hoisted(() => vi.fn());
const deleteMonitorMock = vi.hoisted(() => vi.fn());
const updateCandidateMock = vi.hoisted(() => vi.fn());
const subscribeMock = vi.hoisted(() => vi.fn());
const renewMock = vi.hoisted(() => vi.fn());
const unsubscribeMock = vi.hoisted(() => vi.fn());
const backfillMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const monitorsQueryMock = vi.hoisted(() => vi.fn());
const candidatesQueryMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  createOtwPlayChannelMonitor: createMonitorMock,
  updateOtwPlayChannelMonitor: updateMonitorMock,
  deleteOtwPlayChannelMonitor: deleteMonitorMock,
  reconcileOtwPlayChannelMonitor: reconcileMock,
  subscribeOtwPlayChannelMonitor: subscribeMock,
  renewOtwPlayChannelMonitor: renewMock,
  unsubscribeOtwPlayChannelMonitor: unsubscribeMock,
  backfillOtwPlayChannelMonitor: backfillMock,
  updateOtwPlayImportCandidate: updateCandidateMock,
}));

vi.mock("../../queries/use-admin-catalog", () => ({
  useOtwPlayChannelMonitors: monitorsQueryMock,
  useOtwPlayChannelMonitorCandidates: candidatesQueryMock,
}));

const monitor = {
    id: "monitor-1",
    channelId: "channel-1",
    channelDisplayName: "Approved Clips",
    externalChannelId: "UCmmmmmmmmmmmmmmmmmmmmmm",
    uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
    status: "active",
    checkIntervalMinutes: 360,
    lastCheckedAt: 100,
    nextCheckAt: 200,
    lastSeenVideoId: "AAAAAAAAAAA",
    lastSeenPublishedAt: 100,
    lastRecentReconciledAt: null,
    lastErrorCode: null,
    automationApproval: {
      scope: "candidate_collection",
      status: "approved",
      operatorReference: "operator-proof",
      approvalReference: "rights-ticket",
      revocationProcedure: "pause and unsubscribe",
      approvedByUserId: "admin-1",
      approvedAt: 100,
      revokedByUserId: null,
      revokedAt: null,
      version: 0,
    },
    subscription: null,
    candidateCount: 1,
    pendingCandidateCount: 1,
    generation: 0,
    version: 2,
    createdAt: 100,
    updatedAt: 100,
};

beforeEach(() => {
  monitorsQueryMock.mockReturnValue({
    data: [monitor],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  candidatesQueryMock.mockReturnValue({
    data: { pages: [{
      items: [{
        candidateId: "youtube:BBBBBBBBBBB",
        candidateVersion: 3,
        videoId: "BBBBBBBBBBB",
        title: "New Singing Clip",
        thumbnailUrl: null,
        publishedAt: 150,
        availabilityStatus: "playable",
        status: "needs_input",
        classification: "scope_review",
        exclusionReason: null,
        discoveredAt: 160,
      }],
      nextCursor: null,
    }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  });
});

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ChannelMonitorSection", () => {
  it("shows new uploads as review-only singing clip proposals", async () => {
    reconcileMock.mockResolvedValue({
      discoveredCount: 1,
      checkedVideoCount: 1,
      capped: false,
    });
    updateCandidateMock.mockResolvedValue({});

    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("New Singing Clip")).toBeTruthy();
    expect(screen.getByText("노래 클립 검수")).toBeTruthy();
    expect(screen.getByText("정보 입력 필요")).toBeTruthy();
    expect(screen.getByText("노래 영상 여부 확인")).toBeTruthy();
    expect(screen.getByText("재생 가능")).toBeTruthy();
    expect(screen.getByText(/자동 공개\/변환 안 함/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /지금 대조/ }));
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledWith("monitor-1"));

    fireEvent.click(screen.getByRole("button", { name: /제외/ }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:BBBBBBBBBBB",
      { expectedVersion: 3, action: "ignore" },
    ));
  });

  it("shows monitor loading and failure states instead of an empty result", () => {
    monitorsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    const view = render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });
    expect(screen.getByText("수집 대상 채널을 불러오는 중입니다.")).toBeTruthy();

    view.unmount();
    monitorsQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    });
    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });
    expect(screen.getByText("수집 대상 채널을 불러오지 못했습니다.")).toBeTruthy();
  });

  it("requires an explicit watermark reset before resuming a gap-paused monitor", async () => {
    monitorsQueryMock.mockReturnValue({
      data: [{
        ...monitor,
        status: "paused",
        lastErrorCode: "gap_suspected",
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    updateMonitorMock.mockResolvedValue({ id: "monitor-1" });
    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("기준 영상 확인 필요 · 안전을 위해 감시 중단")).toBeTruthy();
    expect(screen.getByRole("button", { name: "감시 재개" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "기준점 재설정" }));
    await waitFor(() => expect(updateMonitorMock).toHaveBeenCalledWith(
      "monitor-1",
      { expectedVersion: 2, resetWatermark: true },
    ));
  });

  it("adds, edits, and deletes collection targets by external channel ID", async () => {
    createMonitorMock.mockResolvedValue({ id: "monitor-1" });
    updateMonitorMock.mockResolvedValue({ id: "monitor-1" });
    deleteMonitorMock.mockResolvedValue({ id: "monitor-1" });
    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.change(screen.getByLabelText("수집 대상 채널 ID"), {
      target: { value: "UC1111111111111111111111" },
    });
    expect(screen.queryByLabelText("운영 주체 확인 근거")).toBeNull();
    expect(screen.queryByLabelText("비공개 후보 수집 승인 근거")).toBeNull();
    expect(screen.queryByLabelText("승인 해제 절차")).toBeNull();
    expect(screen.queryByLabelText("후보 수집 권리 확인")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "채널 추가" }));
    await waitFor(() => expect(createMonitorMock).toHaveBeenCalledWith({
      externalChannelId: "UC1111111111111111111111",
    }));

    fireEvent.change(screen.getByLabelText("채널 ID 수정"), {
      target: { value: "UC2222222222222222222222" },
    });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));
    await waitFor(() => expect(updateMonitorMock).toHaveBeenCalledWith(
      "monitor-1",
      {
        expectedVersion: 2,
        externalChannelId: "UC2222222222222222222222",
      },
    ));

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByText("수집 대상 채널을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "수집 대상 삭제" }));
    await waitFor(() => expect(deleteMonitorMock).toHaveBeenCalledWith(
      "monitor-1",
      { expectedVersion: 2 },
    ));
  });

  it("shows subscription state and runs explicit WebSub and bounded backfill actions", async () => {
    monitorsQueryMock.mockReturnValue({
      data: [{
        ...monitor,
        lastRecentReconciledAt: 1756101600000,
        subscription: {
          status: "active",
          leaseExpiresAt: 1756274400000,
          lastNotificationAt: 1756105200000,
          lastErrorCode: null,
        },
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    subscribeMock.mockResolvedValue({ id: "monitor-1" });
    renewMock.mockResolvedValue({ id: "monitor-1" });
    unsubscribeMock.mockResolvedValue({ id: "monitor-1" });
    backfillMock.mockResolvedValue({ discoveredCount: 0, checkedVideoCount: 20, capped: false });

    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("구독 활성")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /권리 승인 철회/ })).toBeNull();
    expect(screen.getByText((_, element) =>
      element?.tagName === "P" && element.textContent?.includes("마지막 알림") === true,
    )).toBeTruthy();
    expect(screen.getByText((_, element) =>
      element?.tagName === "P" && element.textContent?.includes("최근 50개 대조") === true,
    )).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "갱신" }));
    await waitFor(() => expect(renewMock).toHaveBeenCalledWith("monitor-1"));
    fireEvent.click(screen.getByRole("button", { name: "구독 해제" }));
    await waitFor(() => expect(unsubscribeMock).toHaveBeenCalledWith("monitor-1"));

    fireEvent.change(screen.getByLabelText("명시적 최근 영상 가져오기"), {
      target: { value: "20" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기" }));
    await waitFor(() => expect(backfillMock).toHaveBeenCalledWith(
      "monitor-1",
      { count: 20 },
    ));
  });

  it("keeps failed WebSub intents releasable but blocks target deletion", async () => {
    monitorsQueryMock.mockReturnValue({
      data: [{
        ...monitor,
        subscription: {
          status: "failed",
          leaseExpiresAt: null,
          lastNotificationAt: null,
          lastErrorCode: "hub_request_failed",
        },
      }],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    unsubscribeMock.mockResolvedValue({ id: "monitor-1" });

    render(createElement(ChannelMonitorSection), {
      wrapper: createQueryWrapper(),
    });

    expect(await screen.findByText("구독 요청 실패")).toBeTruthy();
    expect(screen.getByRole("button", { name: "구독" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "삭제" }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "구독 해제" }));
    await waitFor(() => expect(unsubscribeMock).toHaveBeenCalledWith("monitor-1"));
  });

});
