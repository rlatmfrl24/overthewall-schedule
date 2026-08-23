// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { createQueryWrapper } from "@/test/query-client";
import { chunkOtwPlayIngestionSelections } from "../../model/ingestion-selection";
import { IngestionSection } from "./ingestion-section";

const preflightMock = vi.hoisted(() => vi.fn());
const createImportMock = vi.hoisted(() => vi.fn());
const updateCandidateMock = vi.hoisted(() => vi.fn());
const convertMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const itemsHookMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  preflightOtwPlayPlaylistImport: preflightMock,
  createOtwPlayPlaylistImport: createImportMock,
  updateOtwPlayImportCandidate: updateCandidateMock,
  convertOtwPlayImportCandidates: convertMock,
  retryOtwPlayImportJob: retryMock,
  fetchOtwPlayImportJobItems: fetchItemsMock,
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
  useOtwPlayImportJobItems: itemsHookMock,
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

const candidate = (index = 0) => ({
  originId: `origin-${index}`,
  candidateId: index === 0
    ? "youtube:AAAAAAAAAAA"
    : `youtube:candidate-${index}`,
  candidateVersion: 2,
  playlistPosition: index,
  playlistItemId: `item-${index}`,
  videoId: index === 0 ? "AAAAAAAAAAA" : `candidate-${index}`,
  status: "ready" as const,
  classification: "eligible" as const,
  exclusionReason: null,
  title: index === 0 ? "Candidate Video" : `Candidate ${index}`,
  channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
  channelTitle: "Approved Channel",
  catalogChannelId: "channel-1",
  thumbnailUrl: null,
  durationSeconds: 180,
  publishedAt: 1,
  availabilityStatus: "playable" as const,
  madeForKids: false,
  metadataCheckedAt: 1,
  reviewInput: {
    song: { kind: "existing" as const, songId: "song-1" },
    participants: [{
      subject: { kind: "entity" as const, entityId: "entity-1" },
      participantRole: "vocal" as const,
      creditOrder: 0,
    }],
    relationType: "cover" as const,
    releaseType: "official_video" as const,
    participationType: "solo" as const,
    internalNote: null,
  },
  lastConversionOutcome: null,
  lastConversionErrorCode: null,
  lastConversionAttemptAt: null,
  linkedPerformanceId: null,
});

describe("IngestionSection", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(cleanup);

  beforeEach(() => {
    preflightMock.mockReset();
    createImportMock.mockReset();
    updateCandidateMock.mockReset();
    convertMock.mockReset();
    fetchItemsMock.mockReset();
    itemsHookMock.mockReset();
    toastMock.mockReset();
    itemsHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId ? { items: [candidate()], nextCursor: null } : undefined,
      isLoading: false,
    }));
    preflightMock.mockResolvedValue({
      playlistId: "PL1234567890",
      canonicalUrl: "https://www.youtube.com/playlist?list=PL1234567890",
      title: "Official Covers",
      ownerChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
      ownerChannelTitle: "Approved Channel",
      itemCount: 1,
      privacyStatus: "public",
      rangeStartPosition: 0,
      rangeEndExclusive: 1,
      nextRangeStart: null,
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

  it("shows the safe YouTube failure classification and request ID", async () => {
    preflightMock.mockRejectedValue(new ApiError(
      "YouTube playlist metadata is unavailable",
      503,
      {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        fields: { youtube: "network" },
        requestId: "request-123",
      },
    ));
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("playlist URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "error",
      description:
        "YouTube playlist metadata 조회에 실패했습니다: network 요청 ID: request-123",
    }));
  });

  it("chunks more than 100 selected candidates into bounded conversion requests", () => {
    const chunks = chunkOtwPlayIngestionSelections(
      Array.from({ length: 101 }, (_, index) => candidate(index)),
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(1);
  });

  it("loads every page for a selected server-side classification filter", async () => {
    itemsHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? { items: [candidate()], nextCursor: "cursor-1" }
        : undefined,
      isLoading: false,
    }));
    fetchItemsMock.mockResolvedValue({
      items: [candidate(1)],
      nextCursor: null,
    });
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("playlist URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "확인" }));
    await screen.findByText("Official Covers");
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    await screen.findAllByText("Candidate Video");
    const classificationTrigger = screen.getByText("전체 분류").closest("button");
    expect(classificationTrigger).toBeTruthy();
    fireEvent.keyDown(classificationTrigger!, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "eligible" }));
    fireEvent.click(screen.getByRole("button", {
      name: /현재 filter 전체 선택/,
    }));
    await waitFor(() => expect(fetchItemsMock).toHaveBeenCalledWith(
      "job-1",
      { limit: 100, cursor: "cursor-1", classification: "eligible" },
    ));
  });
});
