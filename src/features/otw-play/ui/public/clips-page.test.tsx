// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { OtwPlayClipsPage } from "./clips-page";

const mocks = vi.hoisted(() => ({ browse: vi.fn(), play: vi.fn(), enqueue: vi.fn() }));
vi.mock("../../queries/use-playlists", () => ({ usePlaylistPerformances: mocks.browse }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({ ...await importOriginal<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: [{ uid: 7, name: "가창 멤버" }] }) }));
vi.mock("@/features/members", () => ({ fetchActiveMembers: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: ReactNode }) => <a>{children}</a> }));
vi.mock("../otw-play-thumbnail", () => ({ OtwPlayThumbnail: () => <span /> }));
vi.mock("../../player/play-player-context", () => ({ useOtwPlayPlayer: () => ({ queue: { items: [] }, play: mocks.play, enqueue: mocks.enqueue }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("노래 클립 탐색", () => {
  it("shows unknown broadcast information and sends the actual segment to the shared queue", () => {
    const song = { id: "song", slug: "song", title: "같은 노래" };
    const performance = { id: "clip", releaseType: "broadcast", participants: [], broadcast: { performedOn: null, originalUrl: null, dateEvidence: null, extent: "partial" },
      selectedSource: { playable: true, externalId: "BBBBBBBBBBB", startSeconds: 30, endSeconds: 150, channel: { displayName: "승인 채널" } } };
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items: [{ song, performance }] } }] } });
    render(<OtwPlayClipsPage />);
    expect(mocks.browse).toHaveBeenCalledWith({ scope: "broadcast" });
    expect(screen.getAllByText("미확인")).toHaveLength(2);
    expect(screen.getByText("일부 가창")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(mocks.play).toHaveBeenCalledWith({ song, performance, source: performance.selectedSource });
    fireEvent.click(screen.getByRole("button", { name: "마지막에 추가" }));
    expect(mocks.enqueue).toHaveBeenCalledWith({ song, performance, source: performance.selectedSource });
    expect(screen.queryByRole("button", { name: /플레이리스트.*저장/ })).toBeNull();
  });
  it("keeps unknown dates distinct from date ranges and filters by the selected member", () => {
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items: [] } }] } });
    render(<OtwPlayClipsPage />);
    fireEvent.change(screen.getByLabelText("곡 검색"), { target: { value: "노래" } });
    fireEvent.change(screen.getByLabelText("가창 멤버"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("방송일 시작"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText("방송일 미확인만 보기"));
    expect(screen.getByLabelText("방송일 시작")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(mocks.browse).toHaveBeenLastCalledWith({ scope: "broadcast", q: "노래", member: 7, dateUnknown: true, broadcastFrom: undefined, broadcastTo: undefined });
  });
});
