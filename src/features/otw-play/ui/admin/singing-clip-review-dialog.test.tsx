// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";

const updateCandidateMock = vi.hoisted(() => vi.fn());
const convertCandidateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  updateOtwPlayImportCandidate: updateCandidateMock,
  convertOtwPlayImportCandidate: convertCandidateMock,
}));

vi.mock("@/features/members", () => ({
  fetchActiveMembers: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SingingClipReviewDialog", () => {
  it("saves the review before converting the candidate to a private draft", async () => {
    const reviewInput = {
      song: { kind: "existing" as const, songId: "song-1" },
      participants: [{
        subject: { kind: "entity" as const, entityId: "entity-1" },
        participantRole: "vocal" as const,
        creditOrder: 0,
        creditNameSnapshot: "Singer",
      }],
      relationType: "cover" as const,
      releaseType: "broadcast" as const,
      participationType: "solo" as const,
      startSeconds: 30,
      endSeconds: 150,
      internalNote: "source checked",
    };
    const candidate = {
      candidateId: "youtube:BBBBBBBBBBB",
      candidateVersion: 3,
      videoId: "BBBBBBBBBBB",
      title: "Reviewed Singing Clip",
      channelTitle: "Approved Clips",
      thumbnailUrl: null,
      durationSeconds: 180,
      publishedAt: 100,
      availabilityStatus: "playable",
      status: "needs_input",
      classification: "eligible",
      exclusionReason: null,
      catalogChannelId: "channel-1",
      reviewInput,
      linkedPerformanceId: null,
      discoveredAt: 100,
    } as const;
    const catalog = {
      songs: [{ id: "song-1", title: "Existing Song", archivedAt: null }],
      entities: [{
        id: "entity-1",
        memberUid: null,
        displayName: "Singer",
        entityKind: "person",
      }],
    } as never;
    const onOpenChange = vi.fn();
    const onConverted = vi.fn().mockResolvedValue(undefined);
    updateCandidateMock.mockResolvedValue({ version: 4 });
    convertCandidateMock.mockResolvedValue({
      candidateId: candidate.candidateId,
      outcome: "created",
      performanceId: "performance-1",
      errorCode: null,
    });

    render(
      createElement(SingingClipReviewDialog, {
        candidate,
        catalog,
        onOpenChange,
        onConverted,
      }),
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByText("비공개 방송 가창 draft이며 자동 게시되지 않습니다.", {
      exact: false,
    })).toBeTruthy();
    const saveButton = screen.getByRole("button", {
      name: "검수 완료 후 draft 생성",
    });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      candidate.candidateId,
      {
        expectedVersion: 3,
        expectedReviewInput: reviewInput,
        expectedReviewStatus: "needs_input",
        action: "save",
        input: reviewInput,
      },
    ));
    expect(convertCandidateMock).toHaveBeenCalledWith(candidate.candidateId, {
      expectedVersion: 4,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConverted).toHaveBeenCalledWith("performance-1");
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: "success",
    }));
  });
});
