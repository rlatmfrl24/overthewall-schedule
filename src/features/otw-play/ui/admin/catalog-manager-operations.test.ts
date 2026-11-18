// @vitest-environment jsdom
import { confirmationMock, fetchCatalogMock, fetchSourceHealthMock, recheckSourceMock, updateEntityMock, deleteEntityMock, createChannelMock, lookupChannelMock, updateChannelMock, deleteChannelMock, toastMock, catalog, openSecondaryAction, openOperationsTab, renderCatalogManager, createQueryWrapper } from "./catalog-manager.test-support";
import { createElement } from "react";
import { UnsavedChangesContext } from "@/shared/lib/unsaved-changes";
import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { describe, beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { OtwPlayCatalogManager } from "./catalog-manager";
describe("OtwPlayCatalogManager operations", () => {
    beforeEach(() => {
        fetchSourceHealthMock.mockResolvedValue({
            generatedAt: 1777000000000,
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
                        lastCheckedAt: 1776000000000,
                        nextCheckAt: 1776100000000,
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
                        at: 1776000000000,
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
                nextCheckAt: 1776200000000,
            },
        });
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
        await waitFor(() => expect(recheckSourceMock).toHaveBeenCalledWith("source-1", {
            expectedVersion: 3,
            youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            channelId: "channel-1",
        }));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
            variant: "info",
            description: "외부 API 재시도 대기 상태로 저장했습니다 (timeout).",
        }));
        expect(fetchCatalogMock).toHaveBeenCalledOnce();
        await waitFor(() => expect(fetchSourceHealthMock.mock.calls.length).toBeGreaterThan(1));
    });
    it("keeps source health reachable when the catalog fails and excludes retired operations controls", async () => {
        fetchCatalogMock.mockRejectedValueOnce(new Error("catalog unavailable"));
        renderCatalogManager();
        expect((await screen.findByRole("alert")).textContent).toContain("관리자 카탈로그를 불러오지 못했습니다");
        fireEvent.click(screen.getByRole("tab", { name: "운영" }));
        expect(await screen.findByRole("heading", { name: "소스 상태" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "일괄 재검사" })).toBeTruthy();
        for (const title of ["공개 설정", "최근 24시간 관측", "Play 자동화 운영", "회원 곡 제안"]) {
            expect(screen.queryByRole("heading", { name: title })).toBeNull();
        }
    });
    it("reports and refreshes a stale manual source write", async () => {
        const error = new ApiError("Source changed before recheck", 409, {
            code: "PLAY_ADMIN_STALE_WRITE",
        });
        const logged = vi.spyOn(console, "error").mockImplementation(() => {});
        recheckSourceMock.mockRejectedValueOnce(error);
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
        expect(logged).toHaveBeenCalledExactlyOnceWith("OTW Play admin command failed", error);
    });
    it.each([false, true, "duplicate"] as const)("keeps external identity edits in operations after a failed command (accepted=%s)", async (accepted) => {
        fetchCatalogMock.mockResolvedValue({
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
        updateEntityMock.mockRejectedValueOnce(accepted === "duplicate" ? new ApiError("이미 등록된 가수입니다. 기존 가수를 선택해 주세요.", 422, { code: "PLAY_ADMIN_VALIDATION_FAILED" }) : accepted ? new ApiError("동시 변경이 발생했습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요.", 409, { code: "CONTENT_CONFLICT" }) : new Error("write failed"));
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        renderCatalogManager();
        await openOperationsTab("인물·그룹");
        await screen.findByRole("region", { name: "외부 인물·그룹" });
        expect(screen.getByRole("heading", { name: "외부 인물·그룹" })).toBeTruthy();
        expect(screen.queryByRole("region", { name: "채널 감시" })).toBeNull();
        expect(screen.queryByLabelText("수집 대상 채널 ID")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "외부 인물 수정" }));
        const nameInput = screen.getByLabelText("외부 identity 표시명") as HTMLInputElement;
        fireEvent.change(nameInput, { target: { value: "입력 보존" } });
        expect(screen.queryByLabelText(/slug/i)).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith(accepted === "duplicate" ? { variant: "error", description: "이미 등록된 가수입니다. 기존 가수를 선택해 주세요." } : accepted ? { variant: "error", description: expect.stringContaining("동시 변경") } : { variant: "error", description: "외부 identity 수정 작업에 실패했습니다." }));
        expect(nameInput.value).toBe("입력 보존");
        if (accepted === true) {
            const original = updateEntityMock.mock.calls[0];
            expect(original[1]).toMatch(/^[A-Za-z0-9_-]{16,100}$/);
            updateEntityMock.mockResolvedValueOnce({});
            fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
            await waitFor(() => expect(updateEntityMock).toHaveBeenCalledTimes(2));
            expect(updateEntityMock.mock.calls[1]).toEqual(original);
            await waitFor(() => expect(screen.queryByLabelText("외부 identity 표시명")).toBeNull());
        }
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
        await openOperationsTab("인물·그룹");
        await screen.findByRole("region", { name: "외부 인물·그룹" });
        const linkedDelete = screen.getByRole("button", {
            name: "연결된 외부 그룹 삭제 메뉴",
        }) as HTMLButtonElement;
        expect(linkedDelete.disabled).toBe(true);
        const linkedRow = linkedDelete.closest("tr");
        expect(linkedRow).not.toBeNull();
        expect(within(linkedRow!).getByText("연결 사용 중 · 삭제 불가")).toBeTruthy();
        expect(linkedDelete.getAttribute("aria-describedby")).toBe("external-entity-delete-reason-external-linked");
        fireEvent.click(await openSecondaryAction("삭제 가능한 외부 인물 삭제"));
        expect(await screen.findByText("외부 주체를 삭제할까요?")).toBeTruthy();
        expect(screen.getByText(/이 작업은 되돌릴 수 없으며/)).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "영구 삭제" }));
        await waitFor(() => expect(deleteEntityMock).toHaveBeenCalledWith("external-1", { expectedVersion: 2 }, expect.any(String)));
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
        deleteEntityMock.mockRejectedValueOnce(new ApiError("Referenced entity", 422, {
            code: "PLAY_ADMIN_VALIDATION_FAILED",
            fields: { entity: "referenced" },
        }));
        const consoleError = vi
            .spyOn(console, "error")
            .mockImplementation(() => undefined);
        renderCatalogManager();
        await openOperationsTab("인물·그룹");
        await screen.findByRole("region", { name: "외부 인물·그룹" });
        fireEvent.click(await openSecondaryAction("숨은 참조 인물 삭제"));
        fireEvent.click(await screen.findByRole("button", { name: "영구 삭제" }));
        await waitFor(() => expect(toastMock).toHaveBeenCalledWith({
            variant: "error",
            description: "곡·가창·승인 채널·제안 또는 저장된 후보 검수에 연결된 외부 주체는 삭제할 수 없습니다. 연결을 먼저 교정하거나 보관 처리해 주세요.",
        }));
        consoleError.mockRestore();
    });
    it("lists channels without filters in operations and registers a kirinuki channel from the card dialog", async () => {
        const confirmDiscard = vi.fn(async () => false);
        render(createElement(UnsavedChangesContext.Provider, { value: { register: vi.fn(), confirm: confirmDiscard } }, createElement(OtwPlayCatalogManager)), { wrapper: createQueryWrapper() });
        expect(screen.queryByRole("tab", { name: "채널" })).toBeNull();
        await openOperationsTab("채널");
        expect(await screen.findByRole("heading", { name: "Play 채널" })).toBeTruthy();
        expect(screen.queryByRole("textbox", { name: "Play 승인 채널 검색" })).toBeNull();
        for (const name of ["채널 용도 필터", "채널 승인 필터", "채널 수집 필터"]) {
            expect(screen.queryByRole("combobox", { name })).toBeNull();
        }
        expect(screen.queryByRole("dialog")).toBeNull();
        const trigger = await screen.findByRole("button", { name: "채널 등록" });
        fireEvent.click(trigger);
        const dialog = await screen.findByRole("dialog", { name: "채널 등록" });
        expect(screen.getByText(/검수 대기로 생성/)).toBeTruthy();
        fireEvent.click(screen.getByRole("combobox", { name: "채널 역할" }));
        fireEvent.click(screen.getByRole("option", { name: "승인 키리누키" }));
        const channelId = screen.getByLabelText("YouTube channel ID");
        const displayName = screen.getByLabelText("채널 표시명");
        const submit = within(dialog).getByRole("button", { name: "채널 등록" });
        expect((submit as HTMLButtonElement).disabled).toBe(true);
        expect((displayName as HTMLInputElement).readOnly).toBe(true);
        expect(screen.queryByText("소유·연결 주체")).toBeNull();
        fireEvent.change(channelId, { target: { value: `UC${"F".repeat(22)}` } });
        fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
        await waitFor(() => expect(confirmDiscard).toHaveBeenCalledOnce());
        expect(channelId).toHaveProperty("value", `UC${"F".repeat(22)}`);
        fireEvent.click(screen.getByRole("button", { name: "채널 조회" }));
        await waitFor(() => expect(lookupChannelMock).toHaveBeenCalledWith(`UC${"F".repeat(22)}`));
        await waitFor(() => expect((displayName as HTMLInputElement).value).toBe("정리된 공식 채널"));
        expect(screen.getByRole("combobox", { name: "채널 역할" }).textContent).toContain("승인 키리누키");
        expect((submit as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(submit);
        await waitFor(() => expect(createChannelMock).toHaveBeenCalledWith({
            externalChannelId: `UC${"F".repeat(22)}`,
            displayName: "정리된 공식 채널",
            channelRole: "approved_kirinuki",
            entityIds: [],
        }, expect.any(String)));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await waitFor(() => expect(document.activeElement).toBe(trigger));
        expect(screen.getByText("등록된 채널")).toBeTruthy();
    });
    it.each([false, true])("approves a channel and preserves the same accepted editor retry (%s)", async (accepted) => {
        if (accepted)
            updateChannelMock.mockRejectedValueOnce(new ApiError("동시 변경이 발생했습니다. 최신 상태를 확인한 뒤 다시 저장해 주세요.", 409, { code: "CONTENT_CONFLICT" }));
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
        await openOperationsTab("채널");
        fireEvent.click(await screen.findByRole("button", { name: "동의 완료 키리누키 수정" }));
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
        }, expect.any(String)));
        if (accepted) {
            await screen.findByText("채널을 저장하지 못했습니다. 입력은 유지되어 있으니 다시 시도하세요.");
            const originalKey = updateChannelMock.mock.calls[0]![1];
            fireEvent.click(screen.getByRole("button", { name: "채널 수정 저장" }));
            await waitFor(() => expect(updateChannelMock).toHaveBeenCalledTimes(2));
            expect(updateChannelMock.mock.calls[1]![1]).toBe(originalKey);
        }
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
        await openOperationsTab("채널");
        expect((await screen.findAllByText("잘못 연결된 그룹")).length).toBeGreaterThan(0);
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
        }, expect.any(String)));
    });
    it("deletes a channel directly from its row after confirmation and refreshes the list", async () => {
        const channel = { id: "delete-channel", provider: "youtube", externalChannelId: `UC${"D".repeat(22)}`, displayName: "삭제 대상", channelRole: "approved_kirinuki", verificationStatus: "pending", active: false, entityIds: [], version: 3 };
        fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [channel] });
        deleteChannelMock.mockImplementation(async () => { fetchCatalogMock.mockResolvedValue(catalog); return { data: { id: channel.id }, catalogRevision: 8 }; });
        renderCatalogManager();
        await openOperationsTab("채널");
        fireEvent.click(await openSecondaryAction("삭제 대상 채널 삭제"));
        await waitFor(() => expect(deleteChannelMock).toHaveBeenCalledWith(channel.id, { expectedVersion: 3 }, expect.any(String)));
        expect(confirmationMock).toHaveBeenCalledWith(expect.objectContaining({ title: "삭제 대상 채널을 삭제할까요?" }));
        await waitFor(() => expect(screen.queryByRole("button", { name: "삭제 대상 채널 삭제 메뉴" })).toBeNull());
    });
    it("keeps the channel when row deletion is cancelled", async () => {
        fetchCatalogMock.mockResolvedValue({ ...catalog, channels: [{ id: "keep-channel", externalChannelId: `UC${"D".repeat(22)}`, displayName: "유지 대상", channelRole: "approved_kirinuki", verificationStatus: "pending", active: false, entityIds: [], version: 0 }] });
        confirmationMock.mockResolvedValueOnce(false);
        renderCatalogManager();
        await openOperationsTab("채널");
        fireEvent.click(await openSecondaryAction("유지 대상 채널 삭제"));
        await waitFor(() => expect(confirmationMock).toHaveBeenCalled());
        expect(deleteChannelMock).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "유지 대상 채널 삭제 메뉴" })).toBeTruthy();
    });
    it("shows source health, channels, and people in separate operations tabs", async () => {
        renderCatalogManager();
        fireEvent.click(await screen.findByRole("tab", { name: "가져오기" }));
        expect(await screen.findByRole("region", { name: "가져오기 작업 목록" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "링크 확인" })).toBeTruthy();
        expect(screen.queryByRole("combobox", { name: "검수 출처" })).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: "운영" }));
        const operations = screen.getByRole("tablist", { name: "Play 운영 영역" });
        expect(within(operations).getByRole("tab", { name: "소스 상태", selected: true })).toBeTruthy();
        expect(await screen.findByRole("heading", { name: "소스 상태" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Play 채널" })).toBeNull();
        fireEvent.click(within(operations).getByRole("tab", { name: "채널" }));
        expect(await screen.findByRole("heading", { name: "Play 채널" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "소스 상태" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "외부 인물·그룹" })).toBeNull();
        fireEvent.click(within(operations).getByRole("tab", { name: "인물·그룹" }));
        expect(await screen.findByRole("heading", { name: "외부 인물·그룹" })).toBeTruthy();
        expect(screen.queryByRole("heading", { name: "Play 채널" })).toBeNull();
        fireEvent.click(screen.getByRole("tab", { name: "카탈로그" }));
        expect(screen.queryByRole("button", { name: "인물·그룹" })).toBeNull();
        expect(screen.queryByRole("heading", { name: "외부 인물·그룹" })).toBeNull();
    });
});
