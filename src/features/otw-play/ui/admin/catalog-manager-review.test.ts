// @vitest-environment jsdom
import { confirmationMock, fetchCatalogMock, reviewRowsMock, fetchImportJobMock, fetchProposalsMock, lookupChannelMock, updateChannelMock, preflightEntryMock, rejectProposalMock, approveProposalMock, toastMock, catalog, selectOption, proposal, renderCatalogManager, createTestQueryClient, createQueryWrapper } from "./catalog-manager.test-support";
import { createReviewItemFixture } from "../../test/catalog-fixtures";
import { createElement, useState } from "react";
import { ConsoleSearchContext, type ConsoleSearch } from "@/shared/lib/admin-console-search";
import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";
describe("OtwPlayCatalogManager review", () => {
    it("protects actual proposal edits and clears protection when values are restored", async () => {
        const protectedInput = () => {
            const event = new Event("beforeunload", { cancelable: true });
            window.dispatchEvent(event);
            return event.defaultPrevented;
        };
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        const title = await screen.findByLabelText("곡명");
        expect(protectedInput()).toBe(false);
        await screen.findByText(/영상·채널 확인 완료/);
        fireEvent.click(screen.getByRole("checkbox"));
        expect(protectedInput()).toBe(false);
        fireEvent.change(title, { target: { value: "실제 변경" } });
        expect(protectedInput()).toBe(true);
        fireEvent.change(title, { target: { value: proposal.submittedTitle } });
        expect(protectedInput()).toBe(false);
        await selectOption("참여자 가창 역할", "코러스");
        expect(protectedInput()).toBe(true);
        await selectOption("참여자 가창 역할", "메인 보컬");
        expect(protectedInput()).toBe(false);
        const reason = screen.getByLabelText(`${proposal.submittedTitle} 거절 코드`);
        fireEvent.change(reason, { target: { value: "invalid" } });
        expect(protectedInput()).toBe(true);
        fireEvent.change(reason, { target: { value: "" } });
        expect(protectedInput()).toBe(false);
    });
    it("opens proposals only from explicit selection in the unified review inbox", async () => {
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        expect(screen.queryByRole("tab", { name: "사용자 곡 요청" })).toBeNull();
        expect(fetchProposalsMock).not.toHaveBeenCalled();
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        expect(await screen.findByTitle("검수할 공식 커버 검수 영상")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("곡명"), { target: { value: "보존할 제목" } });
        fireEvent.click(screen.getByRole("button", { name: "검수 목록으로" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        expect((await screen.findByLabelText("곡명") as HTMLInputElement).value).toBe("보존할 제목");
    });
    it("switches between pending and completed proposal cards without opening a detail automatically", async () => {
        reviewRowsMock.mockImplementation(async (filters) => ({
            items: [createReviewItemFixture(filters.status === "completed"
                    ? { status: "rejected", title: "처리된 제안" }
                    : { title: "대기 중인 제안" })],
            nextCursor: null,
        }));
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        expect(await screen.findByRole("heading", { name: "대기 중인 제안" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "검수 대기", pressed: true })).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "처리 완료" }));
        expect(await screen.findByRole("heading", { name: "처리된 제안" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "처리 내역" })).toBeTruthy();
        expect(screen.getByText("거절됨")).toBeTruthy();
        expect(fetchProposalsMock).not.toHaveBeenCalled();
    });
    it("opens a completed legacy proposal as read-only history", async () => {
        fetchProposalsMock.mockImplementation((status: string) => Promise.resolve(status ? [] : [{ ...proposal, status: "rejected", reviewResultCode: "reviewed_rejection", reviewedAt: 1777000000000 }]));
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        expect(await screen.findByText("처리 상태: 거절됨")).toBeTruthy();
        expect(screen.getByText("처리 사유: reviewed_rejection")).toBeTruthy();
        expect(screen.queryByRole("button", { name: "확인 후 승인·게시" })).toBeNull();
        expect(screen.queryByRole("button", { name: "제안 거절" })).toBeNull();
    });
    it("retains a draft when another administrator completes the proposal", async () => {
        const client = createTestQueryClient();
        render(createElement(QueryClientProvider, { client }, createElement(OtwPlayCatalogManager)));
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        expect(await screen.findByText(/제안 목록을 불러오지 못했습니다\. 빈 목록으로 간주하지 않습니다/)).toBeTruthy();
        expect(screen.queryByText("대기 중인 제안이 없습니다.")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
        expect((await screen.findAllByText("검수할 공식 커버")).length).toBeGreaterThan(0);
        expect(screen.getByRole("heading", { name: "검수할 공식 커버" })).toBeTruthy();
        expect(fetchProposalsMock).toHaveBeenCalledTimes(2);
    });
    it("requires metadata and singing-credit confirmation before approving a proposal", async () => {
        const confirm = confirmationMock.mockResolvedValue(true);
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        const player = await screen.findByTitle("검수할 공식 커버 검수 영상");
        expect(player.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
        const approveButton = screen.getByRole("button", {
            name: "확인 후 승인·게시",
        }) as HTMLButtonElement;
        expect(approveButton.disabled).toBe(true);
        expect(within(screen.getByLabelText("선택한 장르(분류)")).getByText("J-POP")).toBeTruthy();
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
        expect(within(screen.getByLabelText("선택한 장르(분류)")).getAllByText("K-POP")).toHaveLength(1);
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
        await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith("proposal-1", expect.objectContaining({
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
        }), expect.any(String)));
        expect(confirm).not.toHaveBeenCalled();
        confirm.mockRestore();
    });
    it("automatically checks a proposal and publishes without a second confirmation dialog", async () => {
        confirmationMock.mockResolvedValue(false);
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await screen.findByText(/영상·채널 확인 완료/);
        const approve = screen.getByRole("button", { name: "확인 후 승인·게시" });
        expect(approve).toHaveProperty("disabled", true);
        fireEvent.click(screen.getByRole("checkbox"));
        expect(approve).toHaveProperty("disabled", false);
        fireEvent.click(approve);
        await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith("proposal-1", expect.objectContaining({
            expectedVersion: 2, expectedCatalogRevision: 7, singingCreditConfirmed: true, publish: true,
        }), expect.any(String)));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ variant: "success", description: "제안 승인 작업을 완료했습니다." }));
    });
    it("preserves the proposal and reports the server reason and request ID when approval fails", async () => {
        const error = new ApiError("영상의 채널이 승인된 활성 채널인지 확인해 주세요.", 422, { code: "PLAY_ADMIN_VALIDATION_FAILED", requestId: "approval-request-1" });
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        approveProposalMock.mockRejectedValueOnce(error);
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await screen.findByText(/영상·채널 확인 완료/);
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({
            variant: "error",
            description: "제안 승인에 실패했습니다. 영상의 채널이 승인된 활성 채널인지 확인해 주세요. (PLAY_ADMIN_VALIDATION_FAILED) · 요청 ID: approval-request-1",
        })));
        expect(screen.getByLabelText("곡명")).toHaveProperty("value", proposal.submittedTitle);
        expect(screen.getByRole("button", { name: "확인 후 승인·게시" })).toHaveProperty("disabled", false);
        expect(logged).toHaveBeenCalledExactlyOnceWith("OTW Play admin command failed", error);
    });
    it("shows verification failures and blocks approval during a fresh verification", async () => {
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        const verify = await screen.findByRole("button", { name: "영상·채널 다시 확인" });
        const approve = screen.getByRole("button", { name: "확인 후 승인·게시" });
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await screen.findByText("미등록 채널");
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
        expect(approveProposalMock).toHaveBeenCalledWith("proposal-1", expect.objectContaining({
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
        }), expect.any(String));
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await waitFor(() => expect(preflightEntryMock).toHaveBeenCalledOnce());
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
        expect(screen.getByRole("region", { name: "사용자 제안 목록" })).toBeTruthy();
        expect(screen.queryByText("미등록 채널")).toBeNull();
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await screen.findByText("미등록 채널");
        fireEvent.click(screen.getByRole("button", { name: "소유자 추가" }));
        fireEvent.click(screen.getByLabelText("1번째 채널 소유 identity"));
        fireEvent.click(await screen.findByRole("option", { name: "가창자 · 보컬 B" }));
        fireEvent.click(screen.getByRole("button", { name: "1번째 참여자 삭제" }));
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
        await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith("proposal-1", expect.objectContaining({
            channel: expect.objectContaining({
                owners: [expect.objectContaining({ displayName: "보컬 B" })],
            }),
        }), expect.any(String)));
        confirm.mockRestore();
    });
    it("omits archived songs and identities from approval selectors", async () => {
        fetchCatalogMock.mockResolvedValue({
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
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
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        await waitFor(() => expect(preflightEntryMock).toHaveBeenCalled());
        fireEvent.click(screen.getByRole("checkbox"));
        fireEvent.click(screen.getByRole("button", { name: "확인 후 승인·게시" }));
        await waitFor(() => expect(approveProposalMock).toHaveBeenCalledWith("proposal-1", expect.objectContaining({
            participants: [expect.objectContaining({
                    subject: { kind: "member", memberUid: 1 },
                })],
        }), expect.any(String)));
        confirm.mockRestore();
    });
    it.each([false, true])("rejects with an internal reason and then refetches authoritative state (accepted=%s)", async (accepted) => {
        if (accepted)
            rejectProposalMock.mockRejectedValueOnce(new ApiError("동시 변경이 발생했습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요.", 409, { code: "CONTENT_CONFLICT" }));
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "검수" }));
        fireEvent.click((await screen.findAllByRole("button", { name: "검수 열기" }))[0]!);
        const rejectButton = await screen.findByRole("button", { name: "제안 거절" });
        expect((rejectButton as HTMLButtonElement).disabled).toBe(true);
        fireEvent.change(screen.getByLabelText("검수할 공식 커버 거절 코드"), {
            target: { value: "duplicate" },
        });
        fireEvent.click(rejectButton);
        if (accepted) {
            await waitFor(() => expect(toastMock).toHaveBeenCalledWith({ variant: "error", description: expect.stringContaining("동시 변경") }));
            expect(screen.getByLabelText("검수할 공식 커버 거절 코드")).toHaveProperty("value", "duplicate");
            const original = rejectProposalMock.mock.calls.at(-1)!;
            const attempts = rejectProposalMock.mock.calls.length;
            fireEvent.click(screen.getByRole("button", { name: "제안 거절" }));
            await waitFor(() => expect(rejectProposalMock).toHaveBeenCalledTimes(attempts + 1));
            expect(rejectProposalMock.mock.calls.at(-1)).toEqual(original);
        }
        await waitFor(() => expect(rejectProposalMock).toHaveBeenCalledWith("proposal-1", {
            expectedVersion: 2,
            resultCode: "duplicate",
        }, expect.any(String)));
        await waitFor(() => {
            expect(fetchCatalogMock.mock.calls.length).toBeGreaterThan(1);
            expect(fetchProposalsMock.mock.calls.length).toBeGreaterThan(1);
        });
        expect(toastMock).toHaveBeenCalledWith({
            variant: "success",
            description: "제안 거절 작업을 완료했습니다.",
        });
    });
    it("opens the selected channel dialog in operations and returns to the same review draft after saving", async () => {
        const channel = { id: "channel-1", externalChannelId: `UC${"A".repeat(22)}`, displayName: "검수 채널", provider: "youtube", channelRole: "approved_kirinuki", verificationStatus: "approved", active: true, entityIds: [], version: 3 };
        fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [channel] });
        reviewRowsMock.mockResolvedValue({ items: [{ id: "youtube:BBBBBBBBBBB", kind: "candidate", candidateKind: "singing_clip", sources: ["playlist"], title: "검수할 노래", version: 1, status: "needs_input", createdAt: 1, channelId: channel.externalChannelId,
                    candidate: { candidateId: "youtube:BBBBBBBBBBB", candidateVersion: 1, videoId: "BBBBBBBBBBB", title: "검수할 노래", channelTitle: channel.displayName, thumbnailUrl: null, durationSeconds: 180, publishedAt: 1, availabilityStatus: "playable", status: "needs_input", classification: "eligible", exclusionReason: null, catalogChannelId: channel.id, reviewInput: null, linkedPerformanceId: null, discoveredAt: 1, monitorGeneration: 0, retentionExpiresAt: 9999999999999 },
                }], nextCursor: null });
        fetchImportJobMock.mockResolvedValueOnce({ id: "job-1", workBatchId: "legacy-batch", canResumeLegacyReview: true, status: "completed", candidateKind: "singing_clip", playlistTitle: "검수할 플레이리스트", requestedItemCount: 1, counts: { discovered: 1 }, createdAt: 1 });
        function ReviewChannelPage() {
            const [search, setSearch] = useState<ConsoleSearch>({ tab: "import", view: "review", selected: "youtube:BBBBBBBBBBB", category: "job-1", source: "playlist" });
            return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(current => ({ ...current, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: search.tab === "operations" ? "operations" : "import" }));
        }
        render(createElement(ReviewChannelPage), { wrapper: createQueryWrapper() });
        fireEvent.change(await screen.findByLabelText("시작 위치(초)"), { target: { value: "42" } });
        fireEvent.click(screen.getByRole("button", { name: "채널 승인·수집 설정" }));
        expect(await screen.findByLabelText("YouTube channel ID")).toHaveProperty("value", channel.externalChannelId);
        expect(screen.getByRole("dialog", { name: "검수 채널 수정" })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "Play 채널" })).toBeNull();
        lookupChannelMock.mockResolvedValueOnce({ externalChannelId: channel.externalChannelId, displayName: "수정한 채널" });
        fireEvent.click(screen.getByRole("button", { name: "채널 조회" }));
        await waitFor(() => expect(screen.getByLabelText("채널 표시명")).toHaveProperty("value", "수정한 채널"));
        updateChannelMock.mockImplementationOnce(async () => { fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ ...channel, displayName: "수정한 채널", version: 4 }] }); return {}; });
        fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
        await waitFor(() => expect(updateChannelMock).toHaveBeenCalledWith(expect.objectContaining({ id: channel.id, expectedVersion: 3, displayName: "수정한 채널" }), expect.any(String)));
        await screen.findByText("version 4");
        fireEvent.click(screen.getByRole("button", { name: "작성 중인 검수로 돌아가기" }));
        const review = await screen.findByRole("region", { name: "노래 클립 검수 화면" });
        expect(within(review).getByLabelText("시작 위치(초)")).toHaveProperty("value", "42");
        fireEvent.click(within(review).getByRole("button", { name: "검수 목록으로" }));
        expect(screen.getByRole("heading", { name: "검수할 플레이리스트" })).toBeTruthy();
        expect(screen.queryByLabelText("검수 출처")).toBeNull();
    });
    it("opens a linked proposal in the review tab and returns to its exact import item", async () => {
        const row = { ...createReviewItemFixture(), id: "linked-candidate", kind: "candidate", title: "연결된 가져오기 영상", status: "needs_input", pendingProposalId: proposal.id };
        fetchImportJobMock.mockResolvedValueOnce({ id: "job-1", status: "completed", playlistTitle: "가져온 목록", counts: { discovered: 1 }, requestedItemCount: 1 });
        reviewRowsMock.mockResolvedValue({ items: [row], nextCursor: null });
        function LinkedReview() {
            const [search, setSearch] = useState<ConsoleSearch>({ tab: "import", category: "job-1" });
            return createElement(ConsoleSearchContext.Provider, { value: [search, patch => setSearch(current => ({ ...current, ...patch }))] }, createElement<NonNullable<Parameters<typeof OtwPlayCatalogManager>[0]>>(OtwPlayCatalogManager, { activeSection: search.tab === "review" ? "review" : "import" }));
        }
        render(createElement(LinkedReview), { wrapper: createQueryWrapper() });
        fireEvent.click(await screen.findByRole("button", { name: "연결된 제안 검수" }));
        expect(screen.getByRole("heading", { name: "검수", level: 1 })).toBeTruthy();
        fireEvent.click(await screen.findByRole("button", { name: "가져오기 항목으로" }));
        expect(await screen.findByText("연결된 가져오기 영상 · 정보 입력 필요")).toBeTruthy();
        expect(screen.getByRole("heading", { name: "가져온 목록" })).toBeTruthy();
    });
});
