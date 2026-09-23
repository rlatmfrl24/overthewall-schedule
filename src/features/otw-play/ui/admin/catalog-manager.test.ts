import { createAdminCatalogFixture, createReviewItemFixture } from "../../test/catalog-fixtures";
const confirmationMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/shared/lib/confirmation", () => ({ useConfirmation: () => confirmationMock }));
// @vitest-environment jsdom
import { createElement, useState } from "react";
import { ConsoleSearchContext, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper, createTestQueryClient } from "@/test/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";

const fetchCatalogMock = vi.hoisted(() => vi.fn());
const reviewRowsMock = vi.hoisted(() => vi.fn());
const fetchProposalsMock = vi.hoisted(() => vi.fn());
const fetchSourceHealthMock = vi.hoisted(() => vi.fn());
const fetchObservabilityMock = vi.hoisted(() => vi.fn());
const fetchReleaseMock = vi.hoisted(() => vi.fn());
const fetchChannelMonitorsMock = vi.hoisted(() => vi.fn());
const updateReleaseMock = vi.hoisted(() => vi.fn());
const recheckSourceMock = vi.hoisted(() => vi.fn());
const updateEntityMock = vi.hoisted(() => vi.fn());
const deleteEntityMock = vi.hoisted(() => vi.fn());
const createChannelMock = vi.hoisted(() => vi.fn());
const lookupChannelMock = vi.hoisted(() => vi.fn());
const updateChannelMock = vi.hoisted(() => vi.fn());
const deleteChannelMock = vi.hoisted(() => vi.fn());
const updateSongMock = vi.hoisted(() => vi.fn());
const updatePerformanceMock = vi.hoisted(() => vi.fn());
const preflightEntryMock = vi.hoisted(() => vi.fn());
const createEntryMock = vi.hoisted(() => vi.fn());
const deleteSongMock = vi.hoisted(() => vi.fn());
const deletePerformanceMock = vi.hoisted(() => vi.fn());
const publishPerformanceMock = vi.hoisted(() => vi.fn());
const fetchMembersMock = vi.hoisted(() => vi.fn());
const rejectProposalMock = vi.hoisted(() => vi.fn());
const approveProposalMock = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/ai-review", () => ({
  latestAiReview: vi.fn(async () => ({ data: null })),
  getAiReview: vi.fn(),
  startAiReview: vi.fn(),
}));

vi.mock("../../api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/admin")>();
  return {
    ...actual,
    fetchOtwPlayReviewItems: reviewRowsMock,
    fetchOtwPlayImportJobs: async () => [],
    fetchOtwPlayImportJob: async () => null,
    fetchOtwPlayIngestionBudget: async () => ({ status: "available" }),
    fetchOtwPlayAdminCatalog: fetchCatalogMock,
    fetchOtwPlayAdminProposals: fetchProposalsMock,
    fetchOtwPlayAdminSourceHealth: fetchSourceHealthMock,
    fetchOtwPlayAdminObservability: fetchObservabilityMock,
    fetchOtwPlayAdminRelease: fetchReleaseMock,
    fetchOtwPlayChannelMonitors: fetchChannelMonitorsMock,
    updateOtwPlayAdminRelease: updateReleaseMock,
    recheckOtwPlaySource: recheckSourceMock,
    updateOtwPlayEntity: updateEntityMock,
    deleteOtwPlayEntity: deleteEntityMock,
    createOtwPlayChannel: createChannelMock,
    lookupOtwPlayChannel: lookupChannelMock,
    updateOtwPlayChannel: updateChannelMock,
    deleteOtwPlayChannel: deleteChannelMock,
    updateOtwPlaySong: updateSongMock,
    updateOtwPlayPerformance: updatePerformanceMock,
    preflightOtwPlayCatalogEntry: preflightEntryMock,
    createOtwPlayCatalogEntry: createEntryMock,
    deleteOtwPlaySong: deleteSongMock,
    deleteOtwPlayPerformance: deletePerformanceMock,
    publishOtwPlayPerformance: publishPerformanceMock,
    rejectOtwPlayProposal: rejectProposalMock,
    approveOtwPlayProposal: approveProposalMock,
  };
});

vi.mock("@/shared/ui/toast", () => ({
  useToast: () => ({ toast: toastMock }),
}));

vi.mock("@/features/members", () => ({
  fetchActiveMembers: fetchMembersMock,
}));

const catalog = createAdminCatalogFixture();

const selectOption = async (label: string, option: string | RegExp) => {
  fireEvent.click(await screen.findByRole("combobox", { name: label }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
};

const proposal = {
  id: "proposal-1",
  submittedByUserId: "member-1",
  submittedUrl: "https://youtu.be/dQw4w9WgXcQ",
  youtubeVideoId: "dQw4w9WgXcQ",
  segmentStartSeconds: 0,
  submittedTitle: "검수할 공식 커버",
  suggestedSongId: null,
  tags: ["J-POP"],
  submittedNote: "제출 메모",
  status: "pending_review" as const,
  version: 2,
  reviewedByUserId: null,
  reviewedAt: null,
  reviewResultCode: null,
  reviewNote: null,
  approvedPerformanceId: null,
  createdAt: 1_788_000_000_000,
  participants: [
    {
      creditOrder: 0,
      resolvedEntityId: null,
      submittedMemberUid: null,
      submittedNameSnapshot: "참여자",
      participantRole: "vocal" as const,
    },
  ],
  originalArtists: [
    {
      creditOrder: 0,
      resolvedEntityId: null,
      submittedMemberUid: null,
      submittedNameSnapshot: "원곡 가수",
    },
  ],
};

const openSecondaryAction = async (name: string, trigger?: HTMLElement) => {
  fireEvent.keyDown(trigger ?? await screen.findByRole("button", { name: `${name} 메뉴` }), { key: "Enter" });
  return screen.findByRole("menuitem", { name });
};

const renderCatalogManager = () =>
  render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });

const openVideoRegistration = async () => {
  renderCatalogManager();
  fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
  fireEvent.change(screen.getByLabelText("YouTube URL"), {
    target: { value: "https://youtu.be/dQw4w9WgXcQ" },
  });
  fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
};

describe("OtwPlayCatalogManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCatalogMock.mockReset();
    fetchProposalsMock.mockReset();
    createEntryMock.mockReset();
    preflightEntryMock.mockReset();
    confirmationMock.mockResolvedValue(true);
    reviewRowsMock.mockReset();
    reviewRowsMock.mockResolvedValue({ items: [createReviewItemFixture()], nextCursor: null });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    fetchCatalogMock.mockResolvedValue(catalog);
    fetchProposalsMock.mockResolvedValue([proposal]);
    fetchSourceHealthMock.mockReset();
    fetchObservabilityMock.mockReset();
    fetchReleaseMock.mockReset();
    fetchChannelMonitorsMock.mockReset();
    fetchChannelMonitorsMock.mockResolvedValue([]);
    updateReleaseMock.mockReset();
    recheckSourceMock.mockReset();
    createChannelMock.mockReset();
    lookupChannelMock.mockReset();
    updateChannelMock.mockReset();
    deleteChannelMock.mockReset();
    createChannelMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    lookupChannelMock.mockResolvedValue({
      externalChannelId: `UC${"F".repeat(22)}`,
      displayName: "정리된 공식 채널",
    });
    updateChannelMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    publishPerformanceMock.mockReset();
    publishPerformanceMock.mockResolvedValue({});
    fetchSourceHealthMock.mockResolvedValue({
      generatedAt: 1_777_000_000_000,
      recentRecoveryWindowDays: 7,
      listLimit: 50,
      counts: { due: 1, unplayable: 1, recentlyRecovered: 0 },
      due: [
        {
          source: {
            id: "source-1",
            provider: "youtube",
            externalId: "dQw4w9WgXcQ",
            channelId: "channel-1",
            title: "Stored title",
            thumbnailUrl: null,
            durationSeconds: 180,
            providerPublishedAt: null,
            availabilityStatus: "unavailable",
            lastCheckedAt: 1_776_000_000_000,
            nextCheckAt: 1_776_100_000_000,
            version: 3,
          },
          channel: {
            id: "channel-1",
            externalChannelId: `UC${"A".repeat(22)}`,
            displayName: "공식 채널",
          },
          linkedPerformanceCount: 1,
          links: [{
            songId: "song-1",
            songTitle: "상태 점검 곡",
            performanceId: "performance-1",
            publicationStatus: "published",
          }],
          lastEvent: {
            type: "source.retry_scheduled",
            at: 1_776_000_000_000,
            retryCode: "timeout",
          },
          recoveredAt: null,
        },
      ],
      unplayable: [],
      recentlyRecovered: [],
    });
    recheckSourceMock.mockResolvedValue({
      data: { id: "source-1" },
      catalogRevision: 7,
      check: {
        status: "retry_scheduled",
        currentAvailability: "unavailable",
        retryCode: "timeout",
        nextCheckAt: 1_776_200_000_000,
      },
    });
    fetchObservabilityMock.mockResolvedValue({
      status: "unconfigured",
      generatedAt: "2026-08-20T00:00:00.000Z",
      windowHours: 24,
      summary: {
        requestCount: 0,
        errorCount: 0,
        errorRate: 0,
        cacheHit: 0,
        cacheMiss: 0,
        cacheBypass: 0,
        p95DurationMs: null,
        d1RowsRead: null,
        d1RowsWritten: null,
      },
      routes: [],
      events: [],
      reasonCode: "analytics_unconfigured",
    });
    fetchReleaseMock.mockResolvedValue({
      data: {
        publicReadEnabled: false,
        navigationVisible: false,
        catalogRevision: 7,
        readModelRevision: 7,
        updatedAt: 10,
        readyForPublicRead: true,
      },
      recentChanges: [],
    });
    updateReleaseMock.mockResolvedValue({
      data: {
        publicReadEnabled: true,
        navigationVisible: false,
        catalogRevision: 7,
        readModelRevision: 7,
        updatedAt: 11,
        readyForPublicRead: true,
      },
      transition: "enable_public_read",
      changedAt: 11,
    });
    rejectProposalMock.mockResolvedValue({
      data: { ...proposal, status: "rejected", version: 3 },
      catalogRevision: 7,
    });
    approveProposalMock.mockResolvedValue({
      data: {
        ...proposal,
        status: "approved",
        version: 3,
        approvedPerformanceId: "performance-approved",
      },
      catalogRevision: 8,
    });
    updateEntityMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    deleteEntityMock.mockReset();
    deleteEntityMock.mockResolvedValue({
      data: { id: "external-1" },
      catalogRevision: 8,
    });
    updateSongMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    updatePerformanceMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    fetchMembersMock.mockResolvedValue([
      {
        uid: 1,
        code: "member",
        name: "현재 멤버",
        oshi_mark: "🌙",
        unit_name: "테스트 유닛",
      },
    ]);
    preflightEntryMock.mockResolvedValue({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "확인된 영상",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: 1,
        availabilityStatus: "playable",
        channelId: `UC${"M".repeat(22)}`,
        channelTitle: "현재 멤버 채널",
      },
      channel: {
        state: "recognized_member",
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: "member_main",
        memberUid: 1,
      },
      duplicate: null,
    });
    createEntryMock.mockResolvedValue({ data: { createdEntities: [] }, catalogRevision: 8 });
    deleteSongMock.mockResolvedValue({ data: { id: "song-draft" }, catalogRevision: 8 });
    deletePerformanceMock.mockResolvedValue({ data: { id: "performance-draft" }, catalogRevision: 8 });
  });

  it("registers a clip directly without enabling collection and preserves unknown broadcast metadata", async () => {
    preflightEntryMock.mockResolvedValue({ catalogRevision: 7,
      video: { videoId: "BBBBBBBBBBB", title: "방송 클립 영상", durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable", thumbnailUrl: null, channelId: `UC${"K".repeat(22)}`, channelTitle: "승인 클립 채널" },
      channel: { state: "approved", catalogChannelId: "clip-channel", verificationStatus: "approved", active: true, channelRole: "approved_kirinuki", memberUid: null }, duplicate: null });
    renderCatalogManager();
    await selectOption("카탈로그 영상 종류", "노래 클립");
    fireEvent.click(screen.getByRole("button", { name: "새 노래 클립 등록" }));
    const dialog = screen.getByRole("dialog", { name: "노래 클립 직접 등록" });
    fireEvent.change(within(dialog).getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/BBBBBBBBBBB" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false));
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    expect(within(dialog).queryByRole("button", { name: /커버 가창|오리지널곡/ })).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), { target: { value: "새 클립 곡" } });
    fireEvent.click(within(dialog).getByRole("option", { name: /새 곡 입력/ }));
    fireEvent.change(within(dialog).getByLabelText("원곡 가수 검색"), { target: { value: "원곡 가수" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "외부 인물로 추가" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), { target: { value: "현재 멤버" } });
    fireEvent.click(await within(dialog).findByRole("option", { name: /현재 멤버/ }));
    expect(within(dialog).queryByLabelText("채널 소유·연결 주체 검색")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    expect(within(dialog).queryByRole("button", { name: "게시" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));
    await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({ relationType: "singing_clip", releaseType: "broadcast", publicationTarget: "draft",
      startSeconds: 0, endSeconds: 180, channel: { kind: "existing", channelId: "clip-channel" },
      song: expect.objectContaining({ kind: "create", title: "새 클립 곡" }),
      broadcast: { performedOn: null, dateEvidence: null, originalUrl: null, extent: null } })));
    expect(publishPerformanceMock).not.toHaveBeenCalled();
  });

  it("appends catalog rows on intersection, stops at the end and resets on search", async () => {
    const observers: { notify: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal("IntersectionObserver", class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        observers.push({
          notify: (visible) => callback(
            [{ isIntersecting: visible } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
          disconnect: this.disconnect,
        });
      }
    });
    try {
      const songs = Array.from({ length: 60 }, (_, index) => ({
        id: `song-${index}`, title: `Song ${index}`, isOtwOriginal: false,
        archivedAt: null, version: 0, tags: [], aliases: [], originalArtists: [],
      }));
      fetchCatalogMock.mockResolvedValue({ ...catalog, songs });
      renderCatalogManager();
      await screen.findByText("전체 60곡 · 25곡 표시");
      expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
      const first = observers.at(-1)!;
      act(() => first.notify(false));
      expect(screen.getByText("전체 60곡 · 25곡 표시")).toBeTruthy();
      act(() => { first.notify(true); first.notify(true); });
      expect(screen.getByText("전체 60곡 · 50곡 표시")).toBeTruthy();
      expect(screen.getAllByText("Song 0")).toHaveLength(2);
      expect(screen.getAllByText("Song 49")).toHaveLength(2);
      expect(first.disconnect).toHaveBeenCalled();
      const last = observers.at(-1)!;
      act(() => last.notify(true));
      expect(screen.getByText("전체 60곡 · 60곡 표시")).toBeTruthy();
      expect(screen.getByText("모든 곡을 표시했습니다.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "곡 더 보기" })).toBeNull();
      fireEvent.change(screen.getByRole("textbox", { name: "곡명·원곡 가수 검색" }), { target: { value: "Song" } });
      expect(screen.getByText("전체 60곡 · 25곡 표시")).toBeTruthy();
      act(() => last.notify(true));
      expect(screen.getByText("전체 60곡 · 25곡 표시")).toBeTruthy();
      expect(fetchCatalogMock).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 15_000);

  it("keeps all active categories across appended batches, category changes and empty searches", async () => {
    const songs = Array.from({length: 26}, (_, index) => ({
      id: `song-${index}`, title: `Song ${index}`, isOtwOriginal: false,
      archivedAt: null, version: 0, tags: [index < 25 ? "POP" : "J-POP"], aliases: [], originalArtists: [],
    }));
    fetchCatalogMock.mockResolvedValue({...catalog, songs: [...songs, {...songs[0], id: "archived", archivedAt: 1, tags: ["ARCHIVED"]}]});
    renderCatalogManager();
    const category = await screen.findByRole("combobox", {name: "곡 분류"});
    const options = async () => {
      fireEvent.keyDown(category, { key: "ArrowDown" });
      const list = await screen.findByRole("listbox");
      const labels = within(list).getAllByRole("option").map((option) => option.textContent);
      fireEvent.keyDown(list, { key: "Escape" });
      return labels;
    };
    const selectCategory = async (name: string) => {
      fireEvent.keyDown(category, { key: "ArrowDown" });
      fireEvent.click(await screen.findByRole("option", { name }));
    };
    expect(await options()).toEqual(["모든 분류", "J-POP", "POP"]);
    fireEvent.click(screen.getByRole("button", {name: "곡 더 보기"}));
    expect(await options()).toEqual(["모든 분류", "J-POP", "POP"]);
    await selectCategory("POP");
    expect(await options()).toContain("J-POP");
    await selectCategory("J-POP");
    expect(screen.getByText("전체 1곡 · 1곡 표시")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", {name: "곡명·원곡 가수 검색"}), {target: {value: "no matching song"}});
    expect(screen.getByText("조건에 맞는 곡이 없습니다.")).toBeTruthy();
    expect(await options()).toEqual(["모든 분류", "J-POP", "POP"]);
    expect(category.textContent).toBe("J-POP");
    await selectCategory("모든 분류");
    expect(category.textContent).toBe("모든 분류");
  });

  it("loads source health only after section entry and distinguishes retryable outages", async () => {
    renderCatalogManager();
    await screen.findByText("OTW Play 카탈로그");
    expect(fetchSourceHealthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "운영" }));
    expect(await screen.findByRole("heading", { name: "소스 상태" })).toBeTruthy();
    expect(fetchSourceHealthMock).toHaveBeenCalledOnce();
    expect(screen.getAllByText("외부 API 재시도 대기 (timeout)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("상태 점검 곡").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /YouTube/ })[0]?.getAttribute("href"))
      .toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    fireEvent.click(screen.getAllByRole("button", { name: "수동 재검사" })[0]!);
    await waitFor(() => expect(recheckSourceMock).toHaveBeenCalledWith(
      "source-1",
      {
        expectedVersion: 3,
        youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        channelId: "channel-1",
      },
    ));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "info",
      description: "외부 API 재시도 대기 상태로 저장했습니다 (timeout).",
    }));
    expect(fetchCatalogMock).toHaveBeenCalledOnce();
    await waitFor(() => expect(fetchSourceHealthMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("loads observability, release, and source health only after operations entry", async () => {
    renderCatalogManager();
    await screen.findByText("OTW Play 카탈로그");
    expect(fetchObservabilityMock).not.toHaveBeenCalled();
    expect(fetchReleaseMock).not.toHaveBeenCalled();
    expect(fetchSourceHealthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "운영" }));
    expect(await screen.findByRole("heading", { name: "공개 설정" })).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "소스 상태" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "수동 재검사" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "소스 상태 열기" })).toBeNull();
    await waitFor(() => expect(fetchObservabilityMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchReleaseMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchSourceHealthMock).toHaveBeenCalledOnce());
    expect(screen.getByText(/Analytics 조회 token/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /회원 이용 활성화/ })).toBeTruthy();
  });

  it("keeps the operations and rollback path reachable when catalog loading fails", async () => {
    fetchCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    renderCatalogManager();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "관리자 카탈로그를 불러오지 못했습니다",
    );
    fireEvent.click(screen.getByRole("tab", { name: "운영" }));

    expect(
      await screen.findByRole("heading", { name: "공개 설정" }),
    ).toBeTruthy();
    expect(fetchReleaseMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /회원 이용 활성화/ })).toBeTruthy();
  });

  it("opens proposals only from explicit selection in the unified review inbox", async () => {
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    expect(screen.queryByRole("tab", { name: "사용자 곡 요청" })).toBeNull();
    expect(fetchProposalsMock).not.toHaveBeenCalled();
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    expect(await screen.findByTitle("검수할 공식 커버 검수 영상")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("곡명"), { target: { value: "보존할 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "검수 목록으로" }));
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    expect((await screen.findByLabelText("곡명") as HTMLInputElement).value).toBe("보존할 제목");
  });

  it("opens a completed legacy proposal as read-only history", async () => {
    fetchProposalsMock.mockImplementation((status: string) => Promise.resolve(status ? [] : [{ ...proposal, status: "rejected", reviewResultCode: "reviewed_rejection", reviewedAt: 1_777_000_000_000 }]));
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    expect(await screen.findByText("처리 상태: 거절됨")).toBeTruthy();
    expect(screen.getByText("처리 사유: reviewed_rejection")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "확인 후 승인·게시" })).toBeNull();
    expect(screen.queryByRole("button", { name: "제안 거절" })).toBeNull();
  });

  it("retains a draft when another administrator completes the proposal", async () => {
    const client = createTestQueryClient();
    render(createElement(QueryClientProvider, { client }, createElement(OtwPlayCatalogManager)));
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.change(await screen.findByLabelText("곡명"), { target: { value: "충돌 후에도 보존할 입력" } });
    fetchProposalsMock.mockImplementation((status: string) => Promise.resolve(status ? [] : [{ ...proposal, status: "rejected", version: 3 }]));
    await act(async () => { await client.invalidateQueries({ queryKey: queryKeys.otwPlay.adminProposals("pending_review") }); });
    await screen.findByText(/다른 관리자가 이 제안을 변경했습니다/);
    expect(screen.getByLabelText("곡명")).toHaveProperty("value", "충돌 후에도 보존할 입력");
    expect(screen.getByRole("button", { name: "확인 후 승인·게시" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "제안 거절" })).toHaveProperty("disabled", true);
    client.clear();
  });

  it("renders a proposal query failure instead of an empty review queue and retries", async () => {
    fetchProposalsMock
      .mockRejectedValueOnce(new Error("proposal unavailable"))
      .mockResolvedValueOnce([proposal]);
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    expect(await screen.findByText(/제안 목록을 불러오지 못했습니다\. 빈 목록으로 간주하지 않습니다/)).toBeTruthy();
    expect(screen.queryByText("대기 중인 제안이 없습니다.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect((await screen.findAllByText("검수할 공식 커버")).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "검수할 공식 커버" })).toBeTruthy();
    expect(fetchProposalsMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes release, observability, and source health after an audited switch", async () => {
    renderCatalogManager();
    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("tab", { name: "운영" }));
    const trigger = await screen.findByRole("button", { name: /회원 이용 활성화/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "공개 설정 변경" }));

    await waitFor(() => expect(updateReleaseMock).toHaveBeenCalledWith({
      expected: {
        publicReadEnabled: false,
        navigationVisible: false,
        updatedAt: 10,
      },
      target: { publicReadEnabled: true, navigationVisible: false },
      confirmation: "direct_routes_verified",
    }));
    await waitFor(() => expect(fetchReleaseMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(fetchObservabilityMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(fetchSourceHealthMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("reports and refreshes a stale manual source write", async () => {
    recheckSourceMock.mockRejectedValueOnce(
      new ApiError("Source changed before recheck", 409, {
        code: "PLAY_ADMIN_STALE_WRITE",
      }),
    );
    renderCatalogManager();
    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("tab", { name: "운영" }));
    await screen.findByRole("heading", { name: "소스 상태" });
    fireEvent.click(screen.getAllByRole("button", { name: "수동 재검사" })[0]!);
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "error",
      description: "다른 점검이 먼저 반영되었습니다. 최신 상태를 다시 불러왔습니다.",
    }));
    await waitFor(() => expect(fetchSourceHealthMock.mock.calls.length).toBeGreaterThan(1));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("requires metadata and singing-credit confirmation before approving a proposal", async () => {
    const confirm = confirmationMock.mockResolvedValue(true);
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    const player = await screen.findByTitle("검수할 공식 커버 검수 영상");
    expect(player.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    const approveButton = screen.getByRole("button", {
      name: "확인 후 승인·게시",
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);
    expect(screen.getByText("영상·채널 확인을 먼저 실행해 주세요.")).toBeTruthy();
    expect(within(screen.getByLabelText("선택한 장르(분류)")).getByText("J-POP")).toBeTruthy();

    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    await waitFor(() => expect(preflightEntryMock).toHaveBeenCalledWith({
      youtubeUrl: proposal.submittedUrl,
      startSeconds: 0,
    }));
    fireEvent.change(screen.getByLabelText("곡명"), {
      target: { value: "관리자가 정정한 곡명" },
    });
    fireEvent.click(screen.getByRole("button", { name: "K-POP" }));
    const songTagInput = screen.getByLabelText("장르(분류)");
    fireEvent.change(songTagInput, { target: { value: "K POP" } });
    fireEvent.keyDown(songTagInput, { key: "Enter" });
    expect(
      within(screen.getByLabelText("선택한 장르(분류)")).getAllByText("K-POP"),
    ).toHaveLength(1);
    expect(screen.queryByText("K POP")).toBeNull();
    fireEvent.click(screen.getByLabelText("참여자 가창 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "피처링 보컬" }));
    fireEvent.click(screen.getByLabelText("승인할 공개 형태"));
    fireEvent.click(await screen.findByRole("option", { name: "공식 MV" }));
    fireEvent.click(screen.getByLabelText("승인할 참여 형태"));
    fireEvent.click(await screen.findByRole("option", { name: "유닛" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(approveButton.disabled).toBe(false);
    fireEvent.click(approveButton);

    await waitFor(() =>
      expect(approveProposalMock).toHaveBeenCalledWith(
        "proposal-1",
        expect.objectContaining({
          expectedVersion: 2,
          expectedCatalogRevision: 7,
          singingCreditConfirmed: true,
          publish: true,
          releaseType: "official_mv",
          participationType: "unit",
          song: expect.objectContaining({
            kind: "create",
            title: "관리자가 정정한 곡명",
            tags: ["J-POP", "K-POP"],
          }),
          participants: [
            expect.objectContaining({ participantRole: "featured_vocal" }),
          ],
        }),
      ),
    );
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore();
  });

  it("preserves the proposal and reports the server reason and request ID when approval fails", async () => {
    approveProposalMock.mockRejectedValueOnce(new ApiError(
      "영상의 채널이 승인된 활성 채널인지 확인해 주세요.", 422,
      { code: "PLAY_ADMIN_VALIDATION_FAILED", requestId: "approval-request-1" },
    ));
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    await screen.findByText(/영상·채널 확인 완료/);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
      variant: "error",
      description: "제안 승인에 실패했습니다. 영상의 채널이 승인된 활성 채널인지 확인해 주세요. (PLAY_ADMIN_VALIDATION_FAILED) · 요청 ID: approval-request-1",
    })));
    expect(screen.getByLabelText("곡명")).toHaveProperty("value", proposal.submittedTitle);
    expect(screen.getByRole("button", { name: "확인 후 승인·게시" })).toHaveProperty("disabled", false);
  });

  it("shows verification failures and blocks approval during a fresh verification", async () => {
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    const verify = await screen.findByRole("button", { name: "영상·채널 확인" });
    const approve = screen.getByRole("button", { name: "확인 후 승인·게시" });
    fireEvent.click(verify);
    await screen.findByText(/영상·채널 확인 완료/);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(approve).toHaveProperty("disabled", false);

    let rejectVerification!: (error: Error) => void;
    preflightEntryMock.mockImplementationOnce(() => new Promise((_, reject) => { rejectVerification = reject; }));
    fireEvent.click(verify);
    expect(approve).toHaveProperty("disabled", true);
    expect(screen.getByText("영상·채널을 확인하고 있습니다.")).toBeTruthy();
    await act(async () => rejectVerification(new Error("YouTube 응답을 확인할 수 없습니다.")));
    expect(screen.getByRole("alert").textContent).toContain("YouTube 응답을 확인할 수 없습니다.");
    expect(approve).toHaveProperty("disabled", true);
    fireEvent.click(verify);
    await waitFor(() => expect(approve).toHaveProperty("disabled", false));
    expect(screen.queryByText(/영상·채널 확인 실패:/)).toBeNull();
    expect(approveProposalMock).not.toHaveBeenCalled();
  });

  it("requires an explicit channel owner and preserves new group identities", async () => {
    const confirm = confirmationMock.mockResolvedValue(true);
    preflightEntryMock.mockResolvedValueOnce({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "확인된 영상",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: 1,
        availabilityStatus: "playable",
        channelId: `UC${"U".repeat(22)}`,
        channelTitle: "미등록 프로젝트 채널",
      },
      channel: {
        state: "unknown",
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: null,
        memberUid: null,
      },
      duplicate: null,
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    await screen.findByText("channel unknown");
    const approveButton = screen.getByRole("button", { name: "확인 후 승인·게시" }) as HTMLButtonElement;
    fireEvent.click(screen.getByRole("checkbox"));
    expect(approveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "소유자 추가" }));
    fireEvent.click(screen.getByLabelText("1번째 채널 소유 종류"));
    fireEvent.click(await screen.findByRole("option", { name: "그룹" }));
    fireEvent.change(screen.getByLabelText("1번째 채널 소유 이름"), {
      target: { value: "프로젝트 팀" },
    });
    fireEvent.click(screen.getByLabelText("1번째 참여자 종류"));
    fireEvent.click(await screen.findByRole("option", { name: "그룹" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(approveButton.disabled).toBe(false);
    fireEvent.click(approveButton);

    await waitFor(() => expect(approveProposalMock).toHaveBeenCalledTimes(1));
    expect(approveProposalMock).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({
        channel: {
          kind: "confirm",
          channelRole: "project_official",
          owners: [
            expect.objectContaining({
              kind: "new_external",
              displayName: "프로젝트 팀",
              entityKind: "group",
            }),
          ],
        },
        participants: [
          expect.objectContaining({
            subject: expect.objectContaining({
              kind: "new_external",
              entityKind: "group",
            }),
          }),
        ],
      }),
    );
    confirm.mockRestore();
  });

  it("discards a late preflight response after leaving a proposal", async () => {
    let resolvePreflight!: (value: Awaited<ReturnType<typeof preflightEntryMock>>) => void;
    preflightEntryMock.mockReturnValueOnce(new Promise((resolve) => {
      resolvePreflight = resolve;
    }));
    fetchProposalsMock.mockResolvedValueOnce([
      proposal,
      { ...proposal, id: "proposal-2", submittedTitle: "두 번째 제안" },
    ]);
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "검수 목록으로" }));
    await act(async () => resolvePreflight({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ", title: "늦은 응답", thumbnailUrl: null,
        durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable",
        channelId: `UC${"L".repeat(22)}`, channelTitle: "늦은 채널",
      },
      channel: {
        state: "unknown", catalogChannelId: null, verificationStatus: null,
        active: false, channelRole: null, memberUid: null,
      },
      duplicate: null,
    }));
    expect(screen.getByRole("region", { name: "통합 검수 목록" })).toBeTruthy();
    expect(screen.queryByText("channel unknown")).toBeNull();
  });

  it("keeps a selected channel owner stable when an earlier participant is removed", async () => {
    const confirm = confirmationMock.mockResolvedValue(true);
    fetchProposalsMock.mockResolvedValueOnce([{
      ...proposal,
      participants: [
        { ...proposal.participants[0], creditOrder: 0, submittedNameSnapshot: "보컬 A" },
        { ...proposal.participants[0], creditOrder: 1, submittedNameSnapshot: "보컬 B" },
      ],
    }]);
    preflightEntryMock.mockResolvedValueOnce({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ", title: "확인된 영상", thumbnailUrl: null,
        durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable",
        channelId: `UC${"S".repeat(22)}`, channelTitle: "미등록 채널",
      },
      channel: {
        state: "unknown", catalogChannelId: null, verificationStatus: null,
        active: false, channelRole: null, memberUid: null,
      },
      duplicate: null,
    });
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    await screen.findByText("channel unknown");
    fireEvent.click(screen.getByRole("button", { name: "소유자 추가" }));
    fireEvent.click(screen.getByLabelText("1번째 채널 소유 identity"));
    fireEvent.click(await screen.findByRole("option", { name: "가창자 · 보컬 B" }));
    fireEvent.click(screen.getByRole("button", { name: "1번째 참여자 삭제" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
    await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({
        channel: expect.objectContaining({
          owners: [expect.objectContaining({ displayName: "보컬 B" })],
        }),
      }),
    ));
    confirm.mockRestore();
  });

  it("omits archived songs and identities from approval selectors", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      songs: [
        {
          id: "song-active", slug: "song-active", title: "활성 곡",
          normalizedTitle: "활성 곡", isOtwOriginal: false,
          originalReleaseDate: null, originalReleasePrecision: "unknown",
          archivedAt: null, version: 0, tags: [], aliases: [], originalArtists: [],
        },
        {
          id: "song-archived", slug: "song-archived", title: "보관 곡",
          normalizedTitle: "보관 곡", isOtwOriginal: false,
          originalReleaseDate: null, originalReleasePrecision: "unknown",
          archivedAt: 1, version: 0, tags: [], aliases: [], originalArtists: [],
        },
      ],
      entities: [
        {
          id: "entity-active", memberUid: null, displayName: "활성 인물",
          normalizedName: "활성 인물", slug: "entity-active", entityKind: "person",
          archivedAt: null, version: 0,
        },
        {
          id: "entity-archived", memberUid: null, displayName: "보관 인물",
          normalizedName: "보관 인물", slug: "entity-archived", entityKind: "person",
          archivedAt: 1, version: 0,
        },
      ],
    });
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByLabelText("승인할 곡 선택"));
    expect(await screen.findByRole("option", { name: "활성 곡" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "보관 곡" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("1번째 원곡 가수 identity"));
    expect(await screen.findByRole("option", { name: "활성 인물" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "보관 인물" })).toBeNull();
  });

  it("preserves an unresolved submitted member UID during approval", async () => {
    const confirm = confirmationMock.mockResolvedValue(true);
    fetchProposalsMock.mockResolvedValueOnce([{
      ...proposal,
      participants: [{
        ...proposal.participants[0],
        submittedMemberUid: 1,
        resolvedEntityId: null,
      }],
    }]);
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "영상·채널 확인" }));
    await waitFor(() => expect(preflightEntryMock).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
    await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith(
      "proposal-1",
      expect.objectContaining({
        participants: [expect.objectContaining({
          subject: { kind: "member", memberUid: 1 },
        })],
      }),
    ));
    confirm.mockRestore();
  });

  it("rejects with an internal reason and then refetches authoritative state", async () => {
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    await selectOption("검수 출처", "사용자 제안");
    fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
    const rejectButton = await screen.findByRole("button", { name: "제안 거절" });
    expect((rejectButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("검수할 공식 커버 거절 코드"), {
      target: { value: "duplicate" },
    });
    fireEvent.click(rejectButton);

    await waitFor(() =>
      expect(rejectProposalMock).toHaveBeenCalledWith("proposal-1", {
        expectedVersion: 2,
        resultCode: "duplicate",
      }),
    );
    await waitFor(() => {
      expect(fetchCatalogMock.mock.calls.length).toBeGreaterThan(1);
      expect(fetchProposalsMock.mock.calls.length).toBeGreaterThan(1);
    });
    expect(toastMock).toHaveBeenCalledWith({
      variant: "success",
      description: "제안 거절 작업을 완료했습니다.",
    });
  });

  it("keeps external identity edits in the unified channel screen after a failed command", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      entities: [
        {
          id: "external-1",
          memberUid: null,
          entityKind: "person",
          displayName: "외부 인물",
          normalizedName: "외부 인물",
          slug: "external-person-a1b2c3d4",
          version: 2,
          archivedAt: null,
        },
      ],
    });
    updateEntityMock.mockRejectedValueOnce(new Error("write failed"));
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "인물·그룹" }));
    expect(screen.getByRole("heading", { name: "외부 인물·그룹" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "채널 감시" })).toBeNull();
    expect(screen.queryByLabelText("수집 대상 채널 ID")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "외부 인물 수정" }));
    const nameInput = screen.getByLabelText(
      "외부 identity 표시명",
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "입력 보존" } });
    expect(screen.queryByLabelText(/slug/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        variant: "error",
        description: "외부 identity 수정 작업에 실패했습니다.",
      }),
    );
    expect(nameInput.value).toBe("입력 보존");
    consoleError.mockRestore();
  });

  it("deletes only unreferenced external identities after irreversible confirmation", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      entities: [
        {
          id: "external-1",
          memberUid: null,
          entityKind: "person",
          displayName: "삭제 가능한 외부 인물",
          normalizedName: "삭제 가능한 외부 인물",
          slug: "deletable-external",
          version: 2,
          archivedAt: null,
        },
        {
          id: "external-linked",
          memberUid: null,
          entityKind: "group",
          displayName: "연결된 외부 그룹",
          normalizedName: "연결된 외부 그룹",
          slug: "linked-external",
          version: 4,
          archivedAt: null,
        },
      ],
      channels: [{
        id: "channel-linked",
        provider: "youtube",
        externalChannelId: `UC${"L".repeat(22)}`,
        displayName: "연결 채널",
        channelRole: "approved_kirinuki",
        verificationStatus: "approved",
        active: true,
        entityIds: ["external-linked"],
        version: 1,
      }],
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "인물·그룹" }));
    const linkedDelete = screen.getByRole("button", {
      name: "연결된 외부 그룹 삭제 메뉴",
    }) as HTMLButtonElement;
    expect(linkedDelete.disabled).toBe(true);
    const linkedRow = linkedDelete.closest("tr");
    expect(linkedRow).not.toBeNull();
    expect(within(linkedRow!).getByText("연결 사용 중 · 삭제 불가")).toBeTruthy();
    expect(linkedDelete.getAttribute("aria-describedby")).toBe(
      "external-entity-delete-reason-external-linked",
    );

    fireEvent.click(await openSecondaryAction("삭제 가능한 외부 인물 삭제"));
    expect(await screen.findByText("외부 주체를 삭제할까요?")).toBeTruthy();
    expect(screen.getByText(/이 작업은 되돌릴 수 없으며/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));

    await waitFor(() => expect(deleteEntityMock).toHaveBeenCalledWith(
      "external-1",
      { expectedVersion: 2 },
    ));
    expect(toastMock).toHaveBeenCalledWith({
      variant: "success",
      description: "외부 identity 삭제 작업을 완료했습니다.",
    });
  });

  it("explains how to resolve a server-discovered external identity reference", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      entities: [{
        id: "external-1",
        memberUid: null,
        entityKind: "person",
        displayName: "숨은 참조 인물",
        normalizedName: "숨은 참조 인물",
        slug: "hidden-reference",
        version: 2,
        archivedAt: null,
      }],
    });
    deleteEntityMock.mockRejectedValueOnce(
      new ApiError("Referenced entity", 422, {
        code: "PLAY_ADMIN_VALIDATION_FAILED",
        fields: { entity: "referenced" },
      }),
    );
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "인물·그룹" }));
    fireEvent.click(await openSecondaryAction("숨은 참조 인물 삭제"));
    fireEvent.click(await screen.findByRole("button", { name: "영구 삭제" }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "error",
      description: "곡·가창·승인 채널·제안 또는 저장된 후보 검수에 연결된 외부 주체는 삭제할 수 없습니다. 연결을 먼저 교정하거나 보관 처리해 주세요.",
    }));
    consoleError.mockRestore();
  });

  it("manages approved channels in a dedicated tab and supports kirinuki registration", async () => {
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "채널" }));

    expect(screen.getByRole("heading", { name: "Play 채널" })).toBeTruthy();
    expect(screen.getByText(/검수 대기로 생성/)).toBeTruthy();
    fireEvent.click(screen.getByRole("combobox", { name: "채널 역할" }));
    fireEvent.click(screen.getByRole("option", { name: "승인 키리누키" }));
    const channelId = screen.getByLabelText("YouTube channel ID");
    const displayName = screen.getByLabelText("채널 표시명");
    const submit = screen.getByRole("button", { name: "채널 등록" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect((displayName as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByText("소유·연결 주체")).toBeNull();

    fireEvent.change(channelId, { target: { value: `UC${"F".repeat(22)}` } });
    fireEvent.click(screen.getByRole("button", { name: "채널 조회" }));
    await waitFor(() => expect(lookupChannelMock).toHaveBeenCalledWith(
      `UC${"F".repeat(22)}`,
    ));
    await waitFor(() => expect((displayName as HTMLInputElement).value).toBe(
      "정리된 공식 채널",
    ));
    expect(screen.getByRole("combobox", { name: "채널 역할" }).textContent).toContain("승인 키리누키");
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(createChannelMock).toHaveBeenCalledWith({
      externalChannelId: `UC${"F".repeat(22)}`,
      displayName: "정리된 공식 채널",
      channelRole: "approved_kirinuki",
      entityIds: [],
    }));
    expect(screen.getByText("등록된 채널")).toBeTruthy();
  });

  it("approves and activates a registered kirinuki channel from the channel tab", async () => {
    const channelId = `UC${"K".repeat(22)}`;
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      channels: [{
        id: "channel-kirinuki",
        provider: "youtube",
        externalChannelId: channelId,
        displayName: "동의 완료 키리누키",
        channelRole: "approved_kirinuki",
        verificationStatus: "pending",
        active: false,
        entityIds: [],
        version: 2,
      }],
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "채널" }));
    fireEvent.click(screen.getByRole("button", { name: "동의 완료 키리누키 수정" }));
    fireEvent.click(screen.getByLabelText("채널 검수 상태"));
    fireEvent.click(await screen.findByRole("option", { name: "승인됨" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "이 채널 영상 사용 허용" }));
    fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));

    await waitFor(() => expect(updateChannelMock).toHaveBeenCalledWith({
      id: "channel-kirinuki",
      expectedVersion: 2,
      externalChannelId: channelId,
      displayName: "동의 완료 키리누키",
      channelRole: "approved_kirinuki",
      entityIds: [],
      verificationStatus: "approved",
      active: true,
    }));
  });

  it("corrects an existing channel subject link after explicit confirmation", async () => {
    const channelId = `UC${"S".repeat(22)}`;
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      entities: [
        {
          id: "external-wrong",
          memberUid: null,
          entityKind: "group",
          displayName: "잘못 연결된 그룹",
          normalizedName: "잘못 연결된 그룹",
          slug: "wrong-group",
          version: 1,
          archivedAt: null,
        },
        {
          id: "member-correct",
          memberUid: 42,
          entityKind: "person",
          displayName: "올바른 멤버",
          normalizedName: "올바른 멤버",
          slug: "correct-member",
          version: 2,
          archivedAt: null,
        },
      ],
      channels: [{
        id: "channel-subject-correction",
        provider: "youtube",
        externalChannelId: channelId,
        displayName: "연결 교정 채널",
        channelRole: "member_main",
        verificationStatus: "approved",
        active: true,
        entityIds: ["external-wrong"],
        version: 5,
      }],
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("tab", { name: "채널" }));
    expect(screen.getAllByText("잘못 연결된 그룹").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("연결 주체")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "연결 교정 채널 수정" }));

    expect(screen.getByLabelText("연결 주체")).toBeTruthy();
    const wrongSubject = screen.getByRole("checkbox", { name: "잘못 연결된 그룹 연결" });
    const correctSubject = screen.getByRole("checkbox", { name: "올바른 멤버 연결" });
    expect((wrongSubject as HTMLButtonElement).dataset.state).toBe("checked");
    expect((correctSubject as HTMLButtonElement).dataset.state).toBe("unchecked");
    fireEvent.click(wrongSubject);
    fireEvent.click(correctSubject);
    fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));

    expect(await screen.findByText("채널 연결 주체를 변경할까요?")).toBeTruthy();
    expect(updateChannelMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "연결 변경 저장" }));

    await waitFor(() => expect(updateChannelMock).toHaveBeenCalledWith({
      id: "channel-subject-correction",
      expectedVersion: 5,
      externalChannelId: channelId,
      displayName: "연결 교정 채널",
      channelRole: "member_main",
      entityIds: ["member-correct"],
      verificationStatus: "approved",
      active: true,
    }));
  });

  it("edits original artists as reusable chips without exposing the original release date", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      songs: [
        {
          id: "song-edit",
          slug: "song-edit",
          title: "수정 전 곡",
          normalizedTitle: "수정 전 곡",
          isOtwOriginal: false,
          originalReleaseDate: "2020-05-03",
          originalReleasePrecision: "day",
          version: 3,
          archivedAt: null,
          aliases: [],
          originalArtists: [
            {
              entityId: "artist-existing",
              displayName: "기존 원곡 가수",
              creditOrder: 0,
              isPrimary: true,
            },
          ],
        },
      ],
      entities: [
        {
          id: "artist-existing",
          memberUid: null,
          entityKind: "person",
          displayName: "기존 원곡 가수",
          normalizedName: "기존 원곡 가수",
          slug: "existing-artist",
          version: 0,
          archivedAt: null,
        },
      ],
    });
    renderCatalogManager();

    await screen.findAllByText("수정 전 곡");
    fireEvent.click(screen.getAllByRole("button", { name: "곡 정보 수정" })[0]!);
    const dialog = screen.getByRole("dialog", { name: "곡 정보 수정" });
    expect(within(dialog).queryByLabelText("원곡 공개일")).toBeNull();
    expect(within(dialog).getByLabelText("원곡 가수 검색")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "기존 원곡 가수 제거" }));
    fireEvent.change(within(dialog).getByLabelText("원곡 가수 검색"), {
      target: { value: "새 원곡 가수" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "외부 인물로 추가" }));
    fireEvent.change(within(dialog).getByLabelText("곡명"), {
      target: { value: "수정한 곡" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateSongMock).toHaveBeenCalledTimes(1));
    expect(updateSongMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "song-edit",
        expectedVersion: 3,
        title: "수정한 곡",
        originalReleaseDate: "2020-05-03",
        originalReleasePrecision: "day",
        originalArtists: [
          {
            subject: expect.objectContaining({
              kind: "new_external",
              displayName: "새 원곡 가수",
              entityKind: "person",
            }),
            creditOrder: 0,
            isPrimary: true,
          },
        ],
      }),
    );
  });

  it("edits the linked song, participants, classifications, source, and notes in one performance form", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      songs: [
        {
          id: "song-source",
          slug: "source-song",
          title: "기존 연결 곡",
          normalizedTitle: "기존 연결 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 1,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
        {
          id: "song-target",
          slug: "target-song",
          title: "변경할 연결 곡",
          normalizedTitle: "변경할 연결 곡",
          isOtwOriginal: true,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 1,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
      ],
      entities: [
        {
          id: "external-old",
          memberUid: null,
          entityKind: "person",
          displayName: "기존 외부 인물",
          normalizedName: "기존 외부 인물",
          slug: "external-old",
          version: 0,
          archivedAt: null,
        },
      ],
      channels: [
        {
          id: "channel-approved",
          provider: "youtube",
          externalChannelId: `UC${"C".repeat(22)}`,
          displayName: "승인 공식 채널",
          channelRole: "member_main",
          verificationStatus: "approved",
          active: true,
          entityIds: [],
          version: 0,
        },
      ],
      performances: [
        {
          id: "performance-edit",
          songId: "song-source",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "draft",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: "기존 메모",
          version: 4,
          participants: [
            {
              entityId: "external-old",
              displayName: "기존 외부 인물",
              participantRole: "vocal",
              creditOrder: 0,
              creditNameSnapshot: "기존 크레딧",
            },
          ],
          sources: [
            {
              source: {
                id: "source-old",
                provider: "youtube",
                externalId: "dQw4w9WgXcQ",
                channelId: "channel-approved",
                title: "기존 영상",
                thumbnailUrl: null,
                durationSeconds: 180,
                providerPublishedAt: null,
                availabilityStatus: "playable",
                lastCheckedAt: null,
                version: 0,
              },
              startSeconds: 0,
              endSeconds: null,
              sourceRole: "official",
              priority: 0,
              isPrimary: true,
            },
          ],
        },
      ],
    });
    renderCatalogManager();

    await screen.findAllByText("기존 연결 곡");
    fireEvent.click(
      screen.getByRole("button", { name: "기존 연결 곡 가창 펼치기" }),
    );
    const performanceRow = screen.getAllByText("임시 저장")[0]!.closest("tr");
    expect(performanceRow).toBeTruthy();
    fireEvent.click(within(performanceRow!).getByRole("button", { name: "수정" }));

    const dialog = screen.getByRole("dialog", { name: "가창 정보 수정" });
    expect(within(dialog).getByLabelText("연결된 곡")).toBeTruthy();
    expect(within(dialog).getByLabelText("곡 관계")).toBeTruthy();
    expect(within(dialog).getByLabelText("공개 형태")).toBeTruthy();
    expect(within(dialog).getByLabelText("참여 형태")).toBeTruthy();
    expect(within(dialog).getByLabelText("데이터 품질")).toBeTruthy();
    expect(within(dialog).getByLabelText("가창 공개일시")).toBeTruthy();
    expect(within(dialog).getByLabelText("YouTube URL")).toBeTruthy();
    expect(within(dialog).getByLabelText("source 1 채널")).toBeTruthy();
    expect(within(dialog).getByLabelText("시작 위치(초)")).toBeTruthy();
    expect(within(dialog).getByLabelText("종료 위치(초)")).toBeTruthy();
    expect(within(dialog).getByLabelText("source 1 역할")).toBeTruthy();
    expect(within(dialog).getByLabelText("내부 메모")).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "기존 외부 인물 제거" }),
    );
    fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.change(within(dialog).getByLabelText("현재 멤버 표시 크레딧"), {
      target: { value: "수정한 멤버 크레딧" },
    });
    fireEvent.change(within(dialog).getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/ASRCBcCY_qE" },
    });
    fireEvent.change(within(dialog).getByLabelText("시작 위치(초)"), {
      target: { value: "12" },
    });
    fireEvent.change(within(dialog).getByLabelText("종료 위치(초)"), {
      target: { value: "170" },
    });
    fireEvent.change(within(dialog).getByLabelText("가창 공개일시"), {
      target: { value: "2026-08-12T12:30" },
    });
    fireEvent.change(within(dialog).getByLabelText("내부 메모"), {
      target: { value: "전체 정보 수정" },
    });
    const performanceTagInput = within(dialog).getByLabelText("커버 영상 라벨");
    fireEvent.change(performanceTagInput, {
      target: { value: "어쿠스틱" },
    });
    fireEvent.click(
      within(
        performanceTagInput.parentElement?.parentElement as HTMLElement,
      ).getByRole("button", { name: "추가" }),
    );

    fireEvent.click(within(dialog).getByLabelText("연결된 곡"));
    fireEvent.click(await screen.findByRole("option", { name: "변경할 연결 곡" }));
    fireEvent.click(within(dialog).getByLabelText("곡 관계"));
    fireEvent.click(await screen.findByRole("option", { name: "오리지널" }));
    fireEvent.click(within(dialog).getByLabelText("공개 형태"));
    fireEvent.click(await screen.findByRole("option", { name: "공식 MV" }));
    fireEvent.click(within(dialog).getByLabelText("참여 형태"));
    fireEvent.click(await screen.findByRole("option", { name: "듀엣" }));
    fireEvent.click(within(dialog).getByLabelText("데이터 품질"));
    fireEvent.click(await screen.findByRole("option", { name: "업데이트 필요" }));
    fireEvent.click(within(dialog).getByLabelText("현재 멤버 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "피처링 보컬" }));
    fireEvent.click(within(dialog).getByLabelText("source 1 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "대체 영상" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "전체 정보 저장" }));

    await waitFor(() => expect(updatePerformanceMock).toHaveBeenCalledTimes(1));
    expect(updatePerformanceMock).toHaveBeenCalledWith({
      id: "performance-edit",
      expectedVersion: 4,
      songId: "song-target",
      relationType: "original",
      releaseType: "official_mv",
      participationType: "duet",
      qualityStatus: "needs_update",
      releasedAt: new Date("2026-08-12T12:30").getTime(),
      internalNote: "전체 정보 수정",
      tags: ["어쿠스틱"],
      participants: [
        {
          subject: { kind: "member", memberUid: 1 },
          participantRole: "featured_vocal",
          creditOrder: 0,
          creditNameSnapshot: "수정한 멤버 크레딧",
        },
      ],
      sources: [{
        youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
        channelId: "channel-approved",
        startSeconds: 12,
        endSeconds: 170,
        sourceRole: "alternate",
        priority: 0,
        isPrimary: true,
      }],
    });
  });

  it("disables catalog writes while the public read model revision is stale", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      revision: 8,
      readModelRevision: 7,
    });
    renderCatalogManager();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "편집할 수 없습니다",
    );
    fireEvent.click(screen.getByRole("tab", { name: "채널" }));
    expect(
      (screen.getByRole("button", { name: "채널 등록" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("deletes draft and withdrawn test data while protecting currently published catalog", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      songs: [
        {
          id: "song-draft",
          slug: "draft-song",
          title: "임시 곡",
          normalizedTitle: "임시 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 2,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
        {
          id: "song-published",
          slug: "published-song",
          title: "게시 이력 곡",
          normalizedTitle: "게시 이력 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 1,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
        {
          id: "song-withdrawn",
          slug: "withdrawn-song",
          title: "철회 곡",
          normalizedTitle: "철회 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 5,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
      ],
      performances: [
        {
          id: "performance-draft",
          songId: "song-draft",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "draft",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 3,
          participants: [],
          sources: [],
        },
        {
          id: "performance-published",
          songId: "song-published",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "published",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 4,
          participants: [],
          sources: [],
        },
        {
          id: "performance-withdrawn",
          songId: "song-withdrawn",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "withdrawn",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 6,
          participants: [],
          sources: [],
        },
      ],
    });
    renderCatalogManager();

    await screen.findAllByText("임시 곡");
    const songDeleteButtons = screen.getAllByRole("button", { name: "곡 삭제 메뉴" });
    const enabledSongDeletes = songDeleteButtons.filter(
      (button) => !(button as HTMLButtonElement).disabled,
    );
    const disabledSongDeletes = songDeleteButtons.filter(
      (button) => (button as HTMLButtonElement).disabled,
    );
    expect(enabledSongDeletes).toHaveLength(4);
    expect(disabledSongDeletes).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "임시 곡 가창 펼치기" }));
    fireEvent.click(await openSecondaryAction("삭제", screen.getAllByRole("button", { name: "삭제 메뉴" })[0]!));
    expect(screen.getByText("임시 저장 가창을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
    await waitFor(() =>
      expect(deletePerformanceMock).toHaveBeenCalledWith(
        "performance-draft",
        { expectedVersion: 3 },
      ),
    );

    fireEvent.click(await openSecondaryAction("곡 삭제", enabledSongDeletes[0]!));
    expect(screen.getByText("곡을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() =>
      expect(deleteSongMock).toHaveBeenCalledWith("song-draft", {
        expectedVersion: 2,
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "철회 곡 가창 펼치기" }));
    const withdrawnStatus = screen.getAllByText("철회됨")[0]!;
    const withdrawnRow = withdrawnStatus.closest("tr");
    expect(withdrawnRow).toBeTruthy();
    fireEvent.click(
      await openSecondaryAction("삭제", within(withdrawnRow!).getByRole("button", { name: "삭제 메뉴" })),
    );
    expect(screen.getByText("철회된 가창을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
    await waitFor(() =>
      expect(deletePerformanceMock).toHaveBeenCalledWith(
        "performance-withdrawn",
        { expectedVersion: 6 },
      ),
    );

    const withdrawnSongTitle = screen.getAllByText("철회 곡")[0]!;
    const withdrawnSongRow = withdrawnSongTitle.closest("tr");
    expect(withdrawnSongRow).toBeTruthy();
    fireEvent.click(
      await openSecondaryAction("곡 삭제", within(withdrawnSongRow!).getByRole("button", { name: "곡 삭제 메뉴" })),
    );
    expect(screen.getByText(/철회 1개 포함/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() =>
      expect(deleteSongMock).toHaveBeenCalledWith("song-withdrawn", {
        expectedVersion: 5,
      }),
    );
  });

  it("publishes every visible draft from one catalog action and preserves failed drafts", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      songs: [
        {
          id: "song-one",
          slug: "song-one",
          title: "첫 번째 곡",
          normalizedTitle: "첫 번째 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 1,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
        {
          id: "song-two",
          slug: "song-two",
          title: "두 번째 곡",
          normalizedTitle: "두 번째 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          version: 1,
          archivedAt: null,
          aliases: [],
          originalArtists: [],
        },
      ],
      performances: [
        {
          id: "performance-draft-one",
          songId: "song-one",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "draft",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 3,
          participants: [],
          sources: [],
        },
        {
          id: "performance-draft-two",
          songId: "song-two",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "draft",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 5,
          participants: [],
          sources: [],
        },
        {
          id: "performance-withdrawn",
          songId: "song-two",
          relationType: "cover",
          releaseType: "official_video",
          participationType: "solo",
          publicationStatus: "withdrawn",
          qualityStatus: "ok",
          releasedAt: null,
          internalNote: null,
          version: 7,
          participants: [],
          sources: [],
        },
      ],
    });
    let resolveFirstPublish: (() => void) | undefined;
    publishPerformanceMock
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstPublish = () => resolve({});
      }))
      .mockRejectedValueOnce(new Error("channel approval changed"));
    renderCatalogManager();

    expect(await screen.findByText("미게시 가창 2개 · 2곡")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "미게시 곡 모두 게시" }));
    expect(screen.getByText("미게시 곡을 모두 게시할까요?")).toBeTruthy();
    expect(screen.getByText(/실패 항목은 임시 저장 상태로 유지/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "2개 게시" }));

    await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(1));
    expect(publishPerformanceMock).toHaveBeenNthCalledWith(
      1,
      "performance-draft-one",
      { expectedVersion: 3 },
    );
    expect(publishPerformanceMock).not.toHaveBeenCalledWith(
      "performance-draft-two",
      expect.anything(),
    );
    resolveFirstPublish?.();

    await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(2));
    expect(publishPerformanceMock).toHaveBeenNthCalledWith(
      2,
      "performance-draft-two",
      { expectedVersion: 5 },
    );
    expect(publishPerformanceMock).not.toHaveBeenCalledWith(
      "performance-withdrawn",
      expect.anything(),
    );
    await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
      variant: "info",
      description: "1개를 게시했고 1개는 검증 실패 또는 동시 변경으로 임시 저장 상태를 유지했습니다.",
    }));
  });

  it("shows only workflow sections and suggests current members without a prerequisite identity screen", async () => {
    renderCatalogManager();
    await screen.findByRole("button", { name: "새 영상 등록" });
    expect(screen.getByRole("tab", { name: "카탈로그" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "채널" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "가져오기/검수" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "채널 감시" })).toBeNull();
    expect(screen.queryByRole("button", { name: "곡" })).toBeNull();
    expect(screen.queryByRole("button", { name: "가창" })).toBeNull();
    expect(screen.queryByRole("button", { name: "채널" })).toBeNull();
    expect(screen.getByRole("button", { name: "인물·그룹" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "새 영상 등록" }));
    const registrationDialog = await screen.findByRole("dialog", {
      name: "새 YouTube 영상 등록",
    });
    expect(registrationDialog.contains(document.activeElement)).toBe(true);
    fireEvent.change(await screen.findByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    expect(screen.queryByText("기존 곡 연결")).toBeNull();
    expect(screen.queryByText("새 곡 만들기")).toBeNull();
    const coverNext = screen.getByRole("button", { name: /다음/ });
    expect((coverNext as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "정식 원곡 제목" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "원곡 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    expect((coverNext as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    const participantSearch = screen.getByLabelText("가창 참여자 검색");
    fireEvent.change(participantSearch, {
      target: { value: "현재 멤버" },
    });
    await screen.findByRole("option", { name: /현재 멤버/ });
    fireEvent.keyDown(participantSearch, { key: "Enter" });
    expect(screen.getByText(/현재 멤버 🌙 · 테스트 유닛/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 멤버 제거" }));
    expect(screen.queryByText(/현재 멤버 🌙 · 테스트 유닛/)).toBeNull();
    fireEvent.change(participantSearch, { target: { value: "현재 멤버" } });
    fireEvent.keyDown(participantSearch, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "게시" }));
    await screen.findByText("이 영상을 게시할까요?");
    const publishButtons = screen.getAllByRole("button", { name: "게시" });
    fireEvent.click(publishButtons[publishButtons.length - 1]!);
    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicationTarget: "published",
          participants: [
            expect.objectContaining({
              subject: { kind: "member", memberUid: 1 },
            }),
          ],
          channel: {
            kind: "recognized_member",
            memberUid: 1,
            channelRole: "member_main",
          },
          relationType: "cover",
          song: {
            kind: "create",
            title: "정식 원곡 제목",
            isOtwOriginal: false,
            originalReleaseDate: null,
            originalReleasePrecision: "unknown",
            aliases: [],
            originalArtists: [
              {
                subject: {
                  kind: "new_external",
                  clientKey: expect.any(String),
                  displayName: "원곡 가수",
                  entityKind: "person",
                },
                creditOrder: 0,
                isPrimary: true,
              },
            ],
          },
        }),
      ),
    );
  });

  it.each(["checkbox", "video kind"])(
    "restores editable new-song fields when leaving medley through %s",
    async (transition) => {
      renderCatalogManager();
      fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
      const dialog = screen.getByRole("dialog", { name: "새 YouTube 영상 등록" });
      fireEvent.change(within(dialog).getByLabelText("YouTube URL"), {
        target: { value: "https://youtu.be/dQw4w9WgXcQ" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
      await waitFor(() =>
        expect((within(dialog).getByRole("button", { name: /다음/ }) as HTMLButtonElement).disabled).toBe(false),
      );
      fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
      fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
      fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), {
        target: { value: "새 커버 원곡" },
      });
      fireEvent.click(within(dialog).getByRole("option", { name: /새 곡 입력/ }));
      if (transition === "checkbox") {
        fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
      } else {
        fireEvent.click(within(dialog).getByRole("button", { name: /오리지널곡/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
      }

      expect(within(dialog).getByLabelText("원곡 제목")).toHaveProperty("value", "새 커버 원곡");
      const next = within(dialog).getByRole("button", { name: /다음/ });
      expect(next).toHaveProperty("disabled", true);
      fireEvent.change(within(dialog).getByLabelText("원곡 가수 검색"), {
        target: { value: "새 원곡 가수" },
      });
      fireEvent.click(within(dialog).getByRole("button", { name: /외부 인물로 추가/ }));
      expect(next).toHaveProperty("disabled", false);
      fireEvent.click(next);
      fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
        target: { value: "현재 멤버" },
      });
      fireEvent.click(await within(dialog).findByRole("option", { name: /현재 멤버/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));
      await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
        registrationMode: "standard",
        song: expect.objectContaining({
          kind: "create", title: "새 커버 원곡",
          originalArtists: [expect.objectContaining({
            subject: expect.objectContaining({ kind: "new_external", displayName: "새 원곡 가수" }),
          })],
        }),
      })));
    },
  );

  it("reuses persisted external participants and channel owners in the next medley command", async () => {
    const existingSong = {
      id: "existing-song", slug: "existing-song", title: "기존 곡", normalizedTitle: "기존 곡",
      isOtwOriginal: false, originalReleaseDate: null, originalReleasePrecision: "unknown",
      archivedAt: null, version: 0, tags: [], aliases: [], originalArtists: [],
    };
    const persistedGuest = {
      id: "persisted-guest", memberUid: null, displayName: "메들리 외부 가창자",
      normalizedName: "메들리 외부 가창자", entityKind: "person", slug: "medley-guest",
      archivedAt: null, version: 0,
    };
    const preflight = await preflightEntryMock();
    preflightEntryMock.mockClear();
    preflightEntryMock.mockResolvedValue({
      ...preflight,
      channel: { ...preflight.channel, state: "unknown", memberUid: null },
    });
    fetchCatalogMock.mockResolvedValue({ ...catalog, songs: [existingSong] });
    createEntryMock.mockImplementationOnce(async () => {
      fetchCatalogMock.mockResolvedValue({
        ...catalog, revision: 8, songs: [existingSong], entities: [persistedGuest],
      });
      return { data: { createdEntities: [persistedGuest] }, catalogRevision: 8 };
    });
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    const dialog = screen.getByRole("dialog", { name: "새 YouTube 영상 등록" });
    fireEvent.change(within(dialog).getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "구간 선택" }));
    fireEvent.change(within(dialog).getByLabelText("종료 위치(초)"), { target: { value: "90" } });
    const confirmVideo = async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
      await waitFor(() => expect(within(dialog).getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false));
      fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    };
    await confirmVideo();
    fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
    const selectSong = () => {
      fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), { target: { value: "기존 곡" } });
      fireEvent.click(within(dialog).getByRole("option", { name: /기존 곡/ }));
      fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    };
    selectSong();
    fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
      target: { value: "메들리 외부 가창자" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.change(within(dialog).getByLabelText("채널 소유·연결 주체 검색"), {
      target: { value: "메들리 외부 가창자" },
    });
    fireEvent.click(within(dialog).getByRole("option", { name: /메들리 외부 가창자/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));
    await within(dialog).findByText("메들리 커버 구간을 임시 저장했습니다.");
    expect(createEntryMock.mock.calls[0]?.[0].participants[0].subject.kind).toBe("new_external");
    fireEvent.click(within(dialog).getByRole("button", { name: "같은 영상의 다음 커버 추가" }));
    await confirmVideo();
    selectSong();
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));
    await waitFor(() => expect(createEntryMock).toHaveBeenCalledTimes(2));
    const secondRequest = createEntryMock.mock.calls[1]?.[0];
    expect(secondRequest.participants[0].subject).toEqual({
      kind: "entity", entityId: "persisted-guest",
    });
    expect(secondRequest.channel.owners).toEqual([{ kind: "entity", entityId: "persisted-guest" }]);
    expect(secondRequest.startSeconds).toBe(90);
    expect(secondRequest.publicationTarget).toBe("draft");
  });

  it("registers a medley track as a draft cover and prepares the next segment", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      songs: [
        {
          id: "song-medley",
          slug: "song-medley",
          title: "메들리 기존 곡",
          normalizedTitle: "메들리 기존 곡",
          isOtwOriginal: false,
          originalReleaseDate: null,
          originalReleasePrecision: "unknown",
          archivedAt: null,
          version: 0,
          tags: [],
          aliases: [{ alias: "Medley Song", locale: null, aliasKind: null }],
          originalArtists: [],
        },
      ],
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    const dialog = screen.getByRole("dialog", { name: "새 YouTube 영상 등록" });
    expect(within(dialog).queryByLabelText("시작 위치(초)")).toBeNull();
    expect(within(dialog).queryByLabelText("종료 위치(초)")).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "구간 선택" }));
    expect(within(dialog).getByLabelText("시작 위치(초)")).toBeTruthy();
    expect(within(dialog).getByLabelText("종료 위치(초)")).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.change(within(dialog).getByLabelText("시작 위치(초)"), {
      target: { value: "10" },
    });
    fireEvent.change(within(dialog).getByLabelText("종료 위치(초)"), {
      target: { value: "90" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
    await waitFor(() =>
      expect(preflightEntryMock).toHaveBeenCalledWith({
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        startSeconds: 10,
        endSeconds: 90,
      }),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
    fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), {
      target: { value: "Medley Song" },
    });
    fireEvent.click(
      await within(dialog).findByRole("option", { name: /메들리 기존 곡/ }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(
      await within(dialog).findByRole("option", { name: /현재 멤버/ }),
    );
    expect(within(dialog).getByRole("button", { name: "메들리 수록" })).toBeTruthy();
    expect(within(dialog).queryByLabelText("선택한 커버 영상 라벨")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
    expect(within(dialog).getByText("메들리 구간")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "게시" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));

    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          registrationMode: "medley_segment",
          relationType: "cover",
          startSeconds: 10,
          endSeconds: 90,
          song: { kind: "existing", songId: "song-medley" },
          publicationTarget: "draft",
        }),
      ),
    );
    const savedRequest = createEntryMock.mock.calls.at(-1)?.[0];
    expect(savedRequest).not.toHaveProperty("performanceTags");
    expect(await within(dialog).findByText("메들리 커버 구간을 임시 저장했습니다.")).toBeTruthy();

    fireEvent.click(
      within(dialog).getByRole("button", { name: "같은 영상의 다음 커버 추가" }),
    );
    expect(within(dialog).getByLabelText("시작 위치(초)")).toHaveProperty("value", "90");
    expect(within(dialog).getByLabelText("종료 위치(초)")).toHaveProperty("value", "180");
    expect(within(dialog).getByLabelText("YouTube URL")).toHaveProperty(
      "value",
      "https://youtu.be/dQw4w9WgXcQ",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
    await waitFor(() =>
      expect(preflightEntryMock).toHaveBeenLastCalledWith({
        youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
        startSeconds: 90,
        endSeconds: 180,
      }),
    );
  });

  it("reuses a new external identity across integrated registration fields", async () => {
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "중복 방지 원곡" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "DECO*27" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));

    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "DECO*27" },
    });
    expect(screen.getByText("동일한 이름의 주체가 이미 있습니다. 위 후보를 선택하세요."))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: /외부 인물로 추가/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: /DECO\*27/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    await waitFor(() => expect(createEntryMock).toHaveBeenCalledTimes(1));
    const request = createEntryMock.mock.calls[0]?.[0];
    expect(request.song.kind).toBe("create");
    expect(request.song.originalArtists[0]?.subject.kind).toBe("new_external");
    expect(request.participants[0]?.subject).toEqual(
      request.song.originalArtists[0]?.subject,
    );
  });

  it("requires selecting an exact saved external identity instead of creating a duplicate", async () => {
    fetchCatalogMock.mockResolvedValue({
      ...catalog,
      entities: [{
        id: "entity-deco-27",
        memberUid: null,
        entityKind: "person",
        displayName: "DECO*27",
        normalizedName: "deco*27",
        slug: "deco-27",
        version: 0,
        archivedAt: null,
      }],
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "  deco*27  " },
    });

    expect(await screen.findByRole("option", { name: /DECO\*27/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /외부 인물로 추가/ })).toBeNull();
    expect(screen.getByText("동일한 이름의 주체가 이미 있습니다. 위 후보를 선택하세요."))
      .toBeTruthy();
  });

  it("ignores a registration return URL without an in-memory draft", async () => {
    render(createElement(ConsoleSearchContext.Provider, { value: [{ tab: "channels", view: "channel-edit", from: "play-registration", channel: `UC${"Z".repeat(22)}` }, vi.fn()] },
      createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: "channels" })), { wrapper: createQueryWrapper() });
    await screen.findByLabelText("YouTube channel ID");
    expect(screen.getByLabelText("YouTube channel ID")).toHaveProperty("value", "");
    expect(screen.queryByRole("button", { name: "작성 중인 곡으로 돌아가기" })).toBeNull();
    expect(lookupChannelMock).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "official", failure: "none" }, { kind: "broadcast", failure: "none" },
    { kind: "broadcast", failure: "approval" }, { kind: "broadcast", failure: "duplicate" },
    { kind: "broadcast", failure: "version" }, { kind: "broadcast", failure: "recheck" },
  ] as const)("registers and restores $kind with $failure failure handling", async ({ kind, failure }) => {
    const channel = { id: "new-channel", externalChannelId: `UC${"N".repeat(22)}`, displayName: "신규 채널", provider: "youtube", channelRole: kind === "broadcast" ? "approved_kirinuki" : "project_official", verificationStatus: "pending", active: false, entityIds: [], version: 0 };
    const preflight = { catalogRevision: 7, video: { videoId: "dQw4w9WgXcQ", title: "영상 제목", durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable", thumbnailUrl: null, channelId: channel.externalChannelId, channelTitle: channel.displayName }, channel: { state: "unknown", catalogChannelId: null, verificationStatus: null, active: false, channelRole: null, memberUid: null }, duplicate: null };
    preflightEntryMock.mockResolvedValue(preflight);
    lookupChannelMock.mockResolvedValue({ externalChannelId: channel.externalChannelId, displayName: channel.displayName });
    createChannelMock.mockImplementationOnce(async () => {
      fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [channel] });
      if (failure === "duplicate") throw new Error("Channel already exists");
      return { data: channel };
    });
    if (failure === "approval") updateChannelMock.mockRejectedValueOnce(new Error("Approval failed"));
    if (failure === "version") updateChannelMock.mockImplementationOnce(async () => {
      fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, channelRole: "member_music", version: 2 }] });
      throw new Error("Version conflict");
    });
    updateChannelMock.mockImplementationOnce(async input => {
      fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, ...input, version: 1 }] });
      preflightEntryMock.mockResolvedValue({ ...preflight, channel: { ...preflight.channel, state: "approved", catalogChannelId: channel.id, verificationStatus: "approved", active: true, channelRole: channel.channelRole } });
      return {};
    });
    function RegistrationPage() {
      const [search, setSearch] = useState<ConsoleSearch>({ tab: "catalog", kind, q: "보존할 검색" });
      return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(current => ({ ...current, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: search.tab === "channels" ? "channels" : "catalog" }));
    }
    render(createElement(RegistrationPage), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: kind === "broadcast" ? "새 노래 클립 등록" : "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    fireEvent.click(await screen.findByRole("button", { name: "이 채널 등록하기" }));
    expect(await screen.findByLabelText("YouTube channel ID")).toHaveProperty("value", channel.externalChannelId);
    await waitFor(() => expect(screen.getByLabelText("채널 표시명")).toHaveProperty("value", channel.displayName));
    expect(screen.queryByText("등록된 채널")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "채널 등록" }));
    await screen.findByRole("button", { name: "채널 수정 저장" });
    expect(createChannelMock).toHaveBeenCalledWith(expect.objectContaining({ channelRole: channel.channelRole, externalChannelId: channel.externalChannelId }));
    expect(updateChannelMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("combobox", { name: "채널 검수 상태" }));
    fireEvent.click(await screen.findByRole("option", { name: "승인됨" }));
    fireEvent.click(screen.getByLabelText("이 채널 영상 사용 허용"));
    fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
    if (failure === "approval") {
      await screen.findByText("채널을 저장하지 못했습니다. 입력은 유지되어 있으니 다시 시도하세요.");
      expect(screen.getByLabelText("이 채널 영상 사용 허용").getAttribute("data-state")).toBe("checked");
      fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
    }
    if (failure === "version") {
      await screen.findByText("다른 작업에서 저장된 최신 채널을 불러왔습니다. 승인 상태와 용도를 확인한 뒤 다시 저장하세요.");
      expect(screen.getByRole("combobox", { name: "채널 역할" }).textContent).toContain("멤버 노래 채널");
      expect(updateChannelMock).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("combobox", { name: "채널 역할" }));
      fireEvent.click(await screen.findByRole("option", { name: "승인 키리누키" }));
      fireEvent.click(screen.getByRole("combobox", { name: "채널 검수 상태" }));
      fireEvent.click(await screen.findByRole("option", { name: "승인됨" }));
      fireEvent.click(screen.getByLabelText("이 채널 영상 사용 허용"));
      fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
    }
    if (failure === "recheck") {
      await screen.findByRole("button", { name: "설정 완료 · 곡 등록으로 돌아가기" });
      preflightEntryMock.mockRejectedValueOnce(new Error("Readback failed"));
    }
    fireEvent.click(await screen.findByRole("button", { name: "설정 완료 · 곡 등록으로 돌아가기" }));
    if (failure === "recheck") {
      await screen.findByRole("button", { name: "채널 상태 다시 확인" });
      expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
      expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "https://youtu.be/dQw4w9WgXcQ");
      fireEvent.click(screen.getByRole("button", { name: "채널 상태 다시 확인" }));
    }
    await screen.findByText("채널 확인 완료 · 계속 입력하세요.");
    expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "https://youtu.be/dQw4w9WgXcQ");
    expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false);
    expect(preflightEntryMock).toHaveBeenCalledTimes(failure === "recheck" ? 3 : 2);
    expect(createChannelMock).toHaveBeenCalledTimes(1);
    expect(createEntryMock).not.toHaveBeenCalled();
  });

  it("opens the selected channel as a page and returns to the same review draft after saving", async () => {
    const channel = { id: "channel-1", externalChannelId: `UC${"A".repeat(22)}`, displayName: "검수 채널", provider: "youtube", channelRole: "approved_kirinuki", verificationStatus: "approved", active: true, entityIds: [], version: 3 };
    fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [channel] });
    reviewRowsMock.mockResolvedValue({ items: [{ id: "youtube:BBBBBBBBBBB", kind: "candidate", candidateKind: "singing_clip", sources: ["playlist"], title: "검수할 노래", version: 1, status: "needs_input", createdAt: 1, channelId: channel.externalChannelId,
      candidate: { candidateId: "youtube:BBBBBBBBBBB", candidateVersion: 1, videoId: "BBBBBBBBBBB", title: "검수할 노래", channelTitle: channel.displayName, thumbnailUrl: null, durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable", status: "needs_input", classification: "eligible", exclusionReason: null, catalogChannelId: channel.id, reviewInput: null, linkedPerformanceId: null, discoveredAt: 1, monitorGeneration: 0, retentionExpiresAt: 9999999999999 },
    }], nextCursor: null });
    function ReviewChannelPage() {
      const [search, setSearch] = useState<ConsoleSearch>({ tab: "import", view: "review", selected: "youtube:BBBBBBBBBBB", category: "job-1", source: "playlist" });
      return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(current => ({ ...current, ...patch }))] },
        createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: search.tab === "channels" ? "channels" : "import" }));
    }
    render(createElement(ReviewChannelPage), { wrapper: createQueryWrapper() });
    fireEvent.change(await screen.findByLabelText("시작 위치(초)"), { target: { value: "42" } });
    fireEvent.click(screen.getByRole("button", { name: "채널 승인·수집 설정" }));
    expect(await screen.findByLabelText("YouTube channel ID")).toHaveProperty("value", channel.externalChannelId);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("등록된 채널")).toBeNull();
    lookupChannelMock.mockResolvedValueOnce({ externalChannelId: channel.externalChannelId, displayName: "수정한 채널" });
    fireEvent.click(screen.getByRole("button", { name: "채널 조회" }));
    await waitFor(() => expect(screen.getByLabelText("채널 표시명")).toHaveProperty("value", "수정한 채널"));
    updateChannelMock.mockImplementationOnce(async () => { fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, displayName: "수정한 채널", version: 4 }] }); return {}; });
    fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
    await waitFor(() => expect(updateChannelMock).toHaveBeenCalledWith(expect.objectContaining({ id: channel.id, expectedVersion: 3, displayName: "수정한 채널" })));
    await screen.findByText("version 4");
    fireEvent.click(screen.getByRole("button", { name: "작성 중인 검수로 돌아가기" }));
    const review = await screen.findByRole("region", { name: "노래 클립 검수 화면" });
    expect(within(review).getByLabelText("시작 위치(초)")).toHaveProperty("value", "42");
    fireEvent.click(within(review).getByRole("button", { name: "검수 목록으로" }));
    expect(screen.getByLabelText("검수 가져오기 이력").textContent).toContain("job-1");
    expect(screen.getByLabelText("검수 출처").textContent).toBe("플레이리스트");
  });

  it("maps legacy clip links to the catalog filter and allows changing a legacy automatic filter", async () => {
    function LegacyPanel({ tab }: { tab: string }) {
      const [search, setSearch] = useState<ConsoleSearch>({ tab });
      return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(previous => ({ ...previous, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: tab === "clips" ? "catalog" : "automatic-review" }));
    }
    const view = render(createElement(LegacyPanel, { tab: "clips" }), { wrapper: createQueryWrapper() });
    expect(await screen.findByRole("button", { name: "새 노래 클립 등록" })).toBeTruthy();
    expect(screen.getByLabelText("카탈로그 영상 종류").textContent).toBe("노래 클립");
    view.unmount();
    render(createElement(LegacyPanel, { tab: "automatic-review" }), { wrapper: createQueryWrapper() });
    const source = await screen.findByLabelText("검수 출처");
    expect(source.textContent).toBe("자동 수집");
    await selectOption("검수 출처", "플레이리스트");
    expect(source.textContent).toBe("플레이리스트");
  });

  it("deletes a channel directly from its row after confirmation and refreshes the list", async () => {
    const channel = { id: "delete-channel", provider: "youtube", externalChannelId: `UC${"D".repeat(22)}`, displayName: "삭제 대상", channelRole: "approved_kirinuki", verificationStatus: "pending", active: false, entityIds: [], version: 3 };
    fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [channel] });
    deleteChannelMock.mockImplementation(async () => { fetchCatalogMock.mockResolvedValue(catalog); return { data: { id: channel.id }, catalogRevision: 8 }; });
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "채널" }));
    fireEvent.click(await openSecondaryAction("삭제 대상 채널 삭제"));
    await waitFor(() => expect(deleteChannelMock).toHaveBeenCalledWith(channel.id, { expectedVersion: 3 }));
    expect(confirmationMock).toHaveBeenCalledWith(expect.objectContaining({ title: "삭제 대상 채널을 삭제할까요?" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "삭제 대상 채널 삭제 메뉴" })).toBeNull());
  });

  it("keeps the channel when row deletion is cancelled", async () => {
    fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ id: "keep-channel", externalChannelId: `UC${"D".repeat(22)}`, displayName: "유지 대상", channelRole: "approved_kirinuki", verificationStatus: "pending", active: false, entityIds: [], version: 0 }] });
    confirmationMock.mockResolvedValueOnce(false);
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "채널" }));
    fireEvent.click(await openSecondaryAction("유지 대상 채널 삭제"));
    await waitFor(() => expect(confirmationMock).toHaveBeenCalled());
    expect(deleteChannelMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "유지 대상 채널 삭제 메뉴" })).toBeTruthy();
  });

  it("unifies review and channel navigation and separates people from channels", async () => {
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("tab", { name: "가져오기/검수" }));
    expect(await screen.findByRole("region", { name: "통합 검수 목록" })).toBeTruthy();
    expect(screen.getByLabelText("검수 출처")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "채널" }));
    expect(await screen.findByRole("heading", { name: "Play 채널" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "외부 인물·그룹" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "카탈로그" }));
    fireEvent.click(screen.getByRole("button", { name: "인물·그룹" }));
    expect(screen.getByRole("heading", { name: "외부 인물·그룹" })).toBeTruthy();
  });

  it("shows the actionable preflight API error and request id", async () => {
    preflightEntryMock.mockRejectedValueOnce(
      new ApiError("YouTube metadata is temporarily unavailable", 503, {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        fields: { youtube: "YouTube metadata request returned 403" },
        requestId: "request-preflight-1",
      }),
    );
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: {
        value:
          "https://www.youtube.com/watch?v=ASRCBcCY_qE&list=RDASRCBcCY_qE&start_radio=1",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "YouTube metadata request returned 403",
    );
    expect(screen.getByRole("alert").textContent).toContain(
      "request-preflight-1",
    );
  });

  it("uses original-song participants as original artists without a song-link step", async () => {
    await openVideoRegistration();
    await screen.findByText(/멤버 채널 자동 인식/);
    expect(screen.queryByLabelText("시작 위치(초)")).toBeNull();
    expect(screen.queryByLabelText("종료 위치(초)")).toBeNull();
    expect(screen.getByText("전체 영상 · 180초")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
    fireEvent.change(screen.getByLabelText("시작 위치(초)"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("종료 위치(초)"), {
      target: { value: "90" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
    expect(screen.queryByLabelText("시작 위치(초)")).toBeNull();
    expect(screen.queryByLabelText("종료 위치(초)")).toBeNull();
    expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    expect(preflightEntryMock).toHaveBeenLastCalledWith({
      youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
      startSeconds: 0,
      endSeconds: null,
    });
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          relationType: "original",
          song: { kind: "from_video" },
          startSeconds: 0,
          endSeconds: 180,
        }),
      ),
    );
  });

  it("requires clip channel approval when switching to karaoke without losing the video", async () => {
    await openVideoRegistration();
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /노래방송/ }));

    expect(
      screen.getByRole("alert"),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /다음/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createEntryMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /이전/ }));
    expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "https://youtu.be/dQw4w9WgXcQ");
    expect(screen.getByText("확인된 영상")).toBeTruthy();
  });

  it("registers karaoke from the main catalog and continues with the next song segment", async () => {
    const dirtyStates = new Map<string, boolean>();
    const confirmDiscard = vi.fn();
    preflightEntryMock.mockResolvedValue({ catalogRevision: 7,
      video: { videoId: "dQw4w9WgXcQ", title: "방송 노래 모음", durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable", thumbnailUrl: null, channelId: `UC${"K".repeat(22)}`, channelTitle: "승인 클립 채널" },
      channel: { state: "approved", catalogChannelId: "clip-channel", verificationStatus: "approved", active: true, channelRole: "approved_kirinuki", memberUid: null }, duplicate: null });
    render(createElement(UnsavedChangesContext.Provider, { value: {
      register: (id, dirty) => { dirtyStates.set(id, dirty); }, confirm: confirmDiscard,
    } }, createElement(OtwPlayCatalogManager)), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
    fireEvent.change(screen.getByLabelText("시작 위치(초)"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("종료 위치(초)"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: /노래방송/ }));
    expect(screen.queryByText(/지원하지 않습니다/)).toBeNull();
    fireEvent.change(screen.getByLabelText("기존 곡 검색"), { target: { value: "방송 첫 곡" } });
    fireEvent.click(screen.getByRole("option", { name: /새 곡 입력/ }));
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), { target: { value: "원곡 가수" } });
    fireEvent.click(screen.getByRole("button", { name: "외부 인물로 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), { target: { value: "현재 멤버" } });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.change(screen.getByLabelText("방송일 (선택)"), { target: { value: "2026-09-15" } });
    fireEvent.keyDown(screen.getByLabelText("가창 범위"), { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "일부 가창" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByText("방송 첫 곡")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "게시" })).toBeNull();
    createEntryMock.mockRejectedValueOnce(new Error("저장 재시도"));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "저장 재시도");
    expect(screen.getByText("방송 첫 곡")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await screen.findByText("노래방송 가창 구간을 임시 저장했습니다.");
    expect([...dirtyStates.values()].some(Boolean)).toBe(false);
    expect(screen.getByLabelText("카탈로그 영상 종류").textContent).toBe("공식 곡");
    expect(createEntryMock).toHaveBeenLastCalledWith(expect.objectContaining({
      registrationMode: "standard", relationType: "singing_clip", releaseType: "broadcast", publicationTarget: "draft",
      startSeconds: 10, endSeconds: 90, channel: { kind: "existing", channelId: "clip-channel" },
      song: expect.objectContaining({ kind: "create", title: "방송 첫 곡", isOtwOriginal: false }),
      broadcast: { performedOn: "2026-09-15", dateEvidence: null, originalUrl: null, extent: "partial" },
    }));
    fireEvent.click(screen.getByRole("button", { name: "같은 영상의 다음 곡 추가" }));
    expect([...dirtyStates.values()].some(Boolean)).toBe(true);
    expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "90");
    expect(screen.getByLabelText("종료 위치(초)")).toHaveProperty("value", "180");
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("button", { name: /노래방송/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.change(screen.getByLabelText("기존 곡 검색"), { target: { value: "방송 다음 곡" } });
    fireEvent.click(screen.getByRole("option", { name: /새 곡 입력/ }));
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), { target: { value: "다음 원곡 가수" } });
    fireEvent.click(screen.getByRole("button", { name: "외부 인물로 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByLabelText("방송일 (선택)")).toHaveProperty("value", "2026-09-15");
    expect(screen.getByLabelText("가창 범위").textContent).toBe("확인 필요 — 게시 전 선택");
    expect(screen.getByLabelText("현재 멤버 역할")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
    await screen.findByText("노래방송 가창 구간을 임시 저장했습니다.");
    expect(createEntryMock).toHaveBeenLastCalledWith(expect.objectContaining({
      registrationMode: "standard", relationType: "singing_clip", releaseType: "broadcast", startSeconds: 90, endSeconds: 180,
      song: expect.objectContaining({ title: "방송 다음 곡" }),
      broadcast: expect.objectContaining({ extent: null }),
    }));
    expect(screen.getByRole("button", { name: "같은 영상의 다음 곡 추가" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "완료" }));
    await waitFor(() => expect(screen.getByLabelText("카탈로그 영상 종류").textContent).toBe("노래 클립"));
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it("requires an explicit owner before saving an unknown channel", async () => {
    preflightEntryMock.mockResolvedValueOnce({
      catalogRevision: 7,
      video: {
        videoId: "dQw4w9WgXcQ",
        title: "미등록 채널 영상",
        thumbnailUrl: null,
        durationSeconds: 180,
        publishedAt: 1,
        availabilityStatus: "playable",
        channelId: `UC${"U".repeat(22)}`,
        channelTitle: "미등록 채널",
      },
      channel: {
        state: "unknown",
        catalogChannelId: null,
        verificationStatus: null,
        active: false,
        channelRole: null,
        memberUid: null,
      },
      duplicate: null,
    });
    renderCatalogManager();

    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText("채널: 미등록");
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "미등록 채널 원곡" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "미등록 채널 원곡 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));

    const nextButton = screen.getByRole("button", { name: /다음/ });
    expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("채널 소유·연결 주체 검색"), {
      target: { value: "현재 멤버" },
    });
    const currentMemberButtons = await screen.findAllByRole("option", {
      name: /현재 멤버/,
    });
    fireEvent.click(currentMemberButtons[currentMemberButtons.length - 1]!);
    expect((nextButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(nextButton);
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    await waitFor(() =>
      expect(createEntryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicationTarget: "draft",
          channel: expect.objectContaining({
            kind: "pending",
            owners: [{ kind: "member", memberUid: 1 }],
          }),
        }),
      ),
    );
  });

  it("keeps the registration step and chips after an integrated command failure", async () => {
    createEntryMock.mockRejectedValueOnce(new Error("stale revision"));
    await openVideoRegistration();
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
    fireEvent.change(screen.getByLabelText("원곡 제목"), {
      target: { value: "실패 후 보존 원곡" },
    });
    fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
      target: { value: "입력 보존 가수" },
    });
    fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
      target: { value: "현재 멤버" },
    });
    fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));

    expect((await screen.findByRole("alert")).textContent).toContain("stale revision");
    expect(screen.getByRole("dialog", { name: "새 YouTube 영상 등록" })).toBeTruthy();
    expect(screen.getAllByText(/현재 멤버/).length).toBeGreaterThan(0);
    expect(screen.getByText("실패 후 보존 원곡")).toBeTruthy();
    expect(screen.getByText(/입력 보존 가수/)).toBeTruthy();
  });
});
