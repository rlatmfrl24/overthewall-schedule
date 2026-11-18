// Import this module before catalog components so their dependencies receive these mocks.
import { createAdminCatalogFixture, createReviewItemFixture } from "../../test/catalog-fixtures";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { OtwPlayCatalogManager } from "./catalog-manager";
import { createQueryWrapper as queryWrapper, createTestQueryClient as newQueryClient } from "@/test/query-client";
const confirmationMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/shared/lib/confirmation", () => ({ useConfirmation: () => confirmationMock }));
const fetchCatalogMock = vi.hoisted(() => vi.fn());
const reviewRowsMock = vi.hoisted(() => vi.fn());
const fetchImportJobMock = vi.hoisted(() => vi.fn(async () => null as unknown));
const fetchProposalsMock = vi.hoisted(() => vi.fn());
const fetchSourceHealthMock = vi.hoisted(() => vi.fn());
const fetchChannelMonitorsMock = vi.hoisted(() => vi.fn());
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
vi.mock("../../api/work-queue", () => ({ workQueueQueryKey: ["otw-play-work-queues"], fetchWorkQueues: async () => ({ data: { queues: [], activeBatch: null, deferred: [], deferredCursor: null } }), fetchWorkBatch: vi.fn() }));
vi.mock("../../api/admin", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../../api/admin")>();
    return {
        ...actual,
        fetchOtwPlayReviewItems: reviewRowsMock,
        fetchOtwPlayImportJobs: async () => ({ data: [], nextCursor: null }),
        fetchOtwPlayImportJob: fetchImportJobMock,
        fetchOtwPlayIngestionBudget: async () => ({ status: "available" }),
        fetchOtwPlayAdminCatalog: fetchCatalogMock,
        fetchOtwPlayAdminProposals: fetchProposalsMock,
        fetchOtwPlayAdminSourceHealth: fetchSourceHealthMock,
        fetchOtwPlayChannelMonitors: fetchChannelMonitorsMock,
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
export let catalog = createAdminCatalogFixture();
export const linkedPerformance = {
    id: "performance", songId: "song", relationType: "cover" as const, releaseType: "official_video" as const,
    participationType: "solo" as const, publicationStatus: "published" as const, qualityStatus: "ok" as const,
    releasedAt: null, internalNote: null, version: 1, participants: [], sources: [],
};
export const selectOption = async (label: string, option: string | RegExp) => {
    fireEvent.click(await screen.findByRole("combobox", { name: label }));
    fireEvent.click(await screen.findByRole("option", { name: option }));
};
const createProposal = () => ({
    id: "proposal-1",
    submittedByUserId: "member-1",
    historicalProvenance: null,
    historicalReview: false,
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
    createdAt: 1788000000000,
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
});
export let proposal = createProposal();
export const openSecondaryAction = async (name: string, trigger?: HTMLElement) => {
    fireEvent.keyDown(trigger ?? await screen.findByRole("button", { name: `${name} 메뉴` }), { key: "Enter" });
    return screen.findByRole("menuitem", { name });
};
export async function openOperationsTab(name: "채널" | "인물·그룹") {
    fireEvent.click(await screen.findByRole("tab", { name: "운영" }));
    const operations = screen.getByRole("tablist", { name: "Play 운영 영역" });
    fireEvent.click(within(operations).getByRole("tab", { name }));
}
export const openBulkPublication = async () => {
    fireEvent.click(await openSecondaryAction("미게시 곡 모두 게시", await screen.findByRole("button", { name: "게시 옵션" })));
};
export const renderCatalogManager = () => render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
export const openVideoRegistration = async () => {
    renderCatalogManager();
    fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
    fireEvent.change(screen.getByLabelText("YouTube URL"), {
        target: { value: "https://youtu.be/dQw4w9WgXcQ" },
    });
    fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
};
const queryClients = new Set<ReturnType<typeof newQueryClient>>();
export function createTestQueryClient() {
    const client = newQueryClient();
    queryClients.add(client);
    return client;
}
export const createQueryWrapper = () => queryWrapper(createTestQueryClient());
let scrollIntoView: PropertyDescriptor | undefined;
beforeEach(() => {
    vi.resetAllMocks();
    catalog = createAdminCatalogFixture();
    proposal = createProposal();
    fetchImportJobMock.mockResolvedValue(null);
    scrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    confirmationMock.mockResolvedValue(true);
    reviewRowsMock.mockResolvedValue({ items: [createReviewItemFixture()], nextCursor: null });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: vi.fn(),
    });
    fetchCatalogMock.mockResolvedValue(catalog);
    fetchProposalsMock.mockResolvedValue([proposal]);
    fetchChannelMonitorsMock.mockResolvedValue([]);
    createChannelMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    lookupChannelMock.mockResolvedValue({
        externalChannelId: `UC${"F".repeat(22)}`,
        displayName: "정리된 공식 채널",
    });
    updateChannelMock.mockResolvedValue({ data: {}, catalogRevision: 8 });
    publishPerformanceMock.mockResolvedValue({});
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
afterEach(() => {
    cleanup();
    for (const client of queryClients)
        client.clear();
    queryClients.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (scrollIntoView)
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scrollIntoView);
    else
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
export { confirmationMock, fetchCatalogMock, reviewRowsMock, fetchImportJobMock, fetchProposalsMock, fetchSourceHealthMock, fetchChannelMonitorsMock, recheckSourceMock, updateEntityMock, deleteEntityMock, createChannelMock, lookupChannelMock, updateChannelMock, deleteChannelMock, updateSongMock, updatePerformanceMock, preflightEntryMock, createEntryMock, deleteSongMock, deletePerformanceMock, publishPerformanceMock, fetchMembersMock, rejectProposalMock, approveProposalMock, toastMock };
