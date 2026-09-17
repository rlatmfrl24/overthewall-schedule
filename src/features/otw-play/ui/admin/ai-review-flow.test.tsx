// @vitest-environment jsdom
import { createElement } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { SingingClipReviewDialog } from "./singing-clip-review-dialog";
import { CatalogEntryDialog } from "./catalog-entry-dialog";
import type {
  OtwPlayAdminCatalogDto,
  OtwPlayChannelMonitorCandidateDto,
} from "@contracts/otw-play";
import type { AiReviewDto } from "@contracts/otw-play-ai-review";
const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  get: vi.fn(),
  latest: vi.fn(),
  save: vi.fn(),
  preflight: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../api/ai-review", () => ({
  startAiReview: mocks.start,
  getAiReview: mocks.get,
  latestAiReview: mocks.latest,
}));
vi.mock("../../api/admin", () => ({
  updateOtwPlayImportCandidate: mocks.save,
  convertOtwPlayImportCandidate: vi.fn(),
  preflightOtwPlayCatalogEntry: mocks.preflight,
  createOtwPlayCatalogEntry: mocks.create,
}));
vi.mock("@/features/members", () => ({ fetchActiveMembers: async () => [] }));
vi.mock("@/shared/ui/toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
const catalog = {
  revision: 1,
  readModelRevision: 1,
  songs: [],
  entities: [],
  channels: [],
  performances: [],
} as unknown as OtwPlayAdminCatalogDto;
const candidate = {
  candidateId: "youtube:BBBBBBBBBBB",
  candidateVersion: 1,
  videoId: "BBBBBBBBBBB",
  title: "[MV] Unclean title",
  channelTitle: "Uploader",
  publishedAt: null,
  durationSeconds: 180,
  availabilityStatus: "playable",
  status: "needs_input",
  classification: "eligible",
  catalogChannelId: "channel",
  reviewInput: null,
} as unknown as OtwPlayChannelMonitorCandidateDto;
const result = (clip: boolean): AiReviewDto => ({
  id: "analysis-1",
  videoId: candidate.videoId,
  candidateId: null,
  candidateKind: clip ? "singing_clip" : "official_video",
  range: null,
  status: "succeeded",
  model: "test",
  attempts: 1,
  errorCode: null,
  errorMessage: null,
  retryable: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  expiresAt: Date.now() + 86400000,
  nextRetryAt: null,
  usage: null,
  result: {
    videoAnalyzed: true,
    warnings: [],
    songs: [
      {
        values: {
          song: {
            title: "정리된 곡명",
            originalArtists: [
              {
                name: "원곡 가수",
                entityKind: "person",
                subject: {
                  kind: "new_external",
                  clientKey: "original",
                  displayName: "원곡 가수",
                  entityKind: "person",
                },
              },
            ],
            tags: [],
            existingSongId: null,
            candidates: [],
          },
          participants: [
            {
              name: "가창자",
              entityKind: "person",
              subject: {
                kind: "member",
                memberUid: 7,
              },
              role: "featured_vocal",
            },
          ],
          classification: {
            relationType: clip ? "singing_clip" : "original",
            releaseType: clip ? "broadcast" : "official_mv",
          },
          participationType: "solo",
          segment: { startSeconds: 12, endSeconds: 140 },
          ...(clip
            ? {
                broadcastDate: {
                  performedOn: "2026-09-01",
                  dateEvidence: "원본 방송 2026-09-01",
                },
                originalUrl: "https://www.youtube.com/watch?v=AAAAAAAAAAA",
                extent: "partial" as const,
              }
            : {}),
        },
        evidence: {
          song: [{ source: "description", text: "크레딧", seconds: null }],
          segment: [{ source: "video", text: "가창", seconds: 12 }],
        },
        warnings: [],
      },
    ],
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.latest.mockResolvedValue({ data: null });
  mocks.create.mockResolvedValue({ data: { createdEntities: [] } });
  mocks.save.mockImplementation(async (_id, { input }) => ({
    id: candidate.candidateId,
    version: 2,
    status: "ready",
    reviewInput: input,
  }));
});
afterEach(cleanup);
describe("AI suggestions through actual admin forms", () => {
  it.each([false, true])("starts a fresh registration after abandoning a suspended job (clip=%s)", async (clip) => {
    const props = { open: true, clip, onOpenChange: vi.fn(), refreshCatalog: vi.fn(async () => {}), catalog, preselectedSongId: null, onSaved: async () => {} };
    const view = render(createElement(CatalogEntryDialog, props), { wrapper: createQueryWrapper() });
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
    view.rerender(createElement(CatalogEntryDialog, { ...props, suspended: true }));
    view.rerender(createElement(CatalogEntryDialog, { ...props, open: false }));
    view.rerender(createElement(CatalogEntryDialog, props));
    expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "");
    expect(screen.getByLabelText("YouTube URL")).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/AAAAAAAAAAA" } });
    expect(screen.getByRole("button", { name: /영상 확인/ })).toHaveProperty("disabled", false);
    expect(props.refreshCatalog).not.toHaveBeenCalled();
    expect(mocks.preflight).not.toHaveBeenCalled();
  });
  it.each([
    ["pending", "approved_kirinuki", "승인 검토"],
    ["inactive", "approved_kirinuki", "영상 사용 설정"],
    ["revoked", "approved_kirinuki", "철회 상태 확인"],
    ["approved", "member_music", "채널 용도 확인"],
  ])("keeps the clip blocked for %s / %s and exposes %s", async (state, channelRole, action) => {
    mocks.preflight.mockResolvedValue({ catalogRevision: 1, duplicate: null, video: { videoId: candidate.videoId, title: candidate.title, channelId: "channel", channelTitle: "Uploader", durationSeconds: 180, thumbnailUrl: null, availabilityStatus: "playable" }, channel: { state, catalogChannelId: "channel", channelRole } });
    const manage = vi.fn();
    render(createElement(CatalogEntryDialog, { open: true, clip: true, onOpenChange: vi.fn(), onManageChannel: manage, catalog, preselectedSongId: null, onSaved: async () => {} }), { wrapper: createQueryWrapper() });
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
    fireEvent.click(await screen.findByRole("button", { name: action }));
    expect(manage).toHaveBeenCalledWith({ externalChannelId: "channel", displayName: "Uploader", kind: "singing_clip", role: "approved_kirinuki" });
    expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves AI application and undo across a suspended registration", async () => {
    const data = result(true);
    mocks.latest.mockResolvedValue({ data });
    mocks.get.mockResolvedValue({ data });
    mocks.preflight.mockResolvedValue({ catalogRevision: 1, duplicate: null, video: { videoId: candidate.videoId, title: candidate.title, channelId: "channel", channelTitle: "Uploader", durationSeconds: 180, thumbnailUrl: null, availabilityStatus: "playable" }, channel: { state: "approved", catalogChannelId: "channel", channelRole: "approved_kirinuki" } });
    const props = { open: true, clip: true, onOpenChange: vi.fn(), onManageChannel: vi.fn(), refreshCatalog: vi.fn(async () => {}), catalog, preselectedSongId: null, onSaved: async () => {} };
    const view = render(createElement(CatalogEntryDialog, props), { wrapper: createQueryWrapper() });
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
    fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
    fireEvent.click(await screen.findByRole("button", { name: "AI 제안 일괄 적용" }));
    expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "12");
    view.rerender(createElement(CatalogEntryDialog, { ...props, suspended: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(createElement(CatalogEntryDialog, props));
    await screen.findByText("채널 확인 완료 · 계속 입력하세요.");
    expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "12");
    fireEvent.click(screen.getByRole("button", { name: "AI 입력 되돌리기" }));
    expect(screen.getByRole("checkbox", { name: "구간 선택" }).getAttribute("data-state")).toBe("checked");
    view.rerender(createElement(CatalogEntryDialog, { ...props, suspended: true }));
    view.rerender(createElement(CatalogEntryDialog, props));
    await screen.findByText("채널 확인 완료 · 계속 입력하세요.");
    expect(screen.getByRole("checkbox", { name: "구간 선택" }).getAttribute("data-state")).toBe("checked");
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["candidate", "url"])("links a catalog match and saves the extent from the %s form", async (entry) => {
    const data = result(true);
    const song = data.result!.songs[0].values.song!;
    song.existingSongId = "catalog-song";
    song.candidates = [{ id: "catalog-song", title: "정리된 곡명 · 원곡 가수" }];
    const matchedCatalog: OtwPlayAdminCatalogDto = { ...catalog, songs: [{
      id: "catalog-song", slug: "catalog-song", title: "정리된 곡명", normalizedTitle: "정리된 곡명", isOtwOriginal: false,
      originalReleaseDate: null, originalReleasePrecision: "unknown", archivedAt: null, version: 1, tags: ["J-POP"], aliases: [],
      originalArtists: [{ entityId: "original", displayName: "원곡 가수", creditOrder: 0, isPrimary: true }],
    }] };
    mocks.start.mockResolvedValue({ data });
    mocks.get.mockResolvedValue({ data });
    if (entry === "candidate") {
      render(createElement(SingingClipReviewDialog, { candidate, candidateKind: "singing_clip", catalog: matchedCatalog, reviewOnly: true, onOpenChange: vi.fn(), onConverted: vi.fn(), onReviewStateChanged: async () => {} }), { wrapper: createQueryWrapper() });
    } else {
      mocks.preflight.mockResolvedValue({ catalogRevision: 1, duplicate: null, video: { videoId: candidate.videoId, title: candidate.title, channelId: "channel", channelTitle: "Uploader", durationSeconds: 180, thumbnailUrl: null, availabilityStatus: "playable" }, channel: { state: "approved", catalogChannelId: "channel", channelRole: "approved_kirinuki" } });
      render(createElement(CatalogEntryDialog, { open: true, clip: true, onOpenChange: vi.fn(), catalog: matchedCatalog, preselectedSongId: null, onSaved: async () => {} }), { wrapper: createQueryWrapper() });
      fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
      fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
      await screen.findByRole("button", { name: "AI로 자동 채우기" });
    }
    fireEvent.click(screen.getByRole("button", { name: "AI로 자동 채우기" }));
    await waitFor(() => expect(screen.getByLabelText("AI 카탈로그 대조 결과").textContent).toContain("폼에 연결했습니다"));
    if (entry === "candidate") {
      expect(screen.getByRole("combobox", { name: "가창 범위" }).textContent).toContain("일부 가창");
      fireEvent.click(screen.getByRole("button", { name: "OTW Play 게시 미리보기" }));
      expect(screen.getByLabelText("가창 및 공개 정보").textContent).toContain("가창일 2026-09-01");
      expect(screen.getByLabelText("가창 및 공개 정보").textContent).toContain("일부 가창");
      expect(screen.getByLabelText("가창 및 공개 정보").textContent).not.toContain("미확인");
      fireEvent.click(screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }));
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      expect(mocks.save.mock.calls[0][1].input).toMatchObject({ song: { kind: "existing", songId: "catalog-song" }, broadcast: { extent: "partial" } });
    } else {
      for (let step = 0; step < 3; step++) fireEvent.click(screen.getByRole("button", { name: /다음/ }));
      fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
      await waitFor(() => expect(mocks.create).toHaveBeenCalled());
      expect(mocks.create.mock.calls[0][0]).toMatchObject({ song: { kind: "existing", songId: "catalog-song" }, broadcast: { extent: "partial" } });
    }
  });
  it.each([false, true])(
    "bulk applies restored %s suggestions over manual input and can undo without another call",
    async (clip) => {
      const data = result(clip);
      mocks.latest.mockResolvedValue({ data });
      mocks.get.mockResolvedValue({ data });
      render(
        createElement(SingingClipReviewDialog, {
          candidate,
          candidateKind: clip ? "singing_clip" : "official_video",
          catalog,
          reviewOnly: true,
          onOpenChange: vi.fn(),
          onConverted: vi.fn(),
          onReviewStateChanged: async () => {},
        }),
        { wrapper: createQueryWrapper() },
      );
      await screen.findByRole("button", { name: "AI 제안 일괄 적용" });
      expect((screen.getByLabelText("곡명") as HTMLInputElement).value).toBe(
        candidate.title,
      );
      fireEvent.change(screen.getByLabelText("곡명"), {
        target: { value: "수동 수정 제목" },
      });
      fireEvent.click(
        screen.getByRole("button", { name: "AI 제안 일괄 적용" }),
      );
      expect((screen.getByLabelText("곡명") as HTMLInputElement).value).toBe(
        "정리된 곡명",
      );
      fireEvent.click(screen.getByRole("button", { name: "AI 입력 되돌리기" }));
      expect((screen.getByLabelText("곡명") as HTMLInputElement).value).toBe(
        "수동 수정 제목",
      );
      expect(mocks.start).not.toHaveBeenCalled();
      expect(mocks.save).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it.each([{ clip: false, segment: false }, { clip: true, segment: false }, { clip: false, segment: true }, { clip: true, segment: true }])(
    "fills and saves candidate clip=$clip with segment opt-in=$segment without publishing",
    async ({ clip, segment }) => {
      const data = result(clip);
      mocks.start.mockResolvedValue({ data });
      mocks.get.mockResolvedValue({ data });
      render(
        createElement(SingingClipReviewDialog, {
          candidate,
          candidateKind: clip ? "singing_clip" : "official_video",
          catalog,
          reviewOnly: true,
          onOpenChange: vi.fn(),
          onConverted: vi.fn(),
          onReviewStateChanged: async () => {},
        }),
        { wrapper: createQueryWrapper() },
      );
      if (segment) fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
      fireEvent.click(screen.getByRole("button", { name: "AI로 자동 채우기" }));
      await waitFor(() =>
        expect((screen.getByLabelText("곡명") as HTMLInputElement).value).toBe(
          "정리된 곡명",
        ),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "AI 제안 일괄 적용" }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: "검수 저장 · 등록 준비 완료" }),
      );
      await waitFor(() => expect(mocks.save).toHaveBeenCalled());
      const input = mocks.save.mock.calls[0][1].input;
      expect(input).toMatchObject({
        song: { kind: "create", title: "정리된 곡명" },
        releaseType: clip ? "broadcast" : "official_mv",
        participants: [{ subject: { kind: "member", memberUid: 7 }, participantRole: "featured_vocal" }],
        startSeconds: segment ? 12 : 0,
        endSeconds: segment ? 140 : null,
      });
      if (clip)
        expect(input.broadcast).toMatchObject({
          performedOn: "2026-09-01",
          extent: "partial",
        });
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it.each([{ clip: false, segment: false }, { clip: true, segment: false }, { clip: false, segment: true }, { clip: true, segment: true }])(
    "preserves AI song and role in URL registration clip=$clip with segment opt-in=$segment",
    async ({ clip, segment }) => {
      const data = result(clip);
      mocks.start.mockResolvedValue({ data });
      mocks.get.mockResolvedValue({ data });
      mocks.preflight.mockResolvedValue({
        catalogRevision: 1,
        duplicate: null,
        video: {
          videoId: candidate.videoId,
          title: candidate.title,
          channelId: "channel",
          channelTitle: "Uploader",
          durationSeconds: 180,
          thumbnailUrl: null,
          availabilityStatus: "playable",
        },
        channel: {
          state: "approved",
          catalogChannelId: "channel",
          channelRole: clip ? "approved_kirinuki" : "member_music",
        },
      });
      render(
        createElement(CatalogEntryDialog, {
          open: true,
          clip,
          onOpenChange: vi.fn(),
          catalog,
          preselectedSongId: null,
          onSaved: async () => {},
        }),
        { wrapper: createQueryWrapper() },
      );
      fireEvent.change(screen.getByLabelText("YouTube URL"), {
        target: { value: "https://www.youtube.com/watch?v=BBBBBBBBBBB" },
      });
      if (segment) fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
      fireEvent.click(screen.getByRole("button", { name: /영상 확인/ }));
      await screen.findByRole("button", { name: "AI로 자동 채우기" });
      fireEvent.click(screen.getByRole("button", { name: "AI로 자동 채우기" }));
      await screen.findByText("분석 완료");
      fireEvent.click(screen.getByRole("button", { name: /다음/ }));
      await waitFor(() =>
        expect(
          (screen.getByLabelText("원곡 제목") as HTMLInputElement).value,
        ).toBe("정리된 곡명"),
      );
      if (!clip) {
        fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
        expect(
          (screen.getByLabelText("원곡 제목") as HTMLInputElement).value,
        ).toBe("정리된 곡명");
      }
      fireEvent.click(screen.getByRole("button", { name: /다음/ }));
      fireEvent.click(screen.getByRole("button", { name: /다음/ }));
      fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
      await waitFor(() => expect(mocks.create).toHaveBeenCalled());
      expect(mocks.create.mock.calls[0][0]).toMatchObject({
        song: { kind: "create", title: "정리된 곡명" },
        participants: [{ subject: { kind: "member", memberUid: 7 }, participantRole: "featured_vocal" }],
        publicationTarget: "draft",
        releaseType: clip ? "broadcast" : "official_mv",
        startSeconds: segment ? 12 : 0,
        endSeconds: segment ? 140 : 180,
      });
    },
  );
});
