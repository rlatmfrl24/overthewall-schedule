// @vitest-environment jsdom
import { fetchCatalogMock, reviewRowsMock, updateSongMock, updatePerformanceMock, deleteSongMock, deletePerformanceMock, publishPerformanceMock, toastMock, catalog, linkedPerformance, selectOption, openSecondaryAction, openOperationsTab, openBulkPublication, renderCatalogManager, createTestQueryClient, createQueryWrapper } from "./catalog-manager.test-support";
import { createElement, useState } from "react";
import { ConsoleSearchContext, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";
describe("OtwPlayCatalogManager catalog", () => {
    it("hides songs without performances from every catalog scope, counts and category filters", async () => {
        const songs = ["공식곡", "클립곡", "가창없는곡"].map((title, index) => ({
            id: `song-${index}`, title, isOtwOriginal: false, archivedAt: null, version: 1,
            tags: [index === 2 ? "ORPHAN" : "POP"], aliases: [], originalArtists: [],
        }));
        fetchCatalogMock.mockResolvedValue({ ...catalog, songs, performances: [
                { ...linkedPerformance, id: "official", songId: songs[0]!.id, publicationStatus: "draft" },
                { ...linkedPerformance, id: "broadcast", songId: songs[1]!.id, relationType: "singing_clip", releaseType: "broadcast", publicationStatus: "withdrawn" },
            ] });
        renderCatalogManager();
        await screen.findByText("1곡 중 1곡 · 1곡 표시");
        expect(screen.getByText("곡 2 · 가창 2")).toBeTruthy();
        expect(screen.getAllByText("공식곡")).toHaveLength(2);
        expect(screen.queryByText("클립곡")).toBeNull();
        expect(screen.queryByText("가창없는곡")).toBeNull();
        await selectOption("카탈로그 영상 종류", "전체");
        expect(await screen.findByText("2곡 중 2곡 · 2곡 표시")).toBeTruthy();
        expect(screen.getAllByText("클립곡")).toHaveLength(2);
        expect(screen.queryByText("가창없는곡")).toBeNull();
        fireEvent.click(screen.getByRole("combobox", { name: "곡 분류" }));
        expect(screen.queryByRole("option", { name: "ORPHAN" })).toBeNull();
        fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
        await selectOption("카탈로그 영상 종류", "노래 클립");
        expect(screen.getByText("1곡 중 1곡 · 1곡 표시")).toBeTruthy();
        expect(screen.queryByText("공식곡")).toBeNull();
        expect(screen.queryByText("가창없는곡")).toBeNull();
        fetchCatalogMock.mockResolvedValue({ ...catalog, songs: [songs[2]], performances: [] });
        await waitFor(() => expect(screen.getByRole("button", { name: "상태 새로고침" })).toHaveProperty("disabled", false));
        fireEvent.click(screen.getByRole("button", { name: "상태 새로고침" }));
        await screen.findByText("0곡 중 0곡 · 0곡 표시");
        expect(screen.getByText("곡 0 · 가창 0")).toBeTruthy();
        expect(screen.getByText(/연결된 가창이 있는 곡이 없습니다/)).toBeTruthy();
        await selectOption("카탈로그 영상 종류", "공식 곡");
        expect(screen.queryByText("가창없는곡")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
        fireEvent.click(screen.getByRole("button", { name: "다음" }));
        fireEvent.change(screen.getByLabelText("기존 곡 검색"), { target: { value: "가창없는곡" } });
        expect(screen.getByRole("option", { name: /가창없는곡/ })).toBeTruthy();
    });
    it("summarizes scoped states, labels expanded details and protects songs published in another scope", async () => {
        const performance = {
            id: "official-draft", songId: "shared-song", relationType: "cover", releaseType: "official_video",
            participationType: "solo", publicationStatus: "draft", qualityStatus: "ok", releasedAt: null,
            internalNote: null, version: 1, participants: [], sources: [],
        };
        fetchCatalogMock.mockResolvedValue({ ...catalog,
            songs: [{ id: "shared-song", title: "공통 곡", isOtwOriginal: false, archivedAt: null, version: 1, tags: [], aliases: [], originalArtists: [] }],
            performances: [performance, { ...performance, id: "broadcast-published", releaseType: "broadcast", publicationStatus: "published" }],
        });
        renderCatalogManager();
        const songs = await screen.findByRole("table", { name: "곡 카탈로그" });
        expect(within(songs).getByText("1개 가창")).toBeTruthy();
        expect(within(songs).getByText("비공개 1")).toBeTruthy();
        expect(within(songs).queryByText("게시됨 1")).toBeNull();
        const deleteItem = await openSecondaryAction("곡 삭제", within(songs).getByRole("button", { name: "곡 작업 메뉴" }));
        expect(deleteItem.getAttribute("aria-disabled")).toBe("true");
        expect(document.getElementById(deleteItem.getAttribute("aria-describedby")!)?.textContent).toBe("다른 영상 종류를 포함해 게시 중인 가창이 있어 삭제할 수 없습니다.");
        expect(screen.getByRole("menuitem", { name: "다른 가창 추가" })).toBeTruthy();
        fireEvent.keyDown(deleteItem, { key: "Escape" });
        const toggle = within(songs).getByRole("button", { name: "공통 곡 가창 펼치기" });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        fireEvent.click(toggle);
        expect(toggle.getAttribute("aria-expanded")).toBe("true");
        const details = screen.getByRole("row", { name: "공통 곡 가창 1" });
        expect(within(songs).queryByRole("table")).toBeNull();
        expect(within(songs).getByRole("columnheader", { name: "곡 / 가창" })).toBeTruthy();
        expect(within(details).getByText("연결된 영상 없음")).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "곡명·원곡 가수 검색" }), { target: { value: "없는 곡" } });
        fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
        expect(screen.getByText("1곡 중 1곡 · 1곡 표시")).toBeTruthy();
    });
    it("appends catalog rows on intersection, stops at the end and resets on search", async () => {
        const observers: {
            notify: (visible: boolean) => void;
            disconnect: ReturnType<typeof vi.fn>;
        }[] = [];
        vi.stubGlobal("IntersectionObserver", class {
            disconnect = vi.fn();
            observe = vi.fn();
            unobserve = vi.fn();
            constructor(callback: IntersectionObserverCallback) {
                observers.push({
                    notify: (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
                    disconnect: this.disconnect,
                });
            }
        });
        try {
            const songs = Array.from({ length: 60 }, (_, index) => ({
                id: `song-${index}`, title: `Song ${index}`, isOtwOriginal: false,
                archivedAt: null, version: 0, tags: [], aliases: [], originalArtists: [],
            }));
            fetchCatalogMock.mockResolvedValue({ ...catalog, songs, performances: songs.map(song => ({ ...linkedPerformance, id: `performance-${song.id}`, songId: song.id })) });
            renderCatalogManager();
            await screen.findByText("60곡 중 60곡 · 25곡 표시");
            expect(screen.queryByRole("button", { name: "다음" })).toBeNull();
            const first = observers.at(-1)!;
            act(() => first.notify(false));
            expect(screen.getByText("60곡 중 60곡 · 25곡 표시")).toBeTruthy();
            act(() => { first.notify(true); first.notify(true); });
            expect(screen.getByText("60곡 중 60곡 · 50곡 표시")).toBeTruthy();
            expect(screen.getAllByText("Song 0")).toHaveLength(2);
            expect(screen.getAllByText("Song 49")).toHaveLength(2);
            expect(first.disconnect).toHaveBeenCalled();
            const last = observers.at(-1)!;
            act(() => last.notify(true));
            expect(screen.getByText("60곡 중 60곡 · 60곡 표시")).toBeTruthy();
            expect(screen.getByText("모든 곡을 표시했습니다.")).toBeTruthy();
            expect(screen.queryByRole("button", { name: "곡 더 보기" })).toBeNull();
            fireEvent.change(screen.getByRole("textbox", { name: "곡명·원곡 가수 검색" }), { target: { value: "Song" } });
            expect(screen.getByText("60곡 중 60곡 · 25곡 표시")).toBeTruthy();
            act(() => last.notify(true));
            expect(screen.getByText("60곡 중 60곡 · 25곡 표시")).toBeTruthy();
            expect(fetchCatalogMock).toHaveBeenCalledOnce();
        }
        finally {
            vi.unstubAllGlobals();
        }
    }, 15000);
    it("keeps all active categories across appended batches, category changes and empty searches", async () => {
        const songs = Array.from({ length: 26 }, (_, index) => ({
            id: `song-${index}`, title: `Song ${index}`, isOtwOriginal: false,
            archivedAt: null, version: 0, tags: [index < 25 ? "POP" : "J-POP"], aliases: [], originalArtists: [],
        }));
        fetchCatalogMock.mockResolvedValue({ ...catalog, songs: [...songs, { ...songs[0], id: "archived", archivedAt: 1, tags: ["ARCHIVED"] }], performances: [...songs, { id: "archived" }].map(song => ({ ...linkedPerformance, id: `performance-${song.id}`, songId: song.id })) });
        renderCatalogManager();
        const category = await screen.findByRole("combobox", { name: "곡 분류" });
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
        fireEvent.click(screen.getByRole("button", { name: "곡 더 보기" }));
        expect(await options()).toEqual(["모든 분류", "J-POP", "POP"]);
        await selectCategory("POP");
        expect(await options()).toContain("J-POP");
        await selectCategory("J-POP");
        expect(screen.getByText("26곡 중 1곡 · 1곡 표시")).toBeTruthy();
        fireEvent.change(screen.getByRole("textbox", { name: "곡명·원곡 가수 검색" }), { target: { value: "no matching song" } });
        expect(screen.getByText(/조건에 맞는 곡이 없습니다/)).toBeTruthy();
        expect(await options()).toEqual(["모든 분류", "J-POP", "POP"]);
        expect(category.textContent).toBe("J-POP");
        await selectCategory("모든 분류");
        expect(category.textContent).toBe("모든 분류");
    });
    it.each([false, true])("edits original artists as reusable chips and preserves an accepted retry (%s)", async (acceptedRetry) => {
        if (acceptedRetry)
            updateSongMock.mockRejectedValueOnce(new ApiError("동시 변경이 발생했습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요.", 409, { code: "CONTENT_CONFLICT" }));
        fetchCatalogMock.mockResolvedValue({
            ...catalog,
            performances: [{ ...linkedPerformance, songId: "song-edit" }],
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
        expect(updateSongMock).toHaveBeenCalledWith(expect.objectContaining({
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
        }), expect.stringMatching(/^[A-Za-z0-9_-]{16,100}$/));
        if (acceptedRetry) {
            await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: "error", description: expect.stringContaining("동시 변경") })));
            expect(within(dialog).getByLabelText("곡명")).toHaveProperty("value", "수정한 곡");
            expect(screen.getByRole("dialog", { name: "곡 정보 수정" })).toBeTruthy();
            const first = updateSongMock.mock.calls[0];
            fireEvent.click(within(dialog).getByRole("button", { name: "저장" }));
            await waitFor(() => expect(updateSongMock).toHaveBeenCalledTimes(2));
            expect(updateSongMock.mock.calls[1]).toEqual(first);
            await waitFor(() => expect(screen.queryByRole("dialog", { name: "곡 정보 수정" })).toBeNull());
        }
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
        fireEvent.click(screen.getByRole("button", { name: "기존 연결 곡 가창 펼치기" }));
        const performanceRow = within(screen.getByRole("table", { name: "곡 카탈로그" })).getAllByText("비공개")[0]!.closest("tr");
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
        fireEvent.click(within(dialog).getByRole("button", { name: "기존 외부 인물 제거" }));
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
        fireEvent.click(within(performanceTagInput.parentElement?.parentElement as HTMLElement).getByRole("button", { name: "추가" }));
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
        }, expect.any(String));
    });
    it("disables catalog writes while the public read model revision is stale", async () => {
        fetchCatalogMock.mockResolvedValue({
            ...catalog,
            revision: 8,
            readModelRevision: 7,
        });
        renderCatalogManager();
        expect((await screen.findByRole("alert")).textContent).toContain("편집할 수 없습니다");
        await openOperationsTab("채널");
        expect((await screen.findByRole("button", { name: "채널 등록" }) as HTMLButtonElement)
            .disabled).toBe(true);
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
        for (const [title, disabled] of [["임시 곡", false], ["게시 이력 곡", true], ["철회 곡", false]] as const) {
            const row = screen.getAllByText(title)[0]!.closest("tr")!;
            const item = await openSecondaryAction("곡 삭제", within(row).getByRole("button", { name: "곡 작업 메뉴" }));
            expect(item.getAttribute("aria-disabled") === "true").toBe(disabled);
            fireEvent.keyDown(item, { key: "Escape" });
        }
        fireEvent.click(screen.getByRole("button", { name: "임시 곡 가창 펼치기" }));
        fireEvent.click(await openSecondaryAction("삭제", screen.getAllByRole("button", { name: "가창 작업 메뉴" })[0]!));
        expect(screen.getByText("임시 저장 가창을 삭제할까요?")).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
        await waitFor(() => expect(deletePerformanceMock).toHaveBeenCalledWith("performance-draft", { expectedVersion: 3 }, expect.any(String)));
        const draftSongRow = screen.getAllByText("임시 곡")[0]!.closest("tr")!;
        fireEvent.click(await openSecondaryAction("곡 삭제", within(draftSongRow).getByRole("button", { name: "곡 작업 메뉴" })));
        expect(screen.getByText("곡을 삭제할까요?")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "삭제" }));
        await waitFor(() => expect(deleteSongMock).toHaveBeenCalledWith("song-draft", {
            expectedVersion: 2,
        }, expect.any(String)));
        fireEvent.click(screen.getByRole("button", { name: "철회 곡 가창 펼치기" }));
        const withdrawnStatus = within(screen.getByRole("table")).getByText("철회됨");
        const withdrawnRow = withdrawnStatus.closest("tr");
        expect(withdrawnRow).toBeTruthy();
        fireEvent.click(await openSecondaryAction("삭제", within(withdrawnRow!).getByRole("button", { name: "가창 작업 메뉴" })));
        expect(screen.getByText("철회된 가창을 삭제할까요?")).toBeTruthy();
        fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);
        await waitFor(() => expect(deletePerformanceMock).toHaveBeenCalledWith("performance-withdrawn", { expectedVersion: 6 }, expect.any(String)));
        const withdrawnSongTitle = screen.getAllByText("철회 곡")[0]!;
        const withdrawnSongRow = withdrawnSongTitle.closest("tr");
        expect(withdrawnSongRow).toBeTruthy();
        fireEvent.click(await openSecondaryAction("곡 삭제", within(withdrawnSongRow!).getByRole("button", { name: "곡 작업 메뉴" })));
        expect(screen.getByText(/철회 1개 포함/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "삭제" }));
        await waitFor(() => expect(deleteSongMock).toHaveBeenCalledWith("song-withdrawn", {
            expectedVersion: 5,
        }, expect.any(String)));
    }, 15000);
    it.each([false, true])("publishes every visible draft from one catalog action and preserves failed or accepted drafts (accepted=%s)", async (accepted) => {
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
            .mockRejectedValueOnce(accepted ? new ApiError("동시 변경이 발생했습니다.", 409, { code: "CONTENT_CONFLICT" }) : new Error("channel approval changed"));
        renderCatalogManager();
        await openBulkPublication();
        expect(screen.getByText("미게시 곡을 모두 게시할까요?")).toBeTruthy();
        expect(screen.getByText(/실패 항목은 임시 저장 상태로 유지/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "2개 게시" }));
        await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(1));
        expect(publishPerformanceMock).toHaveBeenNthCalledWith(1, "performance-draft-one", { expectedVersion: 3 }, expect.any(String));
        expect(publishPerformanceMock).not.toHaveBeenCalledWith("performance-draft-two", expect.anything());
        resolveFirstPublish?.();
        await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(2));
        expect(publishPerformanceMock).toHaveBeenNthCalledWith(2, "performance-draft-two", { expectedVersion: 5 }, expect.any(String));
        expect(publishPerformanceMock).not.toHaveBeenCalledWith("performance-withdrawn", expect.anything());
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
            variant: "info",
            description: accepted ? "1개 게시 완료 · 1개 게시 실패. 동시 변경이 발생했습니다." : "1개를 게시했고 1개는 검증 실패 또는 동시 변경으로 임시 저장 상태를 유지했습니다.",
        }));
        if (accepted) {
            const originalKey = publishPerformanceMock.mock.calls[1]![2];
            await openBulkPublication();
            fireEvent.click(screen.getByRole("button", { name: "2개 게시" }));
            await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(4));
            expect(publishPerformanceMock.mock.calls[3]![2]).toBe(originalKey);
        }
    });
    it("maps legacy clip links to the catalog and automatic links to the import list", async () => {
        function LegacyPanel({ tab }: {
            tab: string;
        }) {
            const [search, setSearch] = useState<ConsoleSearch>({ tab });
            return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(previous => ({ ...previous, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: tab === "clips" ? "catalog" : "automatic-review" }));
        }
        const view = render(createElement(LegacyPanel, { tab: "clips" }), { wrapper: createQueryWrapper() });
        expect(await screen.findByRole("button", { name: "새 노래 클립 등록" })).toBeTruthy();
        expect(screen.getByLabelText("카탈로그 영상 종류").textContent).toBe("노래 클립");
        view.unmount();
        render(createElement(LegacyPanel, { tab: "automatic-review" }), { wrapper: createQueryWrapper() });
        expect(await screen.findByRole("heading", { name: "플레이리스트 가져오기" })).toBeTruthy();
        expect(screen.queryByLabelText("검수 출처")).toBeNull();
        expect(reviewRowsMock).not.toHaveBeenCalled();
    });
    it("keeps page order across revisions without loading the full catalog", async () => {
        const pageCatalog = { ...catalog, revision: 7, readModelRevision: 7, songs: [{ id: "page-one", title: "First server page", archivedAt: null, originalArtists: [], aliases: [], tags: [], version: 0, isOtwOriginal: false }], performances: [{ ...linkedPerformance, songId: "page-one" }] };
        fetchCatalogMock.mockImplementation(async (query) => query?.cursor ? { ...pageCatalog, revision: 8, readModelRevision: 8, paged: true, nextCursor: null, songs: [{ ...pageCatalog.songs[0], id: 'page-two', title: 'Second server page' }], performances: [{ ...catalog.performances[0], id: 'page-two-performance', songId: 'page-two' }] } : { ...pageCatalog, paged: true, nextCursor: 'next-server-page' });
        render(createElement(OtwPlayCatalogManager), { wrapper: createQueryWrapper() });
        await screen.findAllByText("First server page");
        expect(fetchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ limit: 25, scope: 'official', cursor: null }));
        fireEvent.click(screen.getByRole('button', { name: '곡 더 보기' }));
        await screen.findAllByText('Second server page');
        expect(screen.getAllByText('First server page')[0].compareDocumentPosition(screen.getAllByText('Second server page')[0])).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
        expect(fetchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ cursor: 'next-server-page', limit: 25 }));
    });
    it("shows matching video states and publishes only the checked private performance", async () => {
        const song = { id: "selected-song", slug: "selected-song", title: "선택 게시 확인곡", originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const draft = { ...linkedPerformance, id: "draft-selected", songId: song.id, publicationStatus: "draft" as const, version: 4 };
        const otherDraft = { ...draft, id: "draft-unselected" };
        const published = { ...linkedPerformance, id: "already-published", songId: song.id };
        fetchCatalogMock.mockResolvedValue({ ...catalog, songs: [song], performances: [draft, otherDraft, published] });
        renderCatalogManager();
        const filters = await screen.findByRole("group", { name: "게시 상태" });
        fireEvent.click(within(filters).getByRole("button", { name: "비공개" }));
        const table = screen.getByRole("table", { name: "곡 카탈로그" });
        const selections = within(table).getAllByRole("checkbox", { name: "선택 게시 확인곡 게시 선택" });
        expect(selections).toHaveLength(2);
        expect(within(table).queryByText("게시됨")).toBeNull();
        fireEvent.click(selections[0]!);
        expect(screen.getByText("영상 1개 선택")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "선택 항목 게시" }));
        expect(publishPerformanceMock).not.toHaveBeenCalled();
        const dialog = await screen.findByRole("alertdialog", { name: "선택한 영상을 게시할까요?" });
        fireEvent.click(within(dialog).getByRole("button", { name: "1개 게시" }));
        await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledExactlyOnceWith(draft.id, { expectedVersion: 4 }, expect.any(String)));
        fireEvent.click(within(filters).getByRole("button", { name: "게시됨" }));
        expect(within(table).queryByRole("checkbox")).toBeNull();
    });
    it("publishes all draft targets after explicitly reading beyond the server page", async () => {
        const song = { id: 'bulk-song', slug: 'bulk-song', title: 'Bulk song', normalizedTitle: 'bulk song', originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const draft = { ...linkedPerformance, id: 'bulk-one', songId: song.id, publicationStatus: 'draft' as const };
        const other = { ...draft, id: 'bulk-two' };
        fetchCatalogMock.mockImplementation(async (query) => query ? { ...catalog, paged: true, nextCursor: null, songs: [song], performances: [draft] } : { ...catalog, songs: [song], performances: [draft, other] });
        renderCatalogManager();
        await openBulkPublication();
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: '2개 게시' }));
        await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledTimes(2));
        expect(publishPerformanceMock.mock.calls.map(call => call[0])).toEqual(['bulk-one', 'bulk-two']);
        expect(fetchCatalogMock).toHaveBeenCalledWith();
    });
    it("selects an off-page existing participant while editing a performance", async () => {
        const song = { id: 'edit-page-song', slug: 'edit-page-song', title: 'Edit page song', originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const performance = { ...linkedPerformance, id: 'edit-page-performance', songId: song.id, publicationStatus: 'draft' as const, sources: [{ source: { id: 'edit-source', provider: 'youtube' as const, externalId: 'dQw4w9WgXcQ', channelId: 'edit-channel', title: null, thumbnailUrl: null, durationSeconds: 180, providerPublishedAt: null, availabilityStatus: 'playable' as const, lastCheckedAt: null, version: 0 }, startSeconds: 0, endSeconds: null, sourceRole: 'official' as const, priority: 0, isPrimary: true }] };
        const external = { id: 'off-page-vocal', memberUid: null, entityKind: 'person' as const, displayName: 'Off page vocalist', normalizedName: 'off page vocalist', slug: 'off-page-vocal', archivedAt: null, version: 0 };
        fetchCatalogMock.mockImplementation(async (query) => query?.lookup === 'entities' ? { ...catalog, entities: [external] } : { ...catalog, paged: true, nextCursor: null, songs: [song], performances: [performance] });
        renderCatalogManager();
        fireEvent.click(await screen.findByRole('button', { name: 'Edit page song 가창 펼치기' }));
        const row = within(screen.getByRole("table", { name: "곡 카탈로그" })).getAllByText("비공개")[0]!.closest('tr')!;
        fireEvent.click(within(row).getByRole('button', { name: '수정' }));
        const dialog = screen.getByRole('dialog', { name: '가창 정보 수정' });
        fireEvent.change(within(dialog).getByLabelText('가창 참여자 검색'), { target: { value: 'Off page vocalist' } });
        fireEvent.click(await within(dialog).findByRole('option', { name: /Off page vocalist/ }));
        fireEvent.click(within(dialog).getByRole('button', { name: '전체 정보 저장' }));
        await waitFor(() => expect(updatePerformanceMock).toHaveBeenCalledWith(expect.objectContaining({ id: performance.id, participants: [expect.objectContaining({ subject: { kind: 'entity', entityId: external.id } })] }), expect.any(String)));
    });
    it("shows a retryable error when full publication preparation fails", async () => {
        fetchCatalogMock.mockImplementation(async (query) => {
            if (!query)
                throw new Error("catalog unavailable");
            return { ...catalog, paged: true, nextCursor: null };
        });
        renderCatalogManager();
        await openBulkPublication();
        expect((await screen.findByRole("alert")).textContent).toContain("전체 게시 대상을 불러오지 못했습니다");
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(publishPerformanceMock).not.toHaveBeenCalled();
        fetchCatalogMock.mockResolvedValue(catalog);
        await openBulkPublication();
        expect(await screen.findByText("현재 영상 종류에 게시할 수 있는 비공개 영상이 없습니다.")).toBeTruthy();
        expect(screen.queryByRole("alertdialog")).toBeNull();
        expect(publishPerformanceMock).not.toHaveBeenCalled();
    });
    it("keeps global publication reachable from an empty filtered server page", async () => {
        const song = { id: 'hidden-draft-song', slug: 'hidden-draft-song', title: 'Off page draft', originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const draft = { ...linkedPerformance, id: 'off-page-draft', songId: song.id, publicationStatus: 'draft' as const };
        fetchCatalogMock.mockImplementation(async (query) => query ? { ...catalog, paged: true, nextCursor: null } : { ...catalog, songs: [song], performances: [draft] });
        render(createElement(ConsoleSearchContext.Provider, { value: [{ q: 'no matching song' }, vi.fn()] }, createElement(OtwPlayCatalogManager)), { wrapper: createQueryWrapper() });
        await screen.findByRole('search', { name: '카탈로그 필터' });
        await waitFor(() => expect(fetchCatalogMock).toHaveBeenCalledWith(expect.objectContaining({ q: 'no matching song' })));
        expect(screen.getByText('조건에 맞는 곡이 없습니다. 검색어를 바꾸거나 필터를 초기화해 주세요.')).toBeTruthy();
        await openBulkPublication();
        const dialog = await screen.findByRole('alertdialog');
        fireEvent.click(within(dialog).getByRole('button', { name: '1개 게시' }));
        await waitFor(() => expect(publishPerformanceMock).toHaveBeenCalledWith(draft.id, expect.anything(), expect.any(String)));
    });
    it("reports a failed off-page selection and retries it without hiding the catalog", async () => {
        const visible = { id: "visible", slug: "visible", title: "Visible review song", normalizedTitle: "visible review song", originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const selected = { ...visible, id: "off-page", slug: "off-page", title: "Selected review song" };
        let failed = true;
        fetchCatalogMock.mockImplementation(async (query) => {
            if (query?.songId && failed)
                throw new ApiError("selection unavailable", 503, { code: "PLAY_ADMIN_INTERNAL_ERROR" });
            const song = query?.songId ? selected : visible;
            return { ...catalog, paged: true, nextCursor: null, songs: [song], performances: [{ ...linkedPerformance, id: "p-" + song.id, songId: song.id }] };
        });
        const client = createTestQueryClient();
        render(createElement(QueryClientProvider, { client }, createElement(ConsoleSearchContext.Provider, { value: [{ selected: selected.id }, vi.fn()] }, createElement(OtwPlayCatalogManager))));
        await screen.findAllByText(visible.title);
        expect((await screen.findByRole("alert")).textContent).toContain("선택한 곡을 불러오지 못했습니다");
        expect(screen.queryAllByText(visible.title).length).toBeGreaterThan(0);
        failed = false;
        fireEvent.click(screen.getByRole("button", { name: "선택한 곡 다시 불러오기" }));
        await screen.findAllByText(selected.title);
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
        client.clear();
    });
    it("keeps current page references when an older off-page selection fails to refresh", async () => {
        const visible = { id: "visible", slug: "visible", title: "Visible review song", normalizedTitle: "visible review song", originalArtists: [], tags: [], aliases: [], archivedAt: null, version: 0, isOtwOriginal: false };
        const offPage = { ...visible, id: "off-page", slug: "off-page", title: "Off page review song" };
        const current = { id: "shared-artist", entityKind: "person" as const, memberUid: null, displayName: "Current artist", normalizedName: "current artist", slug: "shared-artist", version: 3, archivedAt: null };
        const old = { ...current, displayName: "Old artist", normalizedName: "old artist", version: 1 };
        const page = { ...catalog, revision: 9, readModelRevision: 9, paged: true as const, nextCursor: null, songs: [visible], performances: [{ ...linkedPerformance, songId: visible.id }], entities: [current] };
        const selected = { ...page, revision: 7, readModelRevision: 7, songs: [offPage], performances: [{ ...linkedPerformance, id: "off-page-performance", songId: offPage.id }], entities: [old] };
        fetchCatalogMock.mockImplementation(async (query) => {
            if (query?.songId)
                throw new ApiError("selection unavailable", 503, { code: "PLAY_ADMIN_INTERNAL_ERROR" });
            if (query?.lookup)
                return { ...catalog, paged: true, nextCursor: null };
            return page;
        });
        const client = createTestQueryClient();
        const key = [...queryKeys.otwPlay.adminCatalog(), "selected", offPage.id, "official", undefined, undefined, undefined];
        client.setQueryData(key, selected);
        render(createElement(QueryClientProvider, { client }, createElement(ConsoleSearchContext.Provider, { value: [{ selected: offPage.id }, vi.fn()] }, createElement(OtwPlayCatalogManager))));
        await screen.findAllByText(visible.title);
        await waitFor(() => expect(client.getQueryState(key)?.status).toBe("error"));
        fireEvent.click(screen.getAllByRole("button", { name: "곡 정보 수정" })[0]);
        const dialog = await screen.findByRole("dialog", { name: "곡 정보 수정" });
        fireEvent.change(within(dialog).getByLabelText("원곡 가수 검색"), { target: { value: "artist" } });
        expect(within(dialog).queryByRole("option", { name: /Current artist/ })).not.toBeNull();
        expect(within(dialog).queryByRole("option", { name: /Old artist/ })).toBeNull();
        client.clear();
    });
});
