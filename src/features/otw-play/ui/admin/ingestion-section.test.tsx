// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { createQueryWrapper } from "@/test/query-client";
import { chunkOtwPlayIngestionSelections } from "../../model/ingestion-selection";
import { IngestionSection } from "./ingestion-section";

const preflightMock = vi.hoisted(() => vi.fn());
const createImportMock = vi.hoisted(() => vi.fn());
const updateCandidateMock = vi.hoisted(() => vi.fn());
const convertMock = vi.hoisted(() => vi.fn());
const ignoreCandidatesMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const fetchItemsMock = vi.hoisted(() => vi.fn());
const itemsHookMock = vi.hoisted(() => vi.fn());
const jobHookMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  preflightOtwPlayPlaylistImport: preflightMock,
  createOtwPlayPlaylistImport: createImportMock,
  updateOtwPlayImportCandidate: updateCandidateMock,
  convertOtwPlayImportCandidates: convertMock,
  ignoreOtwPlayImportCandidates: ignoreCandidatesMock,
  retryOtwPlayImportJob: retryMock,
  fetchOtwPlayImportJobItems: fetchItemsMock,
}));

vi.mock("../../queries/use-admin-catalog", () => ({
  useOtwPlayImportJob: jobHookMock,
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
  }, {
    id: "entity-external",
    displayName: "Guest Artist",
    memberUid: null,
    entityKind: "person",
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
  candidateClassification: "eligible" as const,
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

const startImportAndOpenEditor = async () => {
  fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
    target: { value: "PL1234567890" },
  });
  fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
  await screen.findByText("Official Covers");
  fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
  await screen.findAllByText("Candidate Video");
  fireEvent.click(screen.getAllByRole("button", { name: "행별 보완" })[0]!);
};

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
    ignoreCandidatesMock.mockReset();
    fetchItemsMock.mockReset();
    itemsHookMock.mockReset();
    jobHookMock.mockReset();
    toastMock.mockReset();
    jobHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
            id: "job-1",
            playlistTitle: "Official Covers",
            status: "completed",
            counts: { discovered: 1, metadataChecked: 1, eligible: 1 },
            lastErrorCode: null,
          }
        : undefined,
    }));
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
    updateCandidateMock.mockResolvedValue({
      id: "youtube:AAAAAAAAAAA",
      version: 3,
      videoId: "AAAAAAAAAAA",
      status: "ready",
      classification: "eligible",
      catalogChannelId: "channel-1",
      reviewInput: candidate().reviewInput,
      linkedPerformanceId: null,
    });
    convertMock.mockResolvedValue({
      results: [{
        candidateId: "youtube:AAAAAAAAAAA",
        outcome: "created",
        performanceId: "performance-1",
        errorCode: null,
      }],
    });
    ignoreCandidatesMock.mockResolvedValue({
      results: [{
        candidateId: "youtube:AAAAAAAAAAA",
        outcome: "ignored",
        errorCode: null,
      }],
    });
  });

  it("runs the persisted playlist flow, saves row review, and converts only to draft", async () => {
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
    expect(await screen.findByText("Official Covers")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    expect(await screen.findAllByText("Candidate Video")).not.toHaveLength(0);
    expect(screen.queryByText("선택 항목 일괄 설정")).toBeNull();

    const preview = screen.getAllByRole("region", {
      name: "Candidate Video 적용 미리보기",
    })[0]!;
    expect(within(preview).getByText("기존 곡 연결 · Existing Song")).toBeTruthy();
    expect(within(preview).getByText("기존 곡 정보 유지")).toBeTruthy();
    expect(within(preview).getByText("Singer · 메인 보컬")).toBeTruthy();
    expect(within(preview).getByText("커버 · 공식 영상 · 솔로")).toBeTruthy();
    expect(within(preview).getByText("저장 준비됨")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: "행별 보완" })[0]!);
    const reviewPanel = screen.getByRole("complementary", { name: "후보 행별 보완" });
    expect(reviewPanel.className).toContain("xl:sticky");
    expect(reviewPanel.firstElementChild?.className).toContain("xl:max-h-[calc(100dvh-2rem)]");
    expect(screen.getAllByRole("button", { name: "편집 중" }).every(
      (button) => button.getAttribute("aria-pressed") === "true",
    )).toBe(true);
    expect(screen.queryByLabelText("원곡 제목")).toBeNull();
    expect(screen.queryByText("OTW 오리지널곡")).toBeNull();
    expect(within(reviewPanel).queryByRole("region", {
      name: "Candidate Video 적용 미리보기",
    })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ready로 저장" }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:AAAAAAAAAAA",
      expect.objectContaining({
        expectedVersion: 2,
        expectedReviewInput: candidate().reviewInput,
        expectedReviewStatus: "ready",
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

  it("shows only the controls required by the selected import mode", () => {
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByRole("group", { name: "가져오기 범위" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /새 항목 전체/ })).toHaveProperty("checked", true);
    expect(screen.queryByLabelText("최근 가져올 개수")).toBeNull();
    expect(screen.queryByLabelText("시작 위치")).toBeNull();
    expect(screen.queryByLabelText("가져올 개수")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /최근 항목/ }));
    expect(screen.getByLabelText("최근 가져올 개수")).toBeTruthy();
    expect(screen.queryByLabelText("시작 위치")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /위치 범위/ }));
    expect(screen.queryByLabelText("최근 가져올 개수")).toBeNull();
    expect(screen.getByLabelText("시작 위치")).toBeTruthy();
    expect(screen.getByLabelText("가져올 개수")).toBeTruthy();
  });

  it("refetches candidate items when the ingestion job authority changes", async () => {
    let updatedAt = 1;
    const refetch = vi.fn(async () => undefined);
    jobHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
            id: "job-1",
            playlistTitle: "Official Covers",
            status: "collecting",
            counts: { discovered: 1, metadataChecked: 0, eligible: 0 },
            lastErrorCode: null,
            updatedAt,
          }
        : undefined,
    }));
    itemsHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId ? { items: [candidate()], nextCursor: null } : undefined,
      isLoading: false,
      refetch,
    }));
    const view = render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
    await screen.findByText("Official Covers");
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));

    updatedAt = 2;
    view.rerender(createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }));
    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(2));
  });

  it("searches or adds original artists and keeps external singers behind an explicit option", async () => {
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    await startImportAndOpenEditor();

    expect(screen.getByLabelText("Singer")).toBeTruthy();
    expect(screen.queryByLabelText("Guest Artist")).toBeNull();
    expect(screen.queryByLabelText("외부 가창자 검색")).toBeNull();

    const songSelect = screen.getByRole("combobox", { name: "연결할 곡" });
    fireEvent.keyDown(songSelect, { key: "Enter" });
    fireEvent.click(await screen.findByRole("option", { name: "새 곡 입력" }));

    const artistSearch = screen.getByLabelText("원곡 가수 검색");
    fireEvent.change(artistSearch, { target: { value: "Guest Artist" } });
    fireEvent.click(await screen.findByRole("option", { name: /Guest Artist/ }));
    fireEvent.change(artistSearch, { target: { value: "New Original Artist" } });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));

    fireEvent.click(screen.getByRole("checkbox", { name: /외부 가창자 추가/ }));
    const externalSearch = screen.getByLabelText("외부 가창자 검색");
    fireEvent.change(externalSearch, { target: { value: "Guest Vocal" } });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    expect(screen.getByLabelText("Guest Vocal 참여 역할")).toBeTruthy();

    const preview = screen.getAllByRole("region", {
      name: "Candidate Video 적용 미리보기",
    })[0]!;
    expect(within(preview).getByText("새 곡 생성 · Candidate Video")).toBeTruthy();
    expect(within(preview).getByText("Guest Artist, New Original Artist")).toBeTruthy();
    expect(within(preview).getByText(
      "Singer · 메인 보컬, Guest Vocal · 메인 보컬",
    )).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "ready로 저장" }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:AAAAAAAAAAA",
      expect.objectContaining({
        action: "save",
        input: expect.objectContaining({
          song: expect.objectContaining({
            kind: "create",
            originalArtists: [
              expect.objectContaining({
                subject: { kind: "entity", entityId: "entity-external" },
              }),
              expect.objectContaining({
                subject: expect.objectContaining({
                  kind: "new_external",
                  displayName: "New Original Artist",
                }),
              }),
            ],
          }),
          participants: expect.arrayContaining([
            expect.objectContaining({
              subject: { kind: "entity", entityId: "entity-1" },
            }),
            expect.objectContaining({
              subject: expect.objectContaining({
                kind: "new_external",
                displayName: "Guest Vocal",
              }),
            }),
          ]),
        }),
      }),
    ));
  });

  it("restores saved external participant inputs instead of dropping them", async () => {
    itemsHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
            items: [{
              ...candidate(),
              reviewInput: {
                ...candidate().reviewInput,
                participants: [
                  ...candidate().reviewInput.participants,
                  {
                    subject: {
                      kind: "new_external" as const,
                      clientKey: "guest-vocal",
                      displayName: "Saved Guest Vocal",
                      entityKind: "person" as const,
                    },
                    participantRole: "featured_vocal" as const,
                    creditOrder: 1,
                  },
                ],
              },
            }],
            nextCursor: null,
          }
        : undefined,
      isLoading: false,
    }));
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    await startImportAndOpenEditor();

    expect(screen.getByRole("checkbox", { name: /외부 가창자 추가/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByText("Saved Guest Vocal")).toHaveLength(2);
    expect(screen.getByRole("combobox", {
      name: "Saved Guest Vocal 참여 역할",
    }).textContent).toContain("피처링 보컬");

    fireEvent.click(screen.getByRole("button", { name: "ready로 저장" }));
    await waitFor(() => expect(updateCandidateMock).toHaveBeenCalledWith(
      "youtube:AAAAAAAAAAA",
      expect.objectContaining({
        input: expect.objectContaining({
          participants: expect.arrayContaining([
            expect.objectContaining({
              subject: expect.objectContaining({
                kind: "new_external",
                clientKey: "guest-vocal",
                displayName: "Saved Guest Vocal",
              }),
              participantRole: "featured_vocal",
            }),
          ]),
        }),
      }),
    ));
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
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "error",
      description:
        "YouTube playlist metadata 조회에 실패했습니다: network 요청 ID: request-123",
    }));
  });

  it("does not misclassify an existing catalog candidate as ready-editable", async () => {
    itemsHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
            items: [{
              ...candidate(),
              classification: "existing_candidate" as const,
              candidateClassification: "existing_catalog" as const,
              status: "ignored" as const,
              reviewInput: null,
            }],
            nextCursor: null,
          }
        : undefined,
      isLoading: false,
    }));
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    await startImportAndOpenEditor();

    expect(screen.getAllByText("실제 후보 · existing_catalog")).not.toHaveLength(0);
    expect(screen.getByText(
      "이미 카탈로그에 등록된 영상이므로 후보 검수값을 저장하지 않습니다.",
    )).toBeTruthy();
    expect(screen.getByRole("button", { name: "ready로 저장" }).hasAttribute("disabled"))
      .toBe(true);
    expect(updateCandidateMock).not.toHaveBeenCalled();
  });

  it("preserves row inputs and refreshes authority after a real review conflict", async () => {
    updateCandidateMock.mockRejectedValueOnce(new ApiError(
      "Ingestion candidate changed during review",
      409,
      { code: "PLAY_ADMIN_STALE_WRITE" },
    ));
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    await startImportAndOpenEditor();

    fireEvent.click(screen.getByRole("button", { name: "ready로 저장" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "info",
      description: "다른 검수 변경이 먼저 저장되었습니다. 입력값은 유지한 채 최신 상태를 불러왔습니다.",
    }));
    const preview = screen.getAllByRole("region", {
      name: "Candidate Video 적용 미리보기",
    })[0]!;
    expect(within(preview).getByText("기존 곡 연결 · Existing Song")).toBeTruthy();
    expect(within(preview).getByText("Singer · 메인 보컬")).toBeTruthy();
  });

  it("chunks more than 100 selected candidates into bounded conversion requests", () => {
    const chunks = chunkOtwPlayIngestionSelections(
      Array.from({ length: 101 }, (_, index) => candidate(index)),
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(1);
  });

  it("scans the whole job and bulk ignores only known non-playable videos", async () => {
    const privateVideo = {
      ...candidate(1),
      status: "blocked" as const,
      classification: "unavailable" as const,
      availabilityStatus: "private" as const,
      exclusionReason: "private",
    };
    const unknownVideo = {
      ...candidate(2),
      status: "blocked" as const,
      classification: "policy_blocked" as const,
      availabilityStatus: "unknown" as const,
      exclusionReason: "made_for_kids_review",
    };
    const deletedVideo = {
      ...candidate(3),
      status: "blocked" as const,
      classification: "unavailable" as const,
      availabilityStatus: "deleted" as const,
      exclusionReason: "deleted",
    };
    fetchItemsMock
      .mockResolvedValueOnce({
        items: [privateVideo, unknownVideo],
        nextCursor: "blocked-cursor-1",
      })
      .mockResolvedValueOnce({ items: [deletedVideo], nextCursor: null });
    ignoreCandidatesMock.mockResolvedValueOnce({
      results: [privateVideo, deletedVideo].map((item) => ({
        candidateId: item.candidateId,
        outcome: "ignored",
        errorCode: null,
      })),
    });
    render(
      createElement(IngestionSection, { catalog, onOpenCatalog: vi.fn() }),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
    await screen.findByText("Official Covers");
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    await screen.findAllByText("Candidate Video");

    fireEvent.click(screen.getByRole("button", {
      name: "숨김·삭제 영상 일괄 제외",
    }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "일괄 제외 실행" }));

    await waitFor(() => expect(fetchItemsMock).toHaveBeenNthCalledWith(
      1,
      "job-1",
      { limit: 100, cursor: null, status: "blocked" },
    ));
    expect(fetchItemsMock).toHaveBeenNthCalledWith(
      2,
      "job-1",
      { limit: 100, cursor: "blocked-cursor-1", status: "blocked" },
    );
    expect(ignoreCandidatesMock).toHaveBeenCalledWith("job-1", {
      candidates: [
        { id: privateVideo.candidateId, expectedVersion: 2 },
        { id: deletedVideo.candidateId, expectedVersion: 2 },
      ],
    });
    expect(toastMock).toHaveBeenCalledWith({
      variant: "success",
      description: "숨김·삭제·재생 불가 영상 2건 제외, 별도 확인 0건입니다.",
    });
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
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
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
