// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { ChannelMonitorSection } from "./channel-monitor-section";

const reconcileMock = vi.hoisted(() => vi.fn());
const createMonitorMock = vi.hoisted(() => vi.fn());
const updateMonitorMock = vi.hoisted(() => vi.fn());
const deleteMonitorMock = vi.hoisted(() => vi.fn());
const updateCandidateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  createOtwPlayChannelMonitor: createMonitorMock,
  updateOtwPlayChannelMonitor: updateMonitorMock,
  deleteOtwPlayChannelMonitor: deleteMonitorMock,
  reconcileOtwPlayChannelMonitor: reconcileMock,
  updateOtwPlayImportCandidate: updateCandidateMock,
}));

vi.mock("../../queries/use-admin-catalog", () => ({
  useOtwPlayChannelMonitors: () => ({ data: [{
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
    lastErrorCode: null,
    candidateCount: 1,
    pendingCandidateCount: 1,
    version: 2,
    createdAt: 100,
    updatedAt: 100,
  }] }),
  useOtwPlayChannelMonitorCandidates: () => ({ data: [{
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
  }] }),
}));

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
    expect(screen.getByText(/자동 공개\/변환 안 함/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /지금 대조/ }));
    await waitFor(() => expect(reconcileMock).toHaveBeenCalledWith("monitor-1"));

    fireEvent.click(screen.getByRole("button", { name: /제외/ }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:BBBBBBBBBBB",
      { expectedVersion: 3, action: "ignore" },
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
});
