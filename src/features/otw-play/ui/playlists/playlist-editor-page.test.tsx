// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";
import { PLAY_PLAYLIST_MAX_ITEMS } from "@contracts/otw-play-playlists";

const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), read: vi.fn(), invalidate: vi.fn(), saved: undefined as unknown }));
// Exercise the UI boundary without rendering a thousand animated rows in jsdom.
vi.mock("@contracts/otw-play-playlists", async importOriginal => ({
  ...await importOriginal<typeof import("@contracts/otw-play-playlists")>(), PLAY_PLAYLIST_MAX_ITEMS: 3,
}));
const tracks = ["a", "b"].map(id => ({ song: { id: `song-${id}`, title: `노래 ${id}` }, performance: { id, playable: true, selectedSource: { thumbnailUrl: `https://img.test/${id}.jpg` }, participants: [], releasedAt: null } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { items: tracks } }), useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("@/shared/seo/use-site-seo", () => ({ useSiteSeo: vi.fn() }));
vi.mock("@/shared/lib/unsaved-changes", () => ({ useUnsavedChanges: () => async () => true }));
vi.mock("../../queries/use-public-catalog", () => ({ usePublicRequestOptions: () => ({}), useOtwPlayMembers: () => ({ data: { data: { members: [] } } }) }));
vi.mock("../../queries/use-playlists", () => ({
  usePlaylistOwner: () => "owner", useMyPlaylist: () => ({ data: mocks.saved ? { data: mocks.saved } : undefined }),
  usePlaylistDefaults: () => ({ data: { data: { items: [] } } }),
  usePlaylistPerformances: () => ({ isSuccess: true, data: { pages: [{ data: { items: tracks } }] } }),
}));
vi.mock("../../api/playlists", () => ({ createMyPlaylist: mocks.create, saveMyPlaylist: mocks.save, fetchMyPlaylist: mocks.read }));
vi.mock("./playlist-components", () => ({ PlaylistLoginGate: ({ children }: { children: ReactNode }) => <>{children}</>,
  PerformanceRow: ({ item, children }: { item: typeof tracks[number]; children: ReactNode }) => <div>{item.song.title}{children}</div> }));
import { OtwPlayPlaylistEditorPage } from "./playlist-editor-page";

const saved = { representativePerformanceId: null, imageUrl: null, id: "private-1", title: "저장 목록", description: "", performanceIds: ["a", "b"], originDefaultId: null, version: 2, itemCount: 2, createdAt: 1, updatedAt: 1 };
beforeEach(() => { vi.stubGlobal("React", React); vi.resetAllMocks(); mocks.saved = saved; mocks.invalidate.mockResolvedValue(undefined); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("playlist editor persistence", () => {
  it("keeps oversized saved lists intact and permits saving after enough items are removed", () => {
    mocks.saved = { ...saved, performanceIds: Array.from({ length: PLAY_PLAYLIST_MAX_ITEMS + 1 }, (_, i) => `p-${i}`) };
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    expect(screen.getByRole("note").textContent).toContain("항목을 제거한 뒤 저장");
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole("button", { name: "추가" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1번 삭제" }));
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("heading", { name: `현재 플레이리스트 · ${PLAY_PLAYLIST_MAX_ITEMS}개 가창` })).toBeTruthy();
  });
  it.each([
    ["lost response", new TypeError("response lost")],
    ["post-commit read failure", new ApiError("readback failed", 503, { code: "PLAY_PLAYLIST_CREATE_UNCONFIRMED" })],
  ])("recovers %s with the original payload before saving edited input", async (_scenario, error) => {
    mocks.saved = undefined;
    mocks.create.mockRejectedValueOnce(error).mockResolvedValueOnce({ data: { ...saved, version: 0 } });
    mocks.save.mockResolvedValueOnce({ data: { ...saved, title: "다시 수정", representativePerformanceId: "b", performanceIds: ["b", "a"], version: 1 } });
    mocks.read.mockResolvedValueOnce({ data: { ...saved, title: "다시 수정", representativePerformanceId: "b", performanceIds: ["b", "a"], version: 1 } });
    render(<OtwPlayPlaylistEditorPage />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "최초 저장" } });
    fireEvent.click(screen.getByRole("button", { name: "1번 대표곡 지정" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다"));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "다시 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "2번 대표곡 지정" }));
    fireEvent.click(screen.getByRole("button", { name: "1번 아래로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장했습니다."));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ title: "최초 저장", representativePerformanceId: "a", performanceIds: ["a", "b"] });
    expect(mocks.save).toHaveBeenCalledWith(saved.id, expect.objectContaining({ title: "다시 수정", representativePerformanceId: "b", performanceIds: ["b", "a"] }), 0, {});
    expect(mocks.read).toHaveBeenCalledWith(saved.id, {});
  });
  it("allows corrected input after a definitive create validation rejection", async () => {
    mocks.saved = undefined;
    mocks.create.mockRejectedValueOnce(new ApiError("invalid", 400)).mockResolvedValueOnce({ data: { ...saved, version: 0 } });
    mocks.read.mockResolvedValueOnce({ data: saved });
    render(<OtwPlayPlaylistEditorPage />);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다"));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "수정된 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장했습니다."));
    expect(mocks.create.mock.calls[1][0].title).toBe("수정된 요청");
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retains input and ordering when a concurrent save is rejected", async () => {
    mocks.save.mockRejectedValue(new ApiError("conflict", 409));
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "1번 아래로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("입력은 유지됩니다"));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("내 수정");
    expect(mocks.save).toHaveBeenCalledWith("private-1", expect.objectContaining({ performanceIds: ["b", "a"], title: "내 수정" }), 2, {});
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("only announces success after authoritative readback and uses its next version", async () => {
    mocks.save.mockResolvedValue({ data: { ...saved, version: 3 } });
    mocks.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ data: { ...saved, title: "서버 제목", version: 4 } });
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다"));
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("내 수정");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장했습니다."));
    expect(mocks.save.mock.calls[1][2]).toBe(3);
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe("서버 제목");
  });
  it("prevents duplicate versions and lets a removed version be added again", () => {
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    expect(screen.getAllByRole("button", { name: "추가됨" }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "1번 삭제" }));
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    expect(screen.getByRole("heading", { name: "현재 플레이리스트 · 2개 가창" })).toBeTruthy();
  });
});


describe("playlist representative editor", () => {
  it("keeps selection across reordering, clears on removal, and previews the automatic image", () => {
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    fireEvent.click(screen.getByRole("button", { name: "2번 대표곡 지정" }));
    expect(screen.getByRole("button", { name: "2번 대표곡 지정" }).getAttribute("aria-pressed")).toBe("true");
    const preview = screen.getByLabelText("대표이미지 미리보기");
    expect(preview.querySelector("img")?.getAttribute("src")).toBe("https://img.test/b.jpg");
    fireEvent.click(screen.getByRole("button", { name: "2번 위로 이동" }));
    expect(screen.getByRole("button", { name: "1번 대표곡 지정" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "1번 삭제" }));
    expect(screen.queryByRole("button", { name: "자동 이미지 사용" })).toBeNull();
    expect(preview.querySelector("img")?.getAttribute("src")).toBe("https://img.test/a.jpg");
  });
  it("roundtrips representative selection through save and server readback", async () => {
    mocks.save.mockResolvedValue({ data: { ...saved, version: 3, representativePerformanceId: "b" } });
    mocks.read.mockResolvedValue({ data: { ...saved, version: 3, representativePerformanceId: "b" } });
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    fireEvent.click(screen.getByRole("button", { name: "2번 대표곡 지정" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장했습니다."));
    expect(mocks.save).toHaveBeenCalledWith(saved.id, expect.objectContaining({ representativePerformanceId: "b" }), 2, {});
    expect(screen.getByRole("button", { name: "2번 대표곡 지정" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "자동 이미지 사용" }));
    expect(screen.getByRole("button", { name: "2번 대표곡 지정" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("keeps a withdrawn selection in the draft while displaying replacement guidance", async () => {
    mocks.saved = { ...saved, performanceIds: ["gone", "a"], representativePerformanceId: "gone" };
    mocks.save.mockRejectedValue(new ApiError("conflict", 409));
    render(<OtwPlayPlaylistEditorPage playlistId="private-1" />);
    expect(screen.getByText("대표곡 교체 필요 · 자동 이미지 사용 중")).toBeTruthy();
    expect((screen.getByRole("button", { name: "1번 대표곡 지정" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith(saved.id, expect.objectContaining({ representativePerformanceId: "gone" }), 2, {}));
  });
});
