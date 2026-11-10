import { createAdminCatalogFixture, createReviewItemFixture } from "../../test/catalog-fixtures";
// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { OtwPlayAdminCatalogDto, OtwPlayIngestionJobDto, OtwPlayReviewItemDto } from "@contracts/otw-play";
import { ReviewInbox } from "./review-inbox";
import { ApiError } from "@/shared/api/client";
import { ConsoleSearchContext } from "@/shared/lib/admin-console-search";
const fetchReview = vi.hoisted(() => vi.fn());
const convert = vi.hoisted(() => vi.fn());
const convertJob = vi.hoisted(() => vi.fn());
const updateCandidate = vi.hoisted(() => vi.fn());
const deleteReviewItem = vi.hoisted(() => vi.fn());
const confirm = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());
const getAiBatchDraft = vi.hoisted(() => vi.fn());
vi.mock("../../api/ai-batch", () => ({ getAiBatchDraft }));
const scrollIntoView = vi.hoisted(() => vi.fn());
vi.mock("../../api/admin", () => ({ fetchOtwPlayIngestionBudget: vi.fn(async () => ({ status: "available" })), fetchOtwPlayReviewItems: fetchReview, convertOtwPlayImportCandidate: convert, convertOtwPlayImportCandidates: convertJob, updateOtwPlayImportCandidate: updateCandidate, deleteOtwPlayReviewItem: deleteReviewItem }));
vi.mock("@/features/members", () => ({ fetchActiveMembers: vi.fn(async () => []) }));
vi.mock("@/shared/ui/toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("@/shared/lib/confirmation", () => ({ useConfirmation: () => confirm }));
const row = (id: string, status = "ready"): OtwPlayReviewItemDto => createReviewItemFixture({ id, kind: "candidate", candidateKind: "singing_clip", sources: ["playlist", "automatic"], title: id, version: 4, status, createdAt: 1 });
const catalog = createAdminCatalogFixture({ revision: 1, readModelRevision: 1 });
const clipJob = { id: "job-a", candidateKind: "singing_clip", status: "completed", aiBatchId: "ai-job-a" } as OtwPlayIngestionJobDto;
const officialJob = { ...clipJob, candidateKind: "official_video" } as const;
beforeEach(() => {
  vi.clearAllMocks();
  confirm.mockResolvedValue(true);
  deleteReviewItem.mockReset();
  getAiBatchDraft.mockResolvedValue({ data: null });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
  fetchReview.mockResolvedValue({ items: [row("clip-a"), row("clip-b"), row("clip-c", "needs_input")], nextCursor: null });
});
afterEach(cleanup);
it("requires final confirmation and only converts selected videos in the open playlist", async () => {
  confirm.mockResolvedValueOnce(false);
  convertJob.mockResolvedValue({ results: [{ candidateId: "clip-a", outcome: "created", performanceId: "p-a" }] });
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("checkbox", { name: "clip-a 선택" }));
  const add = screen.getByRole("button", { name: "선택 항목 카탈로그 추가 (1개)" });
  fireEvent.click(add);
  await waitFor(() => expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: "카탈로그 추가" })));
  expect(convertJob).not.toHaveBeenCalled();
  fireEvent.click(add);
  await waitFor(() => expect(convertJob).toHaveBeenCalledExactlyOnceWith("job-a", { candidates: [{ id: "clip-a", expectedVersion: 4 }] }));
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-a", source: "playlist", status: "all" }));
  expect(screen.queryByRole("combobox", { name: "검수 출처" })).toBeNull();
});

it("does not allow a reused ready candidate to be registered during collection", async () => {
  render(<ReviewInbox playlistJob={{ ...clipJob, status: "collecting", aiBatchId: undefined }} catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  expect(await screen.findByRole("checkbox", { name: "clip-a 선택" })).toHaveProperty("disabled", true);
  expect(screen.queryByRole("button", { name: /선택 항목 카탈로그 추가|검수 열기/ })).toBeNull();
});

it("replays a registration with the same version when the first response is lost", async () => {
  convertJob.mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce({ results: [{ outcome: "created", performanceId: "performance" }] });
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("checkbox", { name: "clip-a 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택 항목 카탈로그 추가 (1개)" }));
  const summary = await screen.findByRole("status", { name: "일괄 임시 등록 결과" });
  expect(summary.textContent).toContain("완료 1개");
  expect(summary.textContent).toContain("실패 0개");
  expect(convertJob.mock.calls).toEqual(Array.from({ length: 2 }, () => ["job-a", { candidates: [{ id: "clip-a", expectedVersion: 4 }] }]));
});

it("shows proposal processing status and keeps deletion for processed proposals", async () => {
  const proposal = { ...row("proposal"), kind: "proposal" as const, candidate: null, status: "pending_review", sources: ["user" as const] };
  const onProposal = vi.fn();
  fetchReview.mockImplementation(async ({ status }) => ({
    items: [status === "completed" ? { ...proposal, status: "rejected" } : proposal], nextCursor: null,
  }));
  deleteReviewItem.mockResolvedValue(undefined);
  render(<ReviewInbox catalog={null} onProposal={onProposal} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "검수 열기" }));
  expect(onProposal).toHaveBeenCalledWith("proposal");
  expect(screen.queryByRole("button", { name: "proposal 삭제" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "처리 완료" }));
  expect(await screen.findByText("거절됨")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "proposal 삭제" }));
  await waitFor(() => expect(deleteReviewItem).toHaveBeenCalledWith("proposal", { kind: "proposal", expectedVersion: 4 }));
});
it("summarizes successful draft registrations once instead of repeating row messages", async () => {
  convertJob.mockResolvedValue({ results: [{ outcome: "created", performanceId: "performance" }] });
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "등록 가능 2개 일괄 선택" }));
  fireEvent.click(screen.getByRole("button", { name: "선택 항목 카탈로그 추가 (2개)" }));
  await waitFor(() => expect(convertJob).toHaveBeenCalledTimes(2));
  const summary = screen.getByRole("status", { name: "일괄 임시 등록 결과" });
  expect(summary.textContent).toContain("완료 2개");
  expect(summary.textContent).toContain("실패 0개");
  expect(screen.queryByText("임시 등록 완료")).toBeNull();
});
it("toggles every loaded eligible candidate without selecting blocked rows", async () => {
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "등록 가능 2개 일괄 선택" }));
  expect(screen.getByRole("button", { name: "선택 항목 카탈로그 추가 (2개)" })).toHaveProperty("disabled", false);
  fireEvent.click(screen.getByRole("button", { name: "일괄 선택 해제 (2개)" }));
  expect(screen.getByRole("button", { name: "선택 항목 카탈로그 추가 (0개)" })).toHaveProperty("disabled", true);
  expect(screen.queryByRole("checkbox", { name: "clip-c 선택" })).toBeNull();
});
it("keeps review discovery available when catalog editing cannot load", async () => {
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={null} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText("clip-a")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "검수 열기" }).every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
});

const reviewRow = (id: string): OtwPlayReviewItemDto => ({
  ...row(id, "needs_input"), channelId: "UCapproved", candidateKind: "official_video",
  candidate: {
    candidateId: id, candidateVersion: 4, videoId: "BBBBBBBBBBB", title: id,
    channelTitle: "승인 채널", thumbnailUrl: null, durationSeconds: 180,
    publishedAt: 100, availabilityStatus: "playable", status: "needs_input",
    classification: "eligible", exclusionReason: null, catalogChannelId: "channel-1",
    reviewInput: {
      song: { kind: "existing", songId: "song-1" },
      participants: [{ subject: { kind: "entity", entityId: "singer-1" }, participantRole: "vocal", creditOrder: 0, creditNameSnapshot: "Singer" }],
      relationType: "cover", releaseType: "official_video", participationType: "solo",
      startSeconds: 0, endSeconds: 150, internalNote: null,
    },
    linkedPerformanceId: null, discoveredAt: 100, monitorGeneration: 0, retentionExpiresAt: 9999999999999,
  },
});
const reviewCatalog = {
  ...catalog, songs: [{ id: "song-1", title: "Existing Song", archivedAt: null }],
  entities: [{ id: "singer-1", displayName: "Singer", entityKind: "person", memberUid: null }],
} as unknown as OtwPlayAdminCatalogDto;

it("shows the stored AI draft without single-video launch or range controls", async () => {
  const entry = reviewRow("clip-a");
  fetchReview.mockResolvedValue({ items: [entry], nextCursor: null });
  getAiBatchDraft.mockResolvedValue({ data: {
    itemId: "saved-draft", candidateVersion: entry.version, candidateKind: entry.candidateKind,
    autoApply: false, result: { songs: [], warnings: [], videoAnalyzed: true },
  } });
  render(<ReviewInbox playlistJob={officialJob} canReview catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "검수 열기" }));
  expect(await screen.findByText(/AI 초안이 저장되어 있습니다/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "AI로 자동 채우기" })).toBeNull();
  expect(screen.queryByRole("button", { name: "재분석" })).toBeNull();
  expect(screen.queryByLabelText("지정 구간만 분석")).toBeNull();
});

it("opens a full review page and preserves per-candidate input and filters when returning to the list", async () => {
  fetchReview.mockResolvedValue({ items: [reviewRow("clip-a"), reviewRow("clip-b")], nextCursor: null });
  const manageChannel = vi.fn();
  render(<ReviewInbox playlistJob={officialJob} canReview catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={manageChannel} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  await screen.findByText("clip-a");
  const openFirst = (await screen.findAllByRole("button", { name: "검수 열기" }))[0];
  fireEvent.click(openFirst);
  let page = screen.getByRole("region", { name: "공식 영상 검수 화면" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("region", { name: "플레이리스트 영상 목록" })).toBeNull();
  expect(within(page).getByTitle("검수 영상 · clip-a")).toBeTruthy();
  fireEvent.change(within(page).getByLabelText("시작 위치(초)"), { target: { value: "42" } });
  fireEvent.click(within(page).getByRole("button", { name: "채널 승인·수집 설정" }));
  expect(manageChannel).toHaveBeenCalledWith("UCapproved", "official_video");
  fireEvent.click(within(page).getByRole("button", { name: "검수 목록으로" }));
  expect(openFirst).toBe(document.activeElement);
  expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" });
  fireEvent.click(screen.getAllByRole("button", { name: "검수 열기" })[1]);
  page = screen.getByRole("region", { name: "공식 영상 검수 화면" });
  expect(within(page).getByLabelText("시작 위치(초)")).toHaveProperty("value", "0");
  fireEvent.click(within(page).getByRole("button", { name: "검수 목록으로" }));
  fireEvent.click(openFirst);
  page = screen.getByRole("region", { name: "공식 영상 검수 화면" });
  expect(within(page).getByLabelText("시작 위치(초)")).toHaveProperty("value", "42");
});

it("retains failed review input, then saves to ready and returns to the same list", async () => {
  const entry = reviewRow("clip-a");
  fetchReview.mockResolvedValue({ items: [entry], nextCursor: null });
  updateCandidate.mockRejectedValueOnce(new ApiError("일시적으로 저장하지 못했습니다.",503,{code:"PLAY_ADMIN_UNAVAILABLE"})).mockResolvedValueOnce({ version: 5, status: "ready", reviewInput: entry.candidate!.reviewInput });
  render(<ReviewInbox playlistJob={officialJob} canReview catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "검수 열기" }));
  fireEvent.change(screen.getByLabelText("시작 위치(초)"), { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }));
  expect(await screen.findByText(/저장 실패 · 입력값/)).toBeTruthy();
  expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "25");
  fireEvent.click(screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }));
  await screen.findByRole("region", { name: "플레이리스트 영상 목록" });
  expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });
  expect(updateCandidate).toHaveBeenLastCalledWith("clip-a", expect.objectContaining({ expectedVersion: 4, input: expect.objectContaining({ startSeconds: 25, releaseType: "official_video" }) }));
  expect(convert).not.toHaveBeenCalled();
});

it("restores a review URL by finding the selected candidate on the next page", async () => {
  fetchReview.mockImplementation(async ({ cursor }) => cursor
    ? { items: [reviewRow("clip-b")], nextCursor: null }
    : { items: [reviewRow("clip-a")], nextCursor: "next" });
  render(<ConsoleSearchContext.Provider value={[{ view: "review", selected: "clip-b", source: "playlist" }, vi.fn()]}>
    <ReviewInbox playlistJob={officialJob} canReview catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />
  </ConsoleSearchContext.Provider>, { wrapper: createQueryWrapper() });
  expect(await screen.findByTitle("검수 영상 · clip-b")).toBeTruthy();
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next", source: "playlist" }));
});

it("keeps overlapping proposals reachable without offering duplicate draft conversion", async () => {
  const proposal = { ...row("clip-with-proposal"), pendingProposalId: "proposal-1", sources: ["playlist", "user"] };
  fetchReview.mockResolvedValue({ items: [proposal], nextCursor: null });
  const onProposal = vi.fn();
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={onProposal} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "연결된 제안 검수" }));
  expect(onProposal).toHaveBeenCalledWith("proposal-1", "clip-with-proposal");
  expect(screen.getByRole("checkbox", { name: "clip-with-proposal 선택" })).toHaveProperty("disabled", true);
  expect(within(screen.getByRole("article")).getByText("노래 클립")).toBeTruthy();
});

const observeReviewBottom = () => {
  const callbacks: Array<() => void> = [];
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) {
      callbacks.push(() => callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  return callbacks;
};
afterEach(() => vi.unstubAllGlobals());

it("loads the next cursor at the list bottom only once and retains earlier rows", async () => {
  const callbacks = observeReviewBottom();
  let resolveNext!: (value: unknown) => void;
  fetchReview.mockImplementation(({ cursor, candidateKind }) => candidateKind ? Promise.resolve({ items: [], nextCursor: null }) : cursor
    ? new Promise(resolve => { resolveNext = resolve; })
    : Promise.resolve({ items: [row("first")], nextCursor: "next" }));
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  await screen.findByText("first");
  await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
  const enter = callbacks.at(-1)!;
  act(() => { enter(); enter(); });
  await waitFor(() => expect(fetchReview.mock.calls.filter(([filters]) => filters.cursor === "next")).toHaveLength(1));
  await act(async () => resolveNext({ items: [row("second")], nextCursor: null }));
  expect(await screen.findByText("second")).toBeTruthy();
  expect(screen.getByText("first")).toBeTruthy();
  expect(screen.getByText("모든 검수 항목을 불러왔습니다.")).toBeTruthy();
});

it("stops automatic retries after a next-page failure and retries the same cursor explicitly", async () => {
  const callbacks = observeReviewBottom();
  let failed = false;
  fetchReview.mockImplementation(async ({ cursor, candidateKind }) => {
    if (candidateKind) return { items: [], nextCursor: null };
    if (!cursor) return { items: [row("first")], nextCursor: "next" };
    if (!failed) { failed = true; throw new Error("offline"); }
    return { items: [row("second")], nextCursor: null };
  });
  render(<ReviewInbox playlistJob={clipJob} canReview catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  await screen.findByText("first");
  await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
  act(() => callbacks.at(-1)!());
  const retry = await screen.findByRole("button", { name: "다음 항목 다시 시도" });
  expect(screen.getByText("first")).toBeTruthy();
  act(() => callbacks.forEach(callback => callback()));
  expect(fetchReview.mock.calls.filter(([filters]) => filters.cursor === "next")).toHaveLength(1);
  fireEvent.click(retry);
  expect(await screen.findByText("second")).toBeTruthy();
  expect(fetchReview.mock.calls.filter(([filters]) => filters.cursor === "next")).toHaveLength(2);
});

it("disconnects automatic pagination when the review inbox becomes inactive", async () => {
  const callbacks = observeReviewBottom();
  fetchReview.mockImplementation(async ({ candidateKind }) => ({ items: candidateKind ? [] : [row("first")], nextCursor: candidateKind ? null : "next" }));
  const props = { playlistJob: clipJob, canReview: true, catalog, onProposal: vi.fn(), onManageChannel: vi.fn(), onOpenCatalog: vi.fn() };
  const view = render(<ReviewInbox {...props} />, { wrapper: createQueryWrapper() });
  await screen.findByText("first");
  await waitFor(() => expect(callbacks.length).toBeGreaterThan(0));
  view.rerender(<ReviewInbox {...props} active={false} />);
  act(() => callbacks.forEach(callback => callback()));
  expect(fetchReview.mock.calls.some(([filters]) => filters.cursor)).toBe(false);
});
