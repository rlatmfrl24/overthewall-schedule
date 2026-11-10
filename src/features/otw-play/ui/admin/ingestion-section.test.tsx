// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { ConsoleSearchContext } from "@/shared/lib/admin-console-search";
import { IngestionSection } from "./ingestion-section";

const mocks = vi.hoisted(() => ({
  jobs: vi.fn(), job: vi.fn(), budget: vi.fn(), preflight: vi.fn(), create: vi.fn(),
  batch: vi.fn(), start: vi.fn(), retry: vi.fn(), retryCollection: vi.fn(),
}));
vi.mock("../../api/admin", () => ({
  fetchOtwPlayIngestionBudget: mocks.budget,
  preflightOtwPlayPlaylistImport: mocks.preflight,
  createOtwPlayPlaylistImport: mocks.create,
  resumeOtwPlayImportJob: vi.fn(),
  retryOtwPlayImportJob: mocks.retryCollection,
}));
vi.mock("../../api/ai-batch", () => ({ getAiBatch: mocks.batch, startAiBatch: mocks.start, retryAiBatch: mocks.retry }));
vi.mock("../../queries/use-admin-catalog", () => ({ useOtwPlayImportJob: mocks.job, useOtwPlayImportJobs: mocks.jobs }));
vi.mock("./review-inbox", () => ({
  ReviewInbox: ({ canReview }: { canReview: boolean }) => <p>{canReview ? "관리자 검수 가능" : "관리자 검수 대기"}</p>,
}));

const url = "https://www.youtube.com/playlist?list=PL1234567890";
const job = {
  id: "job-1", playlistId: "PL1234567890", playlistTitle: "Official Covers", candidateKind: "official_video",
  requestedItemCount: 63, status: "completed", counts: { discovered: 63, retryPending: 0 }, createdAt: 1, aiExecutionAvailable: true,
};
const ready = {
  playlistId: job.playlistId, canonicalUrl: url, title: job.playlistTitle,
  itemCount: 63, requiresSplit: false,
};
const analysis = {
  id: "batch", total: 63, budgetWaiting: 1,
  counts: { queued: 0, analyzing: 1, saving: 0, saved: 61, needs_selection: 0, failed: 1, changed: 0 },
};

beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  mocks.jobs.mockReturnValue({ data: { pages: [{ data: [] }] }, isSuccess: true });
  mocks.job.mockImplementation((id: string | null) => ({ data: id ? job : undefined, refetch: vi.fn() }));
  mocks.budget.mockResolvedValue({ status: "available" });
  mocks.preflight.mockResolvedValue(ready);
  mocks.create.mockResolvedValue(job);
  mocks.start.mockResolvedValue({ data: analysis });
  mocks.batch.mockResolvedValue({ data: { batch: analysis } });
});
afterEach(cleanup);

function checkLink() {
  fireEvent.change(screen.getByRole("textbox", { name: "YouTube 플레이리스트 링크" }), { target: { value: url } });
  fireEvent.click(screen.getByRole("button", { name: "링크 확인" }));
}
function openJob() {
  return render(<ConsoleSearchContext.Provider value={[{ category: job.id }, vi.fn()]}><IngestionSection /></ConsoleSearchContext.Provider>, { wrapper: createQueryWrapper() });
}

it("checks the full playlist before creating one job and does not start AI automatically", async () => {
  render(<IngestionSection />, { wrapper: createQueryWrapper() });
  checkLink();
  const start = await screen.findByRole("button", { name: "가져오기 시작" });
  expect(screen.getByText("Official Covers · 63개")).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
  fireEvent.click(start);
  const startAi = await screen.findByRole("button", { name: "AI 일괄 검수 시작" });
  expect(mocks.create).toHaveBeenCalledWith({ playlistUrl: url, mode: "all_new", candidateKind: "official_video", idempotencyKey: expect.any(String) });
  expect(mocks.start).not.toHaveBeenCalled();
  fireEvent.click(startAi);
  await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({ importJobId: job.id }, expect.any(String)));
});

it("blocks a playlist beyond the collection cap before submission", async () => {
  mocks.preflight.mockResolvedValue({ ...ready, itemCount: 5001, requiresSplit: true });
  render(<IngestionSection />, { wrapper: createQueryWrapper() });
  checkLink();
  expect((await screen.findByRole("alert")).textContent).toContain("5,000개를 초과");
  expect(screen.getByRole("button", { name: "가져오기 시작" })).toHaveProperty("disabled", true);
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps a lost-response retry on the same import request", async () => {
  mocks.create.mockRejectedValueOnce(new Error("응답 연결 끊김"));
  render(<IngestionSection />, { wrapper: createQueryWrapper() });
  checkLink();
  fireEvent.click(await screen.findByRole("button", { name: "가져오기 시작" }));
  await screen.findByText("응답 연결 끊김");
  fireEvent.click(screen.getByRole("button", { name: "가져오기 시작" }));
  await screen.findByRole("button", { name: "AI 일괄 검수 시작" });
  expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
});

it("shows AI budget waiting and enables review after pending analysis ends", async () => {
  mocks.job.mockReturnValue({ data: { ...job, aiBatchId: analysis.id }, refetch: vi.fn() });
  const page = openJob();
  expect(await screen.findByText(/AI 예산 대기 1/)).toBeTruthy();
  expect(screen.getByText("관리자 검수 대기")).toBeTruthy();
  page.unmount();
  mocks.batch.mockResolvedValue({ data: { batch: { ...analysis, budgetWaiting: 0, counts: { ...analysis.counts, analyzing: 0, needs_selection: 1 } } } });
  openJob();
  expect(await screen.findByText("관리자 검수 가능")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "AI 실패 항목 재시도" }));
  await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith(analysis.id));
});

it("opens historical jobs from cards and distinguishes a list error from no imports", async () => {
  const fetchNextPage = vi.fn();
  mocks.jobs.mockReturnValue({ data: { pages: [{ data: [job] }] }, isSuccess: true, hasNextPage: true, fetchNextPage });
  const first = render(<IngestionSection />, { wrapper: createQueryWrapper() });
  fireEvent.click(screen.getByRole("button", { name: "이전 작업 더 보기" }));
  expect(fetchNextPage).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: /Official Covers/ }));
  expect(await screen.findByRole("heading", { name: "Official Covers" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "이력 삭제" })).toBeNull();
  first.unmount();
  const refetch = vi.fn();
  mocks.jobs.mockReturnValue({ isError: true, refetch });
  render(<IngestionSection />, { wrapper: createQueryWrapper() });
  expect(screen.queryByText(/아직 가져온/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(refetch).toHaveBeenCalledOnce();
});

it("allows direct review of a collected playlist without starting paid AI", () => {
  mocks.job.mockReturnValue({ data: { ...job, aiExecutionAvailable: false }, refetch: vi.fn() });
  openJob();
  expect(screen.getByText("AI 실행이 보류 중입니다. 수집된 영상은 직접 검수할 수 있습니다.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "AI 일괄 검수 시작" })).toBeNull();
  expect(screen.getByText("관리자 검수 가능")).toBeTruthy();
});

it("keeps collection retry available for a partial job with an existing AI batch", async () => {
  mocks.job.mockReturnValue({ data: { ...job, status: "partial", counts: { ...job.counts, permanentError: 1 }, aiBatchId: analysis.id }, refetch: vi.fn() });
  mocks.retryCollection.mockResolvedValue({ job: { ...job, status: "partial" }, enqueued: 0 });
  openJob();
  expect(screen.getByText("관리자 검수 대기")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "AI 일괄 검수 시작" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "수집 실패 항목 재시도" }));
  await waitFor(() => expect(mocks.retryCollection).toHaveBeenCalledWith(job.id));
  expect(await screen.findByText("지금 다시 수집할 수 있는 실패 항목이 없습니다.")).toBeTruthy();
});
