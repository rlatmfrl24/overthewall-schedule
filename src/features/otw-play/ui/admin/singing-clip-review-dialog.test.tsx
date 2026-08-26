// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";

const updateCandidateMock = vi.hoisted(() => vi.fn());
const convertCandidateMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const fetchActiveMembersMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  updateOtwPlayImportCandidate: updateCandidateMock,
  convertOtwPlayImportCandidate: convertCandidateMock,
}));

vi.mock("@/features/members", () => ({
  fetchActiveMembers: fetchActiveMembersMock,
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

beforeEach(() => {
  fetchActiveMembersMock.mockReset();
  fetchActiveMembersMock.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const reviewFixture = () => {
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
  return {
    reviewInput,
    candidate: {
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
    } as const,
    catalog: {
      songs: [{ id: "song-1", title: "Existing Song", archivedAt: null }],
      entities: [{
        id: "entity-1",
        memberUid: null,
        displayName: "Singer",
        entityKind: "person",
      }],
    } as never,
  };
};

describe("SingingClipReviewDialog", () => {
  it("offers active members as canonical original artists", async () => {
    const { reviewInput, candidate, catalog } = reviewFixture();
    const createSongReviewInput = {
      ...reviewInput,
      song: {
        kind: "create" as const,
        title: "Member Original",
        isOtwOriginal: true,
        originalReleaseDate: null,
        originalReleasePrecision: "unknown" as const,
        aliases: [],
        originalArtists: [],
        tags: [],
      },
    };
    const candidateWithNewSong = {
      ...candidate,
      reviewInput: createSongReviewInput,
    };
    fetchActiveMembersMock.mockResolvedValue([{
      uid: 1,
      code: "member",
      name: "현재 멤버",
      oshi_mark: "🌙",
      unit_name: "테스트 유닛",
    }]);
    updateCandidateMock.mockImplementation(async (_candidateId, command) => ({
      version: 4,
      status: "ready",
      reviewInput: command.input,
    }));
    convertCandidateMock.mockResolvedValue({
      candidateId: candidate.candidateId,
      outcome: "created",
      performanceId: "performance-1",
      errorCode: null,
    });

    render(
      createElement(SingingClipReviewDialog, {
        candidate: candidateWithNewSong,
        catalog,
        onOpenChange: vi.fn(),
        onConverted: vi.fn().mockResolvedValue(undefined),
        onReviewStateChanged: vi.fn().mockResolvedValue(undefined),
      }),
      { wrapper: createQueryWrapper() },
    );

    const artistSearch = screen.getByLabelText("원곡 가수 검색");
    fireEvent.change(artistSearch, { target: { value: "현재 멤버" } });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    expect(screen.getByText(/현재 멤버 🌙 · 테스트 유닛/)).toBeTruthy();

    const saveButton = screen.getByRole("button", {
      name: "검수 완료 후 draft 생성",
    });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);

    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      candidate.candidateId,
      expect.objectContaining({
        input: expect.objectContaining({
          song: expect.objectContaining({
            originalArtists: [{
              subject: { kind: "member", memberUid: 1 },
              creditOrder: 0,
              isPrimary: true,
            }],
          }),
        }),
      }),
    ));
  });

  it("saves the review before converting the candidate to a private draft", async () => {
    const { reviewInput, candidate, catalog } = reviewFixture();
    const onOpenChange = vi.fn();
    const onConverted = vi.fn().mockResolvedValue(undefined);
    const onReviewStateChanged = vi.fn().mockResolvedValue(undefined);
    updateCandidateMock.mockResolvedValue({
      version: 4,
      status: "ready",
      reviewInput,
    });
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
        onReviewStateChanged,
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

  it("keeps the action disabled when the start exceeds the video duration", async () => {
    const { candidate, catalog } = reviewFixture();
    render(
      createElement(SingingClipReviewDialog, {
        candidate,
        catalog,
        onOpenChange: vi.fn(),
        onConverted: vi.fn(),
        onReviewStateChanged: vi.fn(),
      }),
      { wrapper: createQueryWrapper() },
    );
    const saveButton = screen.getByRole("button", {
      name: "검수 완료 후 draft 생성",
    });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));

    fireEvent.change(screen.getByLabelText("시작 위치(초)"), {
      target: { value: "180" },
    });
    expect(saveButton.hasAttribute("disabled")).toBe(true);
  });

  it("reuses the saved review baseline after conversion failure", async () => {
    const { reviewInput, candidate, catalog } = reviewFixture();
    const onConverted = vi.fn().mockResolvedValue(undefined);
    const onReviewStateChanged = vi.fn().mockResolvedValue(undefined);
    updateCandidateMock
      .mockResolvedValueOnce({ version: 4, status: "ready", reviewInput })
      .mockResolvedValueOnce({ version: 6, status: "ready", reviewInput });
    convertCandidateMock
      .mockResolvedValueOnce({
        candidateId: candidate.candidateId,
        outcome: "validation_failed",
        performanceId: null,
        errorCode: "validation_failed",
      })
      .mockResolvedValueOnce({
        candidateId: candidate.candidateId,
        outcome: "created",
        performanceId: "performance-1",
        errorCode: null,
      });
    render(
      createElement(SingingClipReviewDialog, {
        candidate,
        catalog,
        onOpenChange: vi.fn(),
        onConverted,
        onReviewStateChanged,
      }),
      { wrapper: createQueryWrapper() },
    );
    const saveButton = screen.getByRole("button", {
      name: "검수 완료 후 draft 생성",
    });
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(saveButton);
    await waitFor(() => expect(onReviewStateChanged).toHaveBeenCalledOnce());
    await waitFor(() => expect(saveButton.hasAttribute("disabled")).toBe(false));

    fireEvent.click(saveButton);
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledTimes(2));
    expect(updateCandidateMock).toHaveBeenNthCalledWith(2, candidate.candidateId, {
      expectedVersion: 4,
      expectedReviewInput: reviewInput,
      expectedReviewStatus: "ready",
      action: "save",
      input: reviewInput,
    });
    await waitFor(() => expect(onConverted).toHaveBeenCalledWith("performance-1"));
  });
});
