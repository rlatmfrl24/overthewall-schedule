// @vitest-environment jsdom
import React, { type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiError } from "@/shared/api/client";
import { OtwPlayDefaultPlaylistManager } from "./default-playlist-manager";

const mocks = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn(), save: vi.fn(), browse: vi.fn(), resolve: vi.fn() }));
vi.mock("@clerk/clerk-react", () => ({ useUser: () => ({ user: { id: "admin" } }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("@/shared/lib/unsaved-changes", () => ({ useUnsavedChanges: () => async () => true }));
vi.mock("../../api/playlists", () => ({ fetchAdminDefaultPlaylists: mocks.list, fetchAdminDefaultPlaylist: mocks.read,
  saveAdminDefaultPlaylist: mocks.save, fetchPlaylistPerformances: mocks.browse, resolvePlaylistPerformances: mocks.resolve }));
const base = { id: "cover", title: "커버곡 모음", description: "기본 설명", version: 0, representativePerformanceId: null,
  imageUrl: null, query: { relation: "cover" }, songCount: 61, performanceCount: 61,
  defaults: { title: "커버곡 모음", description: "기본 설명", imageUrl: null },
  overrides: { title: null, description: null, representativePerformanceId: null }, representativeAvailable: false };
const track = (index: number) => ({ song: { id: `s${index}`, title: `노래 ${index}` }, performance: { id: `p${index}`, playable: true,
  selectedSource: { thumbnailUrl: `https://img.test/${index}.jpg` }, participants: [], releasedAt: null } });
const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><OtwPlayDefaultPlaylistManager /></QueryClientProvider>);
  return { ...result, client };
};
beforeEach(() => {
  vi.stubGlobal("React", React); vi.resetAllMocks();
  mocks.list.mockResolvedValue({ data: [base] }); mocks.read.mockResolvedValue({ data: base });
  mocks.browse.mockResolvedValue({ data: { items: [track(1)] }, nextCursor: null });
  mocks.resolve.mockResolvedValue({ data: { items: [track(61)], unavailableIds: [] } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("default playlist management flow", () => {
  it("selects a representative after page 60, saves metadata, and shows authoritative readback", async () => {
    mocks.browse.mockResolvedValueOnce({ data: { items: Array.from({ length: 60 }, (_, i) => track(i + 1)) }, nextCursor: "page-two" })
      .mockResolvedValueOnce({ data: { items: [track(61)] }, nextCursor: null });
    const updated = { ...base, title: "새 커버 모음", description: "새 설명", representativePerformanceId: "p61", version: 1,
      imageUrl: "https://img.test/61.jpg", representativeAvailable: true,
      overrides: { title: "새 커버 모음", description: "새 설명", representativePerformanceId: "p61" } };
    mocks.save.mockResolvedValue({ data: updated }); mocks.read.mockResolvedValue({ data: updated });
    const { client } = show();
    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "노래 61 대표곡 지정" }));
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "새 커버 모음" } });
    fireEvent.change(screen.getByLabelText("설명"), { target: { value: "새 설명" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("저장했습니다.");
    expect(mocks.browse.mock.calls[1][0]).toMatchObject({ relation: "cover", cursor: "page-two" });
    expect(mocks.browse.mock.calls[1][1]).toMatchObject({ adminPreview: true });
    expect(mocks.save).toHaveBeenCalledWith("cover", updated.overrides, 0);
    expect(mocks.read).toHaveBeenCalledWith("cover");
    expect(screen.getByLabelText("대표이미지 미리보기").querySelector("img")?.src).toBe(updated.imageUrl);
    client.clear();
  });
  it("preserves edits after conflicts and restores defaults only through an explicit save", async () => {
    mocks.save.mockRejectedValue(new ApiError("conflict", 409));
    const { client } = show();
    await screen.findByRole("button", { name: "노래 1 대표곡 지정" });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "유지할 입력" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("입력은 유지됩니다"));
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("유지할 입력");
    fireEvent.click(screen.getByRole("button", { name: "기본 설정으로 복원" }));
    expect((screen.getByLabelText("이름") as HTMLInputElement).value).toBe("커버곡 모음");
    expect(mocks.save).toHaveBeenCalledTimes(1);
    client.clear();
  });
  it("retains the acknowledged version when readback fails and retries without discarding edits", async () => {
    const updated = { ...base, version: 1, title: "다시 저장", overrides: { ...base.overrides, title: "다시 저장" } };
    mocks.save.mockResolvedValue({ data: updated });
    mocks.read.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: updated });
    const { client } = show();
    await screen.findByRole("button", { name: "노래 1 대표곡 지정" });
    fireEvent.change(screen.getByLabelText("이름"), { target: { value: "다시 저장" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("저장하지 못했습니다. 입력은 유지됩니다.");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await screen.findByText("저장했습니다.");
    expect(mocks.save.mock.calls[1]).toEqual(["cover", updated.overrides, 1]);
    client.clear();
  });
});
