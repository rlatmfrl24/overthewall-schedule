// @vitest-environment jsdom
import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { IngestionSection } from "./ingestion-section";

const preflightMock = vi.hoisted(() => vi.fn());
const createImportMock = vi.hoisted(() => vi.fn());
const updateCandidateMock = vi.hoisted(() => vi.fn());
const convertMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  preflightOtwPlayPlaylistImport: preflightMock,
  createOtwPlayPlaylistImport: createImportMock,
  updateOtwPlayImportCandidate: updateCandidateMock,
  convertOtwPlayImportCandidates: convertMock,
  retryOtwPlayImportJob: retryMock,
  fetchOtwPlayImportJobItems: vi.fn(),
}));

vi.mock("../../queries/use-admin-catalog", () => ({
  useOtwPlayImportJob: (jobId: string | null) => ({
    data: jobId
      ? {
          id: "job-1",
          playlistTitle: "Official Covers",
          status: "completed",
          counts: { discovered: 1, metadataChecked: 1, eligible: 1 },
          lastErrorCode: null,
        }
      : undefined,
  }),
  useOtwPlayImportJobItems: (jobId: string | null) => ({
    data: jobId
      ? {
          items: [{
            originId: "origin-1",
            candidateId: "youtube:AAAAAAAAAAA",
            candidateVersion: 2,
            playlistPosition: 0,
            playlistItemId: "item-1",
            videoId: "AAAAAAAAAAA",
            status: "ready",
            classification: "eligible",
            exclusionReason: null,
            title: "Candidate Video",
            channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
            channelTitle: "Approved Channel",
            catalogChannelId: "channel-1",
            thumbnailUrl: null,
            durationSeconds: 180,
            publishedAt: 1,
            availabilityStatus: "playable",
            madeForKids: false,
            metadataCheckedAt: 1,
            reviewInput: {
              song: { kind: "existing", songId: "song-1" },
              participants: [{
                subject: { kind: "entity", entityId: "entity-1" },
                participantRole: "vocal",
                creditOrder: 0,
              }],
              relationType: "cover",
              releaseType: "official_video",
              participationType: "solo",
              internalNote: null,
            },
            lastConversionOutcome: null,
            lastConversionErrorCode: null,
            lastConversionAttemptAt: null,
            linkedPerformanceId: null,
          }],
          nextCursor: null,
        }
      : undefined,
    isLoading: false,
  }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

const catalog = {
  revision: 3,
  readModelRevision: 3,
  songs: [{
    id: "song-1",
    title: "Existing Song",
    archivedAt: null,
  }],
  entities: [{
    id: "entity-1",
    displayName: "Singer",
    memberUid: 1,
    archivedAt: null,
  }],
  performances: [],
  channels: [],
} as never;

describe("IngestionSection", () => {
  beforeEach(() => {
    preflightMock.mockReset();
    createImportMock.mockReset();
    updateCandidateMock.mockReset();
    convertMock.mockReset();
    toastMock.mockReset();
    preflightMock.mockResolvedValue({
      playlistId: "PL1234567890",
      canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890",
      title: "Official Covers",
      ownerChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
      ownerChannelTitle: "Approved Channel",
      itemCount: 1,
      privacyStatus: "public",
      requestedItemCount: 1,
      estimatedPageCount: 1,
      estimatedVideoBatchCount: 1,
      hardCap: 5000,
      requiresSplit: false,
      previousImport: null,
    });
    createImportMock.mockResolvedValue({ id: "job-1" });
    updateCandidateMock.mockResolvedValue({ version: 3 });
    convertMock.mockResolvedValue({
      results: [{
        candidateId: "youtube:AAAAAAAAAAA",
        outcome: "created",
        performanceId: "performance-1",
        errorCode: null,
      }],
    });
  });

  it("runs the persisted playlist flow, saves row review, and converts only to draft", async () => {
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("playlist URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    expect(await screen.findByText("Official Covers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    expect(await screen.findAllByText("Candidate Video")).not.toHaveLength(0);

    fireEvent.click(screen.getAllByRole("button", { name: "행별 보완" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "ready로 저장" }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:AAAAAAAAAAA",
      expect.objectContaining({
        expectedVersion: 2,
        action: "save",
        input: expect.objectContaining({
          song: { kind: "existing", songId: "song-1" },
        }),
      }),
    ));

    fireEvent.click(screen.getAllByRole("checkbox")[0]!);
    fireEvent.click(screen.getByRole("button", { name: /선택 ready 1건 draft 변환/ }));
    await waitFor(() => expect(convertMock).toHaveBeenCalledWith(
      "job-1",
      { candidates: [{ id: "youtube:AAAAAAAAAAA", expectedVersion: 2 }] },
    ));
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      description: expect.stringContaining("공개 게시로 전환되지는 않았습니다"),
    }));
  });
});
