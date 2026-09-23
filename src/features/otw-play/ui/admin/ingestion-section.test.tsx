// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { createQueryWrapper } from "@/test/query-client";
import { ConsoleSearchContext } from "@/shared/lib/admin-console-search";
import { IngestionSection } from "./ingestion-section";

const budgetMock = vi.hoisted(() => vi.fn());
const preflightMock = vi.hoisted(() => vi.fn());
const createImportMock = vi.hoisted(() => vi.fn());
const deleteHistoryMock = vi.hoisted(() => vi.fn());
const retryMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());
const jobHookMock = vi.hoisted(() => vi.fn());
const jobsHookMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/admin", () => ({
  fetchOtwPlayIngestionBudget: budgetMock,
  resumeOtwPlayImportJob: vi.fn(async () => ({ enqueued: 1 })),
  preflightOtwPlayPlaylistImport: preflightMock,
  createOtwPlayPlaylistImport: createImportMock,
  retryOtwPlayImportJob: retryMock,
  deleteOtwPlayImportHistory: deleteHistoryMock,
}));

vi.mock("../../queries/use-admin-catalog", () => ({
  useOtwPlayImportJob: jobHookMock,
  useOtwPlayImportJobs: jobsHookMock,
  useOtwPlayChannelMonitors: () => ({ data: [], isLoading: false }),
  useOtwPlayChannelMonitorCandidates: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

describe("IngestionSection", () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  });

  afterEach(cleanup);

  beforeEach(() => {
    budgetMock.mockReset().mockResolvedValue({ status: "available" });
    deleteHistoryMock.mockReset();
    preflightMock.mockReset();
    createImportMock.mockReset();
    retryMock.mockReset();
    jobHookMock.mockReset();
    jobsHookMock.mockReset();
    toastMock.mockReset();
    jobsHookMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(async () => undefined),
    });
    jobHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
             id: "job-1",
             playlistId: "PL1234567890",
             playlistTitle: "Official Covers",
             playlistOwnerChannelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
             playlistOwnerChannelTitle: "Approved Channel",
             sourceMetadataCheckedAt: 1,
             retentionExpiresAt: 2_592_000_001,
             mode: "all_new",
             rangeStartPosition: 0,
             rangeEndExclusive: 1,
             requestedItemCount: 1,
             status: "completed",
             counts: {
               discovered: 1,
               metadataChecked: 1,
               eligible: 1,
               existingCatalog: 0,
               existingProposal: 0,
               existingCandidate: 0,
               channelReview: 0,
               unavailable: 0,
               policyBlocked: 0,
               scopeReview: 0,
               playlistDuplicate: 0,
               retryPending: 0,
               permanentError: 0,
             },
             lastErrorCode: null,
             nextRetryAt: null,
             createdAt: 1,
             startedAt: 1,
             completedAt: 1,
           }
         : undefined,
      isError: false,
      isFetching: false,
      refetch: vi.fn(async () => undefined),
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
    retryMock.mockResolvedValue(undefined);
  });

  it("stops fast job polling when the current account budget blocks collection", async () => {
    budgetMock.mockResolvedValue({ status: "blocked", rowsRead: 4_000_000, dailyTarget: 4_000_000,
      measuredAt: new Date().toISOString(), resetAt: new Date(Date.now() + 60_000).toISOString(), reason: "daily_read_target" });
    render(createElement(IngestionSection), { wrapper: createQueryWrapper() });
    expect(await screen.findByText(/새 수집 예산 소진/)).toBeTruthy();
    await waitFor(() => expect(jobHookMock).toHaveBeenLastCalledWith(null, true, true));
  });

  it("does not enable job queries on a hidden visited screen", () => {
    render(createElement(IngestionSection, { active: false }), { wrapper: createQueryWrapper() });
    expect(jobsHookMock).toHaveBeenLastCalledWith(false);
    expect(jobHookMock).toHaveBeenLastCalledWith(null, false, false);
    expect(budgetMock).not.toHaveBeenCalled();
  });

  it("routes playlist review to the unified inbox without rendering a second editor", () => {
    const updateSearch = vi.fn();
    const job = { ...jobHookMock("job-1").data, candidateKind: "singing_clip" };
    jobHookMock.mockReturnValue({ data: job });
    jobsHookMock.mockReturnValue({ data: [job], isLoading: false });
    render(createElement(ConsoleSearchContext.Provider, {
      value: [{ category: "job-1", view: "jobs" }, updateSearch],
    }, createElement(IngestionSection)), { wrapper: createQueryWrapper() });

    expect(screen.getByRole("region", { name: "수집 작업 상태" })).toBeTruthy();
    expect(screen.queryByText(/후보 검토/)).toBeNull();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "행별 보완" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검수 목록으로 이동" }));
    expect(updateSearch).toHaveBeenCalledWith({
      view: "inbox", source: "playlist", kind: "broadcast", state: "pending", selected: undefined, proposal: undefined,
    }, false);
  });

  it("collects singing clips after preflight and exposes collection status", async () => {
    render(createElement(IngestionSection), { wrapper: createQueryWrapper() });
    fireEvent.click(screen.getByRole("radio", { name: "노래 클립" }));
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), { target: { value: "PL1234567890" } });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
    await screen.findByRole("button", { name: /수집 시작/ });
    expect(preflightMock).toHaveBeenCalledWith({ playlistUrl: "PL1234567890", mode: "all_new", candidateKind: "singing_clip" });
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    await screen.findByRole("button", { name: "검수 목록으로 이동" });
    expect(createImportMock).toHaveBeenCalledWith(expect.objectContaining({ playlistUrl: "PL1234567890", candidateKind: "singing_clip", idempotencyKey: expect.any(String) }));
  });

  it("keeps the import form above history and preserves input while collapsed", () => {
    render(createElement(IngestionSection, {}), { wrapper: createQueryWrapper() });
    const input = screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "PLdraft123" } });
    const panel = document.getElementById("playlist-import")!;
    expect(panel.compareDocumentPosition(screen.getByText("가져오기 이력")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "가져오기 숨기기" }));
    expect(document.getElementById("playlist-import-form")!.hidden).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "가져오기 펼치기" }));
    expect(input.value).toBe("PLdraft123");
  });

  it("confirms history deletion and retains the dialog on failure", async () => {
    jobsHookMock.mockReturnValue({ data: [jobHookMock("job-1").data], isLoading: false });
    deleteHistoryMock.mockRejectedValueOnce(new Error("busy"));
    render(createElement(IngestionSection, {}), { wrapper: createQueryWrapper() });
    fireEvent.keyDown(screen.getByRole("button", { name: "이력 삭제 메뉴" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "이력 삭제" }));
    expect(deleteHistoryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(deleteHistoryMock).toHaveBeenCalledWith("job-1"));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error" })));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    deleteHistoryMock.mockResolvedValueOnce({ deleted: true });
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("renders an ingestion query failure instead of an empty history and retries", () => {
    const refetch = vi.fn(async () => undefined);
    jobsHookMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
    });

    render(
      createElement(IngestionSection, {}),
      { wrapper: createQueryWrapper() },
    );

    expect(screen.getByText("가져오기 이력을 불러오지 못했습니다. 저장된 작업이 없는 것으로 간주하지 않습니다.")).toBeTruthy();
    expect(screen.queryByText("저장된 가져오기 작업이 없습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps previously imported playlists visible and reopens their collection status", async () => {
    jobsHookMock.mockReturnValue({
      isLoading: false,
      data: [{
        id: "saved-job",
        playlistTitle: "Previously Imported Playlist",
        playlistOwnerChannelTitle: "Saved Channel",
        status: "completed",
        createdAt: 100,
        counts: { discovered: 23 },
      }],
    });
    render(
      createElement(IngestionSection, {}),
      { wrapper: createQueryWrapper() },
    );

    expect(await screen.findByText("Previously Imported Playlist")).toBeTruthy();
    await waitFor(() => expect(jobHookMock).toHaveBeenCalledWith("saved-job", true, false));
  });

  it("shows only the controls required by the selected import mode", () => {
    render(
      createElement(IngestionSection, {}),
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
      createElement(IngestionSection, {}),
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

  it("reports failed-message retry errors and releases the busy state", async () => {
    jobHookMock.mockImplementation((jobId: string | null) => ({
      data: jobId
        ? {
            id: "job-1",
            playlistTitle: "Official Covers",
            status: "partial",
            counts: { discovered: 1, metadataChecked: 1, eligible: 1 },
            lastErrorCode: "youtube_failed",
          }
        : undefined,
    }));
    retryMock.mockRejectedValueOnce(new Error("network failed"));
    render(
      createElement(IngestionSection, {}),
      { wrapper: createQueryWrapper() },
    );
    fireEvent.change(screen.getByLabelText("YouTube 플레이리스트 URL 또는 ID"), {
      target: { value: "PL1234567890" },
    });
    fireEvent.click(screen.getByRole("button", { name: "가져오기 전 확인" }));
    await screen.findByText("Official Covers");
    fireEvent.click(screen.getByRole("button", { name: /수집 시작/ }));
    const retryButton = await screen.findByRole("button", { name: "실패 항목 재시도" });

    fireEvent.click(retryButton);

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "error",
      description: "실패 항목을 재시도하지 못했습니다.",
    }));
    expect(retryButton.hasAttribute("disabled")).toBe(false);
  });
});
