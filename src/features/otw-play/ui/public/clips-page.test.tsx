// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React, { type ReactNode } from "react";
import { OtwPlayClipsPage } from "./clips-page";

const mocks = vi.hoisted(() => ({ browse: vi.fn(), play: vi.fn(), enqueue: vi.fn() }));
vi.mock("../../queries/use-playlists", () => ({ usePlaylistPerformances: mocks.browse }));
vi.mock("@tanstack/react-query", async (importOriginal) => ({ ...await importOriginal<typeof import("@tanstack/react-query")>(), useQuery: () => ({ data: [{ uid: 7, name: "가창 멤버" }] }) }));
vi.mock("@/features/members", () => ({ fetchActiveMembers: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to, params, search, ...props }: { children: ReactNode; to: string; params?: { songSlug?: string }; search?: { performance?: string } }) => <a {...props} href={`${to.replace("$songSlug", params?.songSlug ?? "")}?performance=${search?.performance ?? ""}`}>{children}</a> }));
vi.mock("../otw-play-thumbnail", () => ({ OtwPlayThumbnail: () => <span /> }));
vi.mock("../../player/play-player-context", () => ({ useOtwPlayPlayer: () => ({ queue: { items: [] }, play: mocks.play, enqueue: mocks.enqueue }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); window.localStorage.clear(); });

describe("노래 클립 탐색", () => {
  it("keeps separate performances of the same song reachable and playable in every view", () => {
    const song = { id: "song", slug: "song", title: "같은 노래", tags: [], isOtwOriginal: false, originalArtists: [{ displayName: "원곡 가수" }] };
    const items = [30, 180].map(startSeconds => ({ song, performance: {
      id: `clip-${startSeconds}`, releaseType: "broadcast", relation: "cover", participation: "solo", tags: [], playable: true, participants: [],
      broadcast: { performedOn: "2025-10-26" }, releasedAt: "2026-09-15",
      selectedSource: { playable: true, externalId: "BBBBBBBBBBB", startSeconds, endSeconds: startSeconds + 90, channel: { displayName: "승인 채널" } },
    } }));
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items } }] } });
    render(<OtwPlayClipsPage />);
    for (const view of ["그리드", "표 리스트", "카드"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      expect(screen.getAllByRole("link").some(link => link.getAttribute("href") === "/play/clips/song?performance=clip-180")).toBe(true);
      const provenance = view === "표 리스트" ? screen.getAllByRole("row").slice(1) : screen.getAllByRole("article");
      if (view === "표 리스트") {
        expect(screen.getByRole("columnheader", { name: "클리퍼" })).toBeTruthy();
        expect(screen.getByRole("columnheader", { name: "방송일" })).toBeTruthy();
      }
      expect(provenance).toHaveLength(2);
      expect(within(provenance[1]).getByText("승인 채널")).toBeTruthy();
      expect(within(provenance[1]).getByText("2025-10-26")).toBeTruthy();
      expect(within(provenance[1]).queryByText("2026-09-15")).toBeNull();
      fireEvent.click(screen.getAllByRole("button", { name: /재생$/ })[1]);
      expect(mocks.play).toHaveBeenLastCalledWith(expect.objectContaining({ performance: items[1].performance, source: items[1].performance.selectedSource }));
    }
  });
  it("shows unknown broadcast information and sends the actual segment to the shared queue", () => {
    const song = { id: "song", slug: "song", title: "같은 노래", tags: [], isOtwOriginal: false, originalArtists: [{ displayName: "원곡 가수" }] };
    const performance = { id: "clip", releaseType: "broadcast", relation: "cover", participation: "solo", tags: [], playable: true, participants: [], broadcast: { performedOn: null, originalUrl: null, dateEvidence: null, extent: "partial" },
      selectedSource: { playable: true, externalId: "BBBBBBBBBBB", startSeconds: 30, endSeconds: 150, channel: { displayName: "승인 채널" } } };
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items: [{ song, performance }] } }] } });
    render(<OtwPlayClipsPage />);
    expect(mocks.browse).toHaveBeenCalledWith({ scope: "broadcast" });
    expect(screen.getByText("가창일 미확인")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "원본 방송 보기" })).toBeNull();
    expect(screen.getByText("일부 가창")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "재생" }));
    expect(mocks.play).toHaveBeenCalledWith({ song: expect.objectContaining(song), performance, source: performance.selectedSource });
    fireEvent.click(screen.getByRole("button", { name: "마지막에 추가" }));
    expect(mocks.enqueue).toHaveBeenCalledWith({ song: expect.objectContaining(song), performance, source: performance.selectedSource });
    expect(screen.queryByRole("button", { name: /플레이리스트.*저장/ })).toBeNull();
  });
  it("keeps unknown dates distinct from date ranges and filters by the selected member", () => {
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items: [] } }] } });
    render(<OtwPlayClipsPage />);
    fireEvent.change(screen.getByLabelText("곡 검색"), { target: { value: "노래" } });
    fireEvent.click(screen.getByRole("button", { name: "필터" }));
    fireEvent.click(screen.getByRole("button", { name: "가창 멤버" }));
    fireEvent.change(screen.getByLabelText("방송일 시작"), { target: { value: "2026-09-01" } });
    fireEvent.click(screen.getByLabelText("방송일 미확인만 보기"));
    expect(screen.getByLabelText("방송일 시작")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "검색" }));
    expect(mocks.browse).toHaveBeenLastCalledWith({ scope: "broadcast", q: "노래", member: 7, dateUnknown: true, broadcastFrom: undefined, broadcastTo: undefined });
  });
  it("shows missing provenance in every view without substituting the catalog publication date", () => {
    const song = { id: "song", slug: "song", title: "노래", tags: [], isOtwOriginal: false };
    const performance = { id: "clip", releaseType: "broadcast", relation: "cover", participation: "solo", tags: [], playable: false,
      participants: [], selectedSource: null, releasedAt: "2026-09-15", broadcast: { performedOn: null } };
    mocks.browse.mockReturnValue({ data: { pages: [{ data: { items: [{ song, performance }] } }] } });
    render(<OtwPlayClipsPage />);
    for (const view of ["카드", "표 리스트", "그리드"]) {
      fireEvent.click(screen.getByRole("button", { name: view }));
      const provenance = within(view === "표 리스트" ? screen.getAllByRole("row")[1] : screen.getByRole("article"));
      expect(provenance.getByText("클리퍼 미확인")).toBeTruthy();
      expect(provenance.getByText(view === "카드" ? "가창일 미확인" : "방송일 미확인")).toBeTruthy();
      expect(provenance.queryByText("2026-09-15")).toBeNull();
    }
  });
});
