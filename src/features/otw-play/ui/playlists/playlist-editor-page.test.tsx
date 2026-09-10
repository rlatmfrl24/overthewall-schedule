// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/client";

const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn(), read: vi.fn(), invalidate: vi.fn(), saved: undefined as unknown }));
const tracks = ["a", "b"].map(id => ({ song: { id: `song-${id}`, title: `노래 ${id}` }, performance: { id, participants: [], releasedAt: null } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { items: tracks } }), useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("@/shared/seo/use-site-seo", () => ({ useSiteSeo: vi.fn() }));
vi.mock("@/shared/lib/unsaved-changes", () => ({ useUnsavedChanges: () => async () => true }));
vi.mock("../../queries/use-public-catalog", () => ({ usePublicRequestOptions: () => ({}) }));
vi.mock("../../queries/use-playlists", () => ({
  usePlaylistOwner: () => "owner", useMyPlaylist: () => ({ data: mocks.saved ? { data: mocks.saved } : undefined }),
  usePlaylistDefaults: () => ({ data: { data: { items: [] } } }),
  usePlaylistPerformances: () => ({ isSuccess: true, data: { pages: [{ data: { items: tracks } }] } }),
}));
vi.mock("../../api/playlists", () => ({ createMyPlaylist: mocks.create, saveMyPlaylist: mocks.save, fetchMyPlaylist: mocks.read }));
vi.mock("./playlist-components", () => ({ PlaylistLoginGate: ({ children }: { children: ReactNode }) => <>{children}</>,
  PerformanceRow: ({ item, children }: { item: typeof tracks[number]; children: ReactNode }) => <div>{item.song.title}{children}</div> }));
import { OtwPlayPlaylistEditorPage } from "./playlist-editor-page";

const saved = { id: "private-1", title: "저장 목록", description: "", performanceIds: ["a", "b"], originDefaultId: null, version: 2, itemCount: 2, createdAt: 1, updatedAt: 1 };
beforeEach(() => { vi.stubGlobal("React", React); vi.clearAllMocks(); mocks.saved = saved; mocks.invalidate.mockResolvedValue(undefined); });
afterEach(cleanup);
describe("playlist editor persistence", () => {
  it("recovers a lost create response with the original payload before saving edited input", async () => {
    mocks.saved = undefined;
    mocks.create.mockRejectedValueOnce(new TypeError("response lost")).mockResolvedValueOnce({ data: { ...saved, version: 0 } });
    mocks.save.mockResolvedValueOnce({ data: { ...saved, title: "다시 수정", performanceIds: ["b", "a"], version: 1 } });
    mocks.read.mockResolvedValueOnce({ data: { ...saved, title: "다시 수정", performanceIds: ["b", "a"], version: 1 } });
    render(<OtwPlayPlaylistEditorPage />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "최초 저장" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("저장하지 못했습니다"));
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "다시 수정" } });
    fireEvent.click(screen.getByRole("button", { name: "1번 아래로 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("저장했습니다."));
    expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
    expect(mocks.create.mock.calls[1][0]).toMatchObject({ title: "최초 저장", performanceIds: ["a", "b"] });
    expect(mocks.save).toHaveBeenCalledWith(saved.id, expect.objectContaining({ title: "다시 수정", performanceIds: ["b", "a"] }), 0, {});
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
