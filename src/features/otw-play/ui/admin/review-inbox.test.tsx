import { createAdminCatalogFixture, createReviewItemFixture } from "../../test/catalog-fixtures";
// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import type { OtwPlayAdminCatalogDto, OtwPlayReviewItemDto } from "@contracts/otw-play";
import { ReviewInbox } from "./review-inbox";
import { ConsoleSearchContext } from "@/shared/lib/admin-console-search";
const fetchReview = vi.hoisted(() => vi.fn());
const convert = vi.hoisted(() => vi.fn());
const updateCandidate = vi.hoisted(() => vi.fn());
const jobs = vi.hoisted(() => vi.fn());
vi.mock("../../queries/use-admin-catalog", () => ({ useOtwPlayImportJobs: jobs }));
vi.mock("../../api/admin", () => ({ fetchOtwPlayReviewItems: fetchReview, convertOtwPlayImportCandidate: convert, updateOtwPlayImportCandidate: updateCandidate }));
vi.mock("@/features/members", () => ({ fetchActiveMembers: vi.fn(async () => []) }));
vi.mock("@/shared/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/shared/lib/confirmation", () => ({ useConfirmation: () => vi.fn(async () => true) }));
const row = (id: string, status = "ready"): OtwPlayReviewItemDto => createReviewItemFixture({ id, kind: "candidate", candidateKind: "singing_clip", sources: ["playlist", "automatic"], title: id, version: 4, status, createdAt: 1 });
const catalog = createAdminCatalogFixture({ revision: 1, readModelRevision: 1 });
beforeEach(() => {
  vi.clearAllMocks();
  jobs.mockReturnValue({ data: [{ id: "job-a", playlistTitle: "첫 번째 가져오기", createdAt: 1, candidateKind: "singing_clip" }, { id: "job-b", playlistTitle: "두 번째 가져오기", createdAt: 2, candidateKind: "official_video" }], isLoading: false });
  fetchReview.mockResolvedValue({ items: [row("clip-a"), row("clip-b"), row("clip-c", "needs_input")], nextCursor: null });
});
afterEach(cleanup);
it("only converts selected ready candidates and retains failed selections for retry", async () => {
  convert.mockResolvedValueOnce({ outcome: "created", performanceId: "p-a" }).mockResolvedValueOnce({ outcome: "stale", errorCode: "stale_write" });
  render(<ReviewInbox catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("checkbox", { name: "clip-a 선택" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "clip-b 선택" }));
  expect(screen.getByRole("checkbox", { name: "clip-c 선택" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "선택 2개 일괄 임시 등록" }));
  await waitFor(() => expect(convert).toHaveBeenCalledTimes(2));
  expect(convert).toHaveBeenCalledWith("clip-a", { expectedVersion: 4 });
  expect(await screen.findByText("등록 실패: stale_write")).toBeTruthy();
  expect(screen.getByRole("button", { name: "선택 1개 일괄 임시 등록" })).toBeTruthy();
});
it("keeps review discovery available when catalog editing cannot load", async () => {
  render(<ReviewInbox catalog={null} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  expect(await screen.findByText("clip-a")).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "검수 열기" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
});

it("scopes playlist rows and bulk selections to the chosen import history", async () => {
  fetchReview.mockImplementation(async ({ jobId }) => ({ items: [row(jobId === "job-b" ? "clip-b" : "clip-a")], nextCursor: null }));
  render(<ReviewInbox catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("checkbox", { name: "clip-a 선택" }));
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ source: "playlist", jobId: "job-a" }));
  fireEvent.change(screen.getByLabelText("검수 가져오기 이력"), { target: { value: "job-b" } });
  await screen.findByText("clip-b");
  expect(screen.queryByText("clip-a")).toBeNull();
  expect(screen.getByRole("button", { name: "선택 0개 일괄 임시 등록" })).toHaveProperty("disabled", true);
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-b", cursor: undefined }));
  fireEvent.change(screen.getByLabelText("검수 출처"), { target: { value: "automatic" } });
  await waitFor(() => expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ source: "automatic", jobId: undefined })));
});

it("does not load mixed playlist candidates when there is no import history", async () => {
  jobs.mockReturnValue({ data: [], isLoading: false });
  render(<ReviewInbox catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  expect(screen.getByText(/가져오기 이력이 없습니다/)).toBeTruthy();
  expect(fetchReview).not.toHaveBeenCalled();
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

it("opens a full review page and preserves per-candidate input and filters when returning to the list", async () => {
  fetchReview.mockResolvedValue({ items: [reviewRow("clip-a"), reviewRow("clip-b")], nextCursor: null });
  const manageChannel = vi.fn();
  render(<ReviewInbox catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={manageChannel} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  await screen.findByText("clip-a");
  fireEvent.change(screen.getByLabelText("검수 출처"), { target: { value: "playlist" } });
  const openFirst = (await screen.findAllByRole("button", { name: "검수 열기" }))[0];
  fireEvent.click(openFirst);
  let page = screen.getByRole("region", { name: "공식 영상 검수 화면" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByRole("region", { name: "통합 검수 목록" })).toBeNull();
  expect(within(page).getByTitle("검수 영상 · clip-a")).toBeTruthy();
  fireEvent.change(within(page).getByLabelText("시작 위치(초)"), { target: { value: "42" } });
  fireEvent.click(within(page).getByRole("button", { name: "채널 승인·수집 설정" }));
  expect(manageChannel).toHaveBeenCalledWith("UCapproved", "official_video");
  fireEvent.click(within(page).getByRole("button", { name: "검수 목록으로" }));
  expect(openFirst).toBe(document.activeElement);
  expect(screen.getByLabelText("검수 출처")).toHaveProperty("value", "playlist");
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
  updateCandidate.mockRejectedValueOnce(new Error("conflict")).mockResolvedValueOnce({ version: 5, status: "ready", reviewInput: entry.candidate!.reviewInput });
  render(<ReviewInbox catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "검수 열기" }));
  fireEvent.change(screen.getByLabelText("시작 위치(초)"), { target: { value: "25" } });
  fireEvent.click(screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }));
  expect(await screen.findByText(/저장 실패 · 입력값/)).toBeTruthy();
  expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "25");
  fireEvent.click(screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }));
  await screen.findByRole("region", { name: "통합 검수 목록" });
  expect(updateCandidate).toHaveBeenLastCalledWith("clip-a", expect.objectContaining({ expectedVersion: 4, input: expect.objectContaining({ startSeconds: 25, releaseType: "official_video" }) }));
  expect(convert).not.toHaveBeenCalled();
});

it("restores a review URL by finding the selected candidate on the next page", async () => {
  fetchReview.mockImplementation(async ({ cursor }) => cursor
    ? { items: [reviewRow("clip-b")], nextCursor: null }
    : { items: [reviewRow("clip-a")], nextCursor: "next" });
  render(<ConsoleSearchContext.Provider value={[{ view: "review", selected: "clip-b", source: "playlist" }, vi.fn()]}>
    <ReviewInbox catalog={reviewCatalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />
  </ConsoleSearchContext.Provider>, { wrapper: createQueryWrapper() });
  expect(await screen.findByTitle("검수 영상 · clip-b")).toBeTruthy();
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ cursor: "next", source: "playlist" }));
});


it("corrects every conflicting page within one import and keeps failed rows retryable", async () => {
  const legacy = (id: string) => ({ ...row(id, "needs_input"), candidateKind: "official_video" as const });
  let corrected = false;
  fetchReview.mockImplementation(async ({ candidateKind, cursor }) => {
    if (candidateKind === "official_video") return { items: cursor ? [legacy("legacy-b")] : corrected ? [] : [legacy("legacy-a")], nextCursor: !cursor && !corrected ? "conflict-page-2" : null };
    return { items: [legacy("legacy-a"), legacy("legacy-b")], nextCursor: null };
  });
  updateCandidate.mockImplementation(async (id) => { if (id === "legacy-b") throw new Error("stale_write"); corrected = true; return {}; });
  render(<ReviewInbox catalog={catalog} onProposal={vi.fn()} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  const button = await screen.findByRole("button", { name: "가져오기 종류로 일괄 정정" });
  expect(screen.getByText(/기존 후보 2개의 이전 분류/)).toBeTruthy();
  fireEvent.click(button);
  await waitFor(() => expect(updateCandidate).toHaveBeenCalledTimes(2));
  expect(updateCandidate).toHaveBeenCalledWith("legacy-a", { action: "change_kind", expectedVersion: 4, candidateKind: "singing_clip" });
  expect(updateCandidate).toHaveBeenCalledWith("legacy-b", { action: "change_kind", expectedVersion: 4, candidateKind: "singing_clip" });
  expect(await screen.findByText(/종류 정정 실패/)).toBeTruthy();
  expect(fetchReview).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job-a", candidateKind: "official_video", cursor: "conflict-page-2" }));
});

it("keeps overlapping proposals reachable without offering duplicate draft conversion", async () => {
  const proposal = { ...row("clip-with-proposal"), pendingProposalId: "proposal-1", sources: ["playlist", "user"] };
  fetchReview.mockResolvedValue({ items: [proposal], nextCursor: null });
  const onProposal = vi.fn();
  render(<ReviewInbox catalog={catalog} onProposal={onProposal} onManageChannel={vi.fn()} onOpenCatalog={vi.fn()} />, { wrapper: createQueryWrapper() });
  fireEvent.click(await screen.findByRole("button", { name: "연결된 제안 검수" }));
  expect(onProposal).toHaveBeenCalledWith("proposal-1");
  expect(screen.getByRole("checkbox", { name: "clip-with-proposal 선택" })).toHaveProperty("disabled", true);
  expect(within(screen.getByRole("article")).getByText("노래 클립")).toBeTruthy();
});
