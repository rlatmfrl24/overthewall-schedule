// @vitest-environment jsdom
import { fetchCatalogMock, createChannelMock, lookupChannelMock, updateChannelMock, preflightEntryMock, createEntryMock, publishPerformanceMock, catalog, selectOption, renderCatalogManager, openVideoRegistration, createQueryWrapper } from "./catalog-manager.test-support";
import { createElement, useState } from "react";
import { ConsoleSearchContext, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";
describe("OtwPlayCatalogManager registration", () => {
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
            broadcast: { performedOn: null, dateEvidence: null, originalUrl: null, extent: null } }), expect.any(String)));
        expect(publishPerformanceMock).not.toHaveBeenCalled();
    });
    it("shows only workflow sections and suggests current members without a prerequisite identity screen", async () => {
        renderCatalogManager();
        await screen.findByRole("button", { name: "새 영상 등록" });
        expect(screen.getByRole("tab", { name: "카탈로그" })).toBeTruthy();
        expect(screen.queryByRole("tab", { name: "채널" })).toBeNull();
        expect(screen.getByRole("tab", { name: "가져오기" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "채널 감시" })).toBeNull();
        expect(screen.queryByRole("button", { name: "곡" })).toBeNull();
        expect(screen.queryByRole("button", { name: "가창" })).toBeNull();
        expect(screen.queryByRole("button", { name: "채널" })).toBeNull();
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
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        expect(screen.queryByText("기존 곡 연결")).toBeNull();
        expect(screen.queryByText("새 곡 만들기")).toBeNull();
        const coverNext = screen.getByRole("button", { name: /다음/ });
        expect((coverNext as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("곡 제목"), {
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
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
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
        }), expect.any(String)));
    });
    it("connects an existing song in an ordinary cover and keeps optional performance details through review", async () => {
        fetchCatalogMock.mockResolvedValue({ ...catalog, songs: [{
                    id: "existing-song", slug: "existing-song", title: "기존 곡", normalizedTitle: "기존 곡",
                    isOtwOriginal: false, originalReleaseDate: null, originalReleasePrecision: "unknown",
                    archivedAt: null, version: 0, tags: ["J-POP"], aliases: [{ alias: "Existing Song", locale: null, aliasKind: null }],
                    originalArtists: [{ entityId: "original-artist", displayName: "기존 원곡 가수", creditOrder: 0, isPrimary: true }],
                }] });
        await openVideoRegistration();
        await screen.findByRole("region", { name: "등록 채널 상태" });
        expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("기존 곡 검색"), { target: { value: "Existing Song" } });
        fireEvent.click(screen.getByRole("option", { name: /기존 곡/ }));
        expect(screen.queryByLabelText("곡 제목")).toBeNull();
        expect(screen.queryByLabelText("원곡 가수 검색")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("가창 참여자 검색"), { target: { value: "현재 멤버" } });
        fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
        await selectOption("현재 멤버 역할", "기타");
        const optionalSummary = screen.getByText("가창 라벨·내부 메모 (선택)");
        expect(optionalSummary.closest("details")?.hasAttribute("open")).toBe(false);
        fireEvent.click(optionalSummary);
        fireEvent.change(screen.getByLabelText("가창 라벨"), { target: { value: "라이브" } });
        fireEvent.keyDown(screen.getByLabelText("가창 라벨"), { key: "Enter" });
        fireEvent.change(screen.getByLabelText("내부 메모 (선택)"), { target: { value: "현장 라이브 버전" } });
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        expect(screen.getByText("라이브")).toBeTruthy();
        expect(screen.getByText(/현장 라이브 버전/)).toBeTruthy();
        expect(screen.queryByRole("button", { name: "AI로 자동 채우기" })).toBeNull();
        expect(screen.getByRole("button", { name: "임시 저장" })).toHaveProperty("disabled", false);
        expect(screen.getByRole("button", { name: "게시" })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: /이전/ }));
        fireEvent.click(screen.getByText(/^가창 라벨·내부 메모 \(선택\)/));
        expect(screen.getByLabelText("내부 메모 (선택)")).toHaveProperty("value", "현장 라이브 버전");
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            song: { kind: "existing", songId: "existing-song" }, relationType: "cover",
            performanceTags: ["라이브"], internalNote: "현장 라이브 버전", publicationTarget: "draft",
            participants: [expect.objectContaining({ participantRole: "other" })],
        }), expect.any(String)));
    });
    it("closes URL-only source inspection without confirmation and protects an actual registration draft", async () => {
        const dirtyStates = new Map<string, boolean>();
        const confirmDiscard = vi.fn(async () => false);
        render(createElement(UnsavedChangesContext.Provider, { value: {
                register: (id, dirty) => { dirtyStates.set(id, dirty); }, confirm: confirmDiscard,
            } }, createElement(OtwPlayCatalogManager)), { wrapper: createQueryWrapper() });
        fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        expect([...dirtyStates.values()].some(Boolean)).toBe(false);
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close|닫기/ }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(confirmDiscard).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), { target: { value: "보존할 곡 입력" } });
        expect([...dirtyStates.values()].some(Boolean)).toBe(true);
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close|닫기/ }));
        await waitFor(() => expect(confirmDiscard).toHaveBeenCalledTimes(1));
        expect(screen.getByLabelText("곡 제목")).toHaveProperty("value", "보존할 곡 입력");
        expect(createEntryMock).not.toHaveBeenCalled();
    });
    it("ignores a late video preflight after closing source inspection and reopening registration", async () => {
        const preflight = await preflightEntryMock();
        preflightEntryMock.mockClear();
        let completePreflight!: (value: typeof preflight) => void;
        preflightEntryMock.mockImplementationOnce(() => new Promise<typeof preflight>(resolve => { completePreflight = resolve; }));
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        expect(preflightEntryMock).toHaveBeenCalledTimes(1);
        fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Close|닫기/ }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        fireEvent.click(screen.getByRole("button", { name: "새 영상 등록" }));
        expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "");
        expect(screen.getByLabelText("YouTube URL")).toHaveProperty("disabled", false);
        await act(async () => completePreflight(preflight));
        expect(screen.queryByRole("region", { name: "등록 채널 상태" })).toBeNull();
        expect(screen.queryByText("확인된 영상")).toBeNull();
        expect(screen.getByLabelText("YouTube URL")).toHaveProperty("value", "");
        expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
        expect(createEntryMock).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false);
        expect(preflightEntryMock).toHaveBeenCalledTimes(2);
    });
    it.each(["checkbox", "video kind"])("restores editable new-song fields when leaving medley through %s", async (transition) => {
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
        const dialog = screen.getByRole("dialog", { name: "새 YouTube 영상 등록" });
        fireEvent.change(within(dialog).getByLabelText("YouTube URL"), {
            target: { value: "https://youtu.be/dQw4w9WgXcQ" },
        });
        fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
        await within(dialog).findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(await within(dialog).findByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
        fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
        await waitFor(() => expect(within(dialog).getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false));
        fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), {
            target: { value: "새 커버 원곡" },
        });
        fireEvent.click(within(dialog).getByRole("option", { name: /새 곡 입력/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: /이전/ }));
        if (transition === "checkbox") {
            fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
        }
        else {
            fireEvent.click(within(dialog).getByRole("button", { name: /오리지널곡/ }));
            fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
        }
        fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        expect(within(dialog).getByLabelText("곡 제목")).toHaveProperty("value", "새 커버 원곡");
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
        }), expect.any(String)));
    });
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
        const confirmVideo = async (first = false) => {
            fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
            await within(dialog).findByRole("region", { name: "등록 채널 상태" });
            if (first) {
                fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
                fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
                fireEvent.change(within(dialog).getByLabelText("채널 소유·연결 주체 검색"), {
                    target: { value: "메들리 외부 가창자" },
                });
                fireEvent.click(within(dialog).getByRole("button", { name: /외부 인물로 추가/ }));
            }
            await waitFor(() => expect(within(dialog).getByRole("button", { name: /다음/ })).toHaveProperty("disabled", false));
            fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        };
        await confirmVideo(true);
        const selectSong = () => {
            fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), { target: { value: "기존 곡" } });
            fireEvent.click(within(dialog).getByRole("option", { name: /기존 곡/ }));
            fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        };
        selectSong();
        fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
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
        await waitFor(() => expect(preflightEntryMock).toHaveBeenCalledWith({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 10,
            endSeconds: 90,
        }));
        fireEvent.click(within(dialog).getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(within(dialog).getByRole("checkbox", { name: "메들리의 한 곡 구간" }));
        fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        fireEvent.change(within(dialog).getByLabelText("기존 곡 검색"), {
            target: { value: "Medley Song" },
        });
        fireEvent.click(await within(dialog).findByRole("option", { name: /메들리 기존 곡/ }));
        fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        fireEvent.change(within(dialog).getByLabelText("가창 참여자 검색"), {
            target: { value: "현재 멤버" },
        });
        fireEvent.click(await within(dialog).findByRole("option", { name: /현재 멤버/ }));
        fireEvent.click(within(dialog).getByText("가창 라벨·내부 메모 (선택)"));
        expect(within(dialog).getByRole("button", { name: "메들리 수록" })).toBeTruthy();
        expect(within(dialog).queryByLabelText("선택한 가창 라벨")).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", { name: /다음/ }));
        expect(within(dialog).getByText("메들리 구간")).toBeTruthy();
        expect(within(dialog).queryByRole("button", { name: "게시" })).toBeNull();
        fireEvent.click(within(dialog).getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            registrationMode: "medley_segment",
            relationType: "cover",
            startSeconds: 10,
            endSeconds: 90,
            song: { kind: "existing", songId: "song-medley" },
            publicationTarget: "draft",
        }), expect.any(String)));
        const savedRequest = createEntryMock.mock.calls.at(-1)?.[0];
        expect(savedRequest).not.toHaveProperty("performanceTags");
        expect(await within(dialog).findByText("메들리 커버 구간을 임시 저장했습니다.")).toBeTruthy();
        fireEvent.click(within(dialog).getByRole("button", { name: "같은 영상의 다음 커버 추가" }));
        expect(within(dialog).getByLabelText("시작 위치(초)")).toHaveProperty("value", "90");
        expect(within(dialog).getByLabelText("종료 위치(초)")).toHaveProperty("value", "180");
        expect(within(dialog).getByLabelText("YouTube URL")).toHaveProperty("value", "https://youtu.be/dQw4w9WgXcQ");
        fireEvent.click(within(dialog).getByRole("button", { name: "영상 확인" }));
        await waitFor(() => expect(preflightEntryMock).toHaveBeenLastCalledWith({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 90,
            endSeconds: 180,
        }));
    });
    it("reuses a new external identity across integrated registration fields", async () => {
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), {
            target: { value: "https://youtu.be/dQw4w9WgXcQ" },
        });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), {
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
        expect(request.participants[0]?.subject).toEqual(request.song.originalArtists[0]?.subject);
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
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("원곡 가수 검색"), {
            target: { value: "  deco*27  " },
        });
        expect(await screen.findByRole("option", { name: /DECO\*27/ })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /외부 인물로 추가/ })).toBeNull();
        expect(screen.getByText("동일한 이름의 주체가 이미 있습니다. 위 후보를 선택하세요."))
            .toBeTruthy();
    });
    it("ignores a registration return URL without an in-memory draft", async () => {
        render(createElement(ConsoleSearchContext.Provider, { value: [{ tab: "operations", view: "channel-edit", from: "play-registration", channel: `UC${"Z".repeat(22)}` }, vi.fn()] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: "operations" })), { wrapper: createQueryWrapper() });
        await screen.findByRole("button", { name: "채널 등록" });
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(screen.queryByLabelText("YouTube channel ID")).toBeNull();
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
            if (failure === "duplicate")
                throw new Error("Channel already exists");
            return { data: channel };
        });
        if (failure === "approval")
            updateChannelMock.mockRejectedValueOnce(new Error("Approval failed"));
        if (failure === "version")
            updateChannelMock.mockImplementationOnce(async () => {
                fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, channelRole: "member_music", version: 2 }] });
                throw new Error("Version conflict");
            });
        updateChannelMock.mockImplementationOnce(async (input) => {
            fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, ...input, version: 1 }] });
            preflightEntryMock.mockResolvedValue({ ...preflight, channel: { ...preflight.channel, state: "approved", catalogChannelId: channel.id, verificationStatus: "approved", active: true, channelRole: channel.channelRole } });
            return {};
        });
        function RegistrationPage() {
            const [search, setSearch] = useState<ConsoleSearch>({ tab: "catalog", kind, q: "보존할 검색" });
            return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(current => ({ ...current, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: search.tab === "operations" ? "operations" : "catalog" }));
        }
        render(createElement(RegistrationPage), { wrapper: createQueryWrapper() });
        fireEvent.click(await screen.findByRole("button", { name: kind === "broadcast" ? "새 노래 클립 등록" : "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("button", { name: "이 채널 등록하기" });
        if (kind === "official")
            fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: "이 채널 등록하기" }));
        expect(await screen.findByLabelText("YouTube channel ID")).toHaveProperty("value", channel.externalChannelId);
        await waitFor(() => expect(screen.getByLabelText("채널 표시명")).toHaveProperty("value", channel.displayName));
        expect(screen.getByRole("dialog", { name: "채널 등록" })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Play 채널" })).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "채널 등록" }));
        await screen.findByRole("button", { name: "채널 수정 저장" });
        expect(createChannelMock).toHaveBeenCalledWith(expect.objectContaining({ channelRole: channel.channelRole, externalChannelId: channel.externalChannelId }), expect.any(String));
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
    it("shows the actionable preflight API error and request id", async () => {
        preflightEntryMock.mockRejectedValueOnce(new ApiError("YouTube metadata is temporarily unavailable", 503, {
            code: "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
            fields: { youtube: "YouTube metadata request returned 403" },
            requestId: "request-preflight-1",
        }));
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("button", { name: "새 영상 등록" }));
        fireEvent.change(screen.getByLabelText("YouTube URL"), {
            target: {
                value: "https://www.youtube.com/watch?v=ASRCBcCY_qE&list=RDASRCBcCY_qE&start_radio=1",
            },
        });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        expect((await screen.findByRole("alert")).textContent).toContain("YouTube metadata request returned 403");
        expect(screen.getByRole("alert").textContent).toContain("request-preflight-1");
    });
    it("defaults an original song to the video title and uses participants when original artists are empty", async () => {
        await openVideoRegistration();
        await screen.findByRole("region", { name: "등록 채널 상태" });
        expect(screen.queryByLabelText("시작 위치(초)")).toBeNull();
        expect(screen.queryByLabelText("종료 위치(초)")).toBeNull();
        expect(screen.getByText("영상 길이 · 180초")).toBeTruthy();
        fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
        fireEvent.change(screen.getByLabelText("시작 위치(초)"), {
            target: { value: "10" },
        });
        fireEvent.change(screen.getByLabelText("종료 위치(초)"), {
            target: { value: "90" },
        });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
        expect(screen.queryByLabelText("시작 위치(초)")).toBeNull();
        expect(screen.queryByLabelText("종료 위치(초)")).toBeNull();
        expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await screen.findByRole("region", { name: "등록 채널 상태" });
        expect(preflightEntryMock).toHaveBeenLastCalledWith({
            youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
            startSeconds: 0,
            endSeconds: null,
        });
        fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        expect(screen.getByLabelText("곡 제목")).toHaveProperty("value", "확인된 영상");
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("가창 참여자 검색"), {
            target: { value: "현재 멤버" },
        });
        fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            relationType: "original",
            song: expect.objectContaining({
                kind: "create",
                title: "확인된 영상",
                isOtwOriginal: true,
                originalArtists: [{ subject: { kind: "member", memberUid: 1 }, creditOrder: 0, isPrimary: true }],
            }),
            startSeconds: 0,
            endSeconds: 180,
        }), expect.any(String)));
    });
    it("edits an original song manually and preserves its title and artists across registration steps", async () => {
        await openVideoRegistration();
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), { target: { value: "" } });
        expect(screen.getByRole("button", { name: /다음/ })).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("곡 제목"), { target: { value: "직접 입력한 곡" } });
        fireEvent.change(screen.getByLabelText("원곡 가수 검색"), { target: { value: "원곡 가수" } });
        fireEvent.click(screen.getByRole("button", { name: /외부 인물로 추가/ }));
        fireEvent.click(screen.getByRole("button", { name: /이전/ }));
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /오리지널곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        expect(screen.getByLabelText("곡 제목")).toHaveProperty("value", "직접 입력한 곡");
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("가창 참여자 검색"), { target: { value: "현재 멤버" } });
        fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
        fireEvent.click(screen.getByRole("button", { name: /이전/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), { target: { value: "수정한 곡명" } });
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        expect(screen.getByText("수정한 곡명")).toBeTruthy();
        expect(screen.getByText("원곡 가수 · 원곡 가수")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            relationType: "original",
            song: expect.objectContaining({
                kind: "create", title: "수정한 곡명", isOtwOriginal: true,
                originalArtists: [expect.objectContaining({
                        subject: expect.objectContaining({ kind: "new_external", displayName: "원곡 가수" }),
                        creditOrder: 0, isPrimary: true,
                    })],
            }),
            participants: [expect.objectContaining({ subject: { kind: "member", memberUid: 1 } })],
        }), expect.any(String)));
    });
    it("requires clip channel approval when switching to karaoke without losing the video", async () => {
        await openVideoRegistration();
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /노래방송/ }));
        expect(screen.getByRole("alert")).toBeTruthy();
        expect((screen.getByRole("button", { name: /다음/ }) as HTMLButtonElement)
            .disabled).toBe(true);
        expect(createEntryMock).not.toHaveBeenCalled();
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
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(await screen.findByRole("button", { name: /노래방송/ }));
        await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
        fireEvent.click(screen.getByRole("checkbox", { name: "구간 선택" }));
        fireEvent.change(screen.getByLabelText("시작 위치(초)"), { target: { value: "10" } });
        fireEvent.change(screen.getByLabelText("종료 위치(초)"), { target: { value: "90" } });
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
        fireEvent.click(screen.getByRole("button", { name: "다음" }));
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
        }), expect.any(String));
        fireEvent.click(screen.getByRole("button", { name: "같은 영상의 다음 곡 추가" }));
        expect([...dirtyStates.values()].some(Boolean)).toBe(true);
        expect(screen.getByLabelText("시작 위치(초)")).toHaveProperty("value", "90");
        expect(screen.getByLabelText("종료 위치(초)")).toHaveProperty("value", "180");
        fireEvent.click(screen.getByRole("button", { name: "영상 확인" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "다음" })).toHaveProperty("disabled", false));
        expect(screen.getByRole("button", { name: /노래방송/ }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "다음" }));
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
        }), expect.any(String));
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
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        const nextButton = screen.getByRole("button", { name: /다음/ });
        expect(nextButton).toHaveProperty("disabled", true);
        fireEvent.change(screen.getByLabelText("채널 소유·연결 주체 검색"), {
            target: { value: "현재 멤버" },
        });
        fireEvent.click(await screen.findByRole("option", { name: /현재 멤버/ }));
        expect(nextButton).toHaveProperty("disabled", false);
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), {
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
        expect(screen.queryByLabelText("채널 소유·연결 주체 검색")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledWith(expect.objectContaining({
            publicationTarget: "draft",
            channel: expect.objectContaining({
                kind: "pending",
                owners: [{ kind: "member", memberUid: 1 }],
            }),
        }), expect.any(String)));
    });
    it.each([false, true])("keeps registration input and handles a stale preflight: %s", async (stale) => {
        createEntryMock.mockRejectedValueOnce(new ApiError("저장 중 동시 변경이 발생했습니다.", 409, { code: stale ? "PLAY_ADMIN_STALE_WRITE" : "CONTENT_CONFLICT" }));
        await openVideoRegistration();
        await screen.findByRole("region", { name: "등록 채널 상태" });
        fireEvent.click(screen.getByRole("button", { name: /공식 커버곡/ }));
        fireEvent.click(screen.getByRole("button", { name: /다음/ }));
        fireEvent.change(screen.getByLabelText("곡 제목"), {
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
        expect((await screen.findByRole("alert")).textContent).toContain(stale ? "영상과 채널을 다시 확인" : "저장 중 동시 변경이 발생했습니다.");
        expect(screen.getByRole("dialog", { name: "새 YouTube 영상 등록" })).toBeTruthy();
        expect(screen.getAllByText(/현재 멤버/).length).toBeGreaterThan(0);
        expect(screen.getByText("실패 후 보존 원곡")).toBeTruthy();
        expect(screen.getByText(/입력 보존 가수/)).toBeTruthy();
        const requestId = createEntryMock.mock.calls[0][1];
        expect(requestId).toEqual(expect.any(String));
        if (stale) {
            expect((screen.getByRole("button", { name: "임시 저장" }) as HTMLButtonElement).disabled).toBe(true);
            const prepared = await preflightEntryMock.mock.results[0].value;
            preflightEntryMock.mockResolvedValue({ ...prepared, catalogRevision: 8 });
            fireEvent.click(screen.getByRole("button", { name: "영상 다시 확인" }));
            await waitFor(() => expect(preflightEntryMock).toHaveBeenCalledTimes(2));
            await screen.findByRole("region", { name: "등록 채널 상태" });
            for (let i = 0; i < 3; i++) {
                await waitFor(() => expect((screen.getByRole("button", { name: /다음/ }) as HTMLButtonElement).disabled).toBe(false));
                fireEvent.click(screen.getByRole("button", { name: /다음/ }));
            }
        }
        fireEvent.click(screen.getByRole("button", { name: "임시 저장" }));
        await waitFor(() => expect(createEntryMock).toHaveBeenCalledTimes(2));
        if (stale) {
            expect(createEntryMock.mock.calls[1][1]).not.toBe(requestId);
            expect(createEntryMock.mock.calls[1][0]).toMatchObject({ expectedCatalogRevision: 8,
                song: { title: "실패 후 보존 원곡" } });
        }
        else
            expect(createEntryMock.mock.calls[1][1]).toBe(requestId);
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "새 YouTube 영상 등록" })).toBeNull());
    });
});
