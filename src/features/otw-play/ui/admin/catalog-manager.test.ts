// @vitest-environment jsdom
import { createElement } from "react";
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
import { createQueryWrapper } from "@/test/query-client";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";

const fetchCatalogMock = vi.hoisted(() => vi.fn());
const fetchProposalsMock = vi.hoisted(() => vi.fn());
const fetchSourceHealthMock = vi.hoisted(() => vi.fn());
const fetchObservabilityMock = vi.hoisted(() => vi.fn());
const fetchReleaseMock = vi.hoisted(() => vi.fn());
const fetchChannelMonitorsMock = vi.hoisted(() => vi.fn());
const updateReleaseMock = vi.hoisted(() => vi.fn());
const recheckSourceMock = vi.hoisted(() => vi.fn());
const updateEntityMock = vi.hoisted(() => vi.fn());
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

vi.mock("../../api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/admin")>();
  return {
    ...actual,
    fetchOtwPlayAdminCatalog: fetchCatalogMock,
    fetchOtwPlayAdminProposals: fetchProposalsMock,
    fetchOtwPlayAdminSourceHealth: fetchSourceHealthMock,
    fetchOtwPlayAdminObservability: fetchObservabilityMock,
    fetchOtwPlayAdminRelease: fetchReleaseMock,
    fetchOtwPlayChannelMonitors: fetchChannelMonitorsMock,
    updateOtwPlayAdminRelease: updateReleaseMock,
    recheckOtwPlaySource: recheckSourceMock,
    updateOtwPlayEntity: updateEntityMock,
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

const catalog = {
  revision: 7,
  readModelRevision: 7,
  songs: [],
  performances: [],
  entities: [],
  channels: [],
};

const proposal = {
  id: "proposal-1",
  submittedByUserId: "member-1",
  submittedUrl: "https://youtu.be/dQw4w9WgXcQ",
  youtubeVideoId: "dQw4w9WgXcQ",
  segmentStartSeconds: 0,
  submittedTitle: "검수할 공식 커버",
  suggestedSongId: null,
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

describe("OtwPlayCatalogManager", () => {
  beforeEach(() => {
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
    createEntryMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    deleteSongMock.mockResolvedValue({ data: { id: "song-draft" }, catalogRevision: 8 });
    deletePerformanceMock.mockResolvedValue({ data: { id: "performance-draft" }, catalogRevision: 8 });
  });

  it("loads source health only after section entry and distinguishes retryable outages", async () => {
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    await screen.findByText("OTW Play 카탈로그");
    expect(fetchSourceHealthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "소스 상태" }));
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
    await waitFor(() => expect(fetchCatalogMock.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(fetchSourceHealthMock.mock.calls.length).toBeGreaterThan(1));
  });

  it("loads observability, release, and source health only after operations entry", async () => {
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    await screen.findByText("OTW Play 카탈로그");
    expect(fetchObservabilityMock).not.toHaveBeenCalled();
    expect(fetchReleaseMock).not.toHaveBeenCalled();
    expect(fetchSourceHealthMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "운영·공개" }));
    expect(await screen.findByRole("heading", { name: "운영·공개 권위" })).toBeTruthy();
    await waitFor(() => expect(fetchObservabilityMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchReleaseMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(fetchSourceHealthMock).toHaveBeenCalledOnce());
    expect(screen.getByText(/Analytics 조회 token/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /공개 API canary 시작/ })).toBeTruthy();
  });

  it("keeps the operations and rollback path reachable when catalog loading fails", async () => {
    fetchCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "관리자 카탈로그를 불러오지 못했습니다",
    );
    fireEvent.click(screen.getByRole("button", { name: "운영·공개" }));

    expect(
      await screen.findByRole("heading", { name: "운영·공개 권위" }),
    ).toBeTruthy();
    expect(fetchReleaseMock).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /공개 API canary 시작/ })).toBeTruthy();
  });

  it("refreshes release, observability, and source health after an audited switch", async () => {
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("button", { name: "운영·공개" }));
    const trigger = await screen.findByRole("button", { name: /공개 API canary 시작/ });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "권위 상태 변경" }));

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
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    await screen.findByText("OTW Play 카탈로그");
    fireEvent.click(screen.getByRole("button", { name: "소스 상태" }));
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
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    const player = await screen.findByTitle("검수할 공식 커버 검수 영상");
    expect(player.getAttribute("src")).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    const approveButton = screen.getByRole("button", {
      name: "확인 후 승인·게시",
    }) as HTMLButtonElement;
    expect(approveButton.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "영상·채널 확인" }));
    await waitFor(() => expect(preflightEntryMock).toHaveBeenCalledWith({
      youtubeUrl: proposal.submittedUrl,
      startSeconds: 0,
    }));
    fireEvent.change(screen.getByLabelText("곡명"), {
      target: { value: "관리자가 정정한 곡명" },
    });
    fireEvent.click(screen.getByRole("button", { name: "K-POP" }));
    const songTagInput = screen.getByLabelText("음악 분류");
    fireEvent.change(songTagInput, { target: { value: "K POP" } });
    fireEvent.keyDown(songTagInput, { key: "Enter" });
    expect(
      within(screen.getByLabelText("선택한 음악 분류")).getAllByText("K-POP"),
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
            tags: ["K-POP"],
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

  it("requires an explicit channel owner and preserves new group identities", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    fireEvent.click(screen.getByRole("button", { name: "영상·채널 확인" }));
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

  it("discards a late preflight response after switching proposals", async () => {
    let resolvePreflight!: (value: Awaited<ReturnType<typeof preflightEntryMock>>) => void;
    preflightEntryMock.mockReturnValueOnce(new Promise((resolve) => {
      resolvePreflight = resolve;
    }));
    fetchProposalsMock.mockResolvedValueOnce([
      proposal,
      { ...proposal, id: "proposal-2", submittedTitle: "두 번째 제안" },
    ]);
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    fireEvent.click(screen.getByRole("button", { name: "영상·채널 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 제안" }));
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
    expect(screen.getAllByText("두 번째 제안").length).toBeGreaterThan(0);
    expect(screen.queryByText("channel unknown")).toBeNull();
  });

  it("keeps a selected channel owner stable when an earlier participant is removed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
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
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    fireEvent.click(screen.getByRole("button", { name: "영상·채널 확인" }));
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
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    fireEvent.click(screen.getByLabelText("승인할 곡 선택"));
    expect(await screen.findByRole("option", { name: "활성 곡" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "보관 곡" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByLabelText("1번째 원곡 가수 identity"));
    expect(await screen.findByRole("option", { name: "활성 인물" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "보관 인물" })).toBeNull();
  });

  it("preserves an unresolved submitted member UID during approval", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    fetchProposalsMock.mockResolvedValueOnce([{
      ...proposal,
      participants: [{
        ...proposal.participants[0],
        submittedMemberUid: 1,
        resolvedEntityId: null,
      }],
    }]);
    render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    fireEvent.click(screen.getByRole("button", { name: "영상·채널 확인" }));
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "제안 검수" }));
    const rejectButton = await screen.findByRole("button", { name: "거절" });
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

  it("keeps advanced identity edits after a failed command without exposing slug editing", async () => {
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "고급 관리" }));
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

  it("presents advanced channel data as a labeled correction form", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    fireEvent.click(await screen.findByRole("button", { name: "고급 관리" }));

    expect(screen.getByText("채널 수동 등록")).toBeTruthy();
    expect(screen.getByText(/예외 보정용/)).toBeTruthy();
    const channelId = screen.getByLabelText("YouTube channel ID");
    const displayName = screen.getByLabelText("채널 표시명");
    const submit = screen.getByRole("button", { name: "채널 확인 후 등록" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(channelId, { target: { value: `UC${"F".repeat(22)}` } });
    fireEvent.change(displayName, { target: { value: "정리된 공식 채널" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByLabelText("채널 역할")).toBeTruthy();
    expect(screen.getByText("등록된 채널")).toBeTruthy();
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

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
    expect(within(dialog).getByLabelText("공식 채널")).toBeTruthy();
    expect(within(dialog).getByLabelText("시작 위치(초)")).toBeTruthy();
    expect(within(dialog).getByLabelText("종료 위치(초)")).toBeTruthy();
    expect(within(dialog).getByLabelText("source 역할")).toBeTruthy();
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
    fireEvent.click(within(dialog).getByLabelText("source 역할"));
    fireEvent.click(await screen.findByRole("option", { name: "대체 source" }));
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
      participants: [
        {
          subject: { kind: "member", memberUid: 1 },
          participantRole: "featured_vocal",
          creditOrder: 0,
          creditNameSnapshot: "수정한 멤버 크레딧",
        },
      ],
      source: {
        youtubeUrl: "https://youtu.be/ASRCBcCY_qE",
        channelId: "channel-approved",
        startSeconds: 12,
        endSeconds: 170,
        sourceRole: "alternate",
      },
    });
  });

  it("disables catalog writes while the public read model revision is stale", async () => {
    fetchCatalogMock.mockResolvedValueOnce({
      ...catalog,
      revision: 8,
      readModelRevision: 7,
    });
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "관리자 쓰기를 중단했습니다",
    );
    fireEvent.click(screen.getByRole("button", { name: "고급 관리" }));
    expect(
      (screen.getByRole("button", { name: "채널 확인 후 등록" }) as HTMLButtonElement)
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

    await screen.findAllByText("임시 곡");
    const songDeleteButtons = screen.getAllByRole("button", { name: "곡 삭제" });
    const enabledSongDeletes = songDeleteButtons.filter(
      (button) => !(button as HTMLButtonElement).disabled,
    );
    const disabledSongDeletes = songDeleteButtons.filter(
      (button) => (button as HTMLButtonElement).disabled,
    );
    expect(enabledSongDeletes).toHaveLength(4);
    expect(disabledSongDeletes).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "임시 곡 가창 펼치기" }));
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" })[0]!);
    expect(screen.getByText("임시 저장 가창을 삭제할까요?")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
    await waitFor(() =>
      expect(deletePerformanceMock).toHaveBeenCalledWith(
        "performance-draft",
        { expectedVersion: 3 },
      ),
    );

    fireEvent.click(enabledSongDeletes[0]!);
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
      within(withdrawnRow!).getByRole("button", { name: "삭제" }),
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
      within(withdrawnSongRow!).getByRole("button", { name: "곡 삭제" }),
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    await screen.findByRole("button", { name: "새 영상 등록" });
    expect(screen.getByRole("button", { name: "카탈로그" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "제안 검수" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "자동 검수" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "곡" })).toBeNull();
    expect(screen.queryByRole("button", { name: "가창" })).toBeNull();
    expect(screen.queryByRole("button", { name: "공식 채널" })).toBeNull();
    expect(screen.queryByRole("button", { name: "인물·그룹" })).toBeNull();

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

  it("opens automatic upload review in its own workflow tab", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    await screen.findByRole("button", { name: "새 영상 등록" });
    expect(screen.queryByText("신규 업로드 자동 검수 제안")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "자동 검수" }));

    expect(await screen.findByText("신규 업로드 자동 검수 제안")).toBeTruthy();
    expect(screen.getByLabelText("수집 대상 채널 ID")).toBeTruthy();
  });

  it("shows the actionable preflight API error and request id", async () => {
    preflightEntryMock.mockRejectedValueOnce(
      new ApiError("YouTube metadata is temporarily unavailable", 503, {
        code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
        fields: { youtube: "YouTube metadata request returned 403" },
        requestId: "request-preflight-1",
      }),
    );
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
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
        }),
      ),
    );
  });

  it("keeps karaoke broadcasts out of the current catalog command", async () => {
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
    await screen.findByText(/멤버 채널 자동 인식/);
    fireEvent.click(screen.getByRole("button", { name: /다음/ }));
    fireEvent.click(screen.getByRole("button", { name: /노래방송/ }));

    expect(
      screen.getByText(/다곡·타임스탬프 연결 기능이 준비될 때까지/),
    ).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: /다음/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(createEntryMock).not.toHaveBeenCalled();
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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });

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
    render(createElement(OtwPlayCatalogManager), {
      wrapper: createQueryWrapper(),
    });
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
      target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
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
