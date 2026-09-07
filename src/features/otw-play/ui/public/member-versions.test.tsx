// @vitest-environment jsdom
import React, { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";

const mocks = vi.hoisted(() => ({ catalog: vi.fn(), facets: vi.fn(), detail: vi.fn(), play: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search }: { children: React.ReactNode; search?: unknown }) => <a href="#" data-search={JSON.stringify(search)}>{children}</a>,
}));
vi.mock("../../queries/use-public-catalog", () => ({ useOtwPlayCatalog: mocks.catalog, useOtwPlayFacets: mocks.facets, useOtwPlaySong: mocks.detail }));
vi.mock("./catalog-components", () => ({
  OtwPlaySongRow: ({ song }: { song: { title: string } }) => <h2>{song.title}</h2>,
  OtwPlayPerformanceActions: ({ performance }: { performance: { id: string } }) => <button onClick={() => mocks.play(performance.id)}>가창 재생</button>,
}));
import { OtwPlayMembersPage } from "./members-page";
import { OtwPlaySongEntry } from "./song-version-list";

const song = { id: "song-1", slug: "song-one", title: "노래" } as OtwPlayPublicSongSummaryDto;
describe("member discovery and real version selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.facets.mockReturnValue({ data: { data: { members: [{ memberUid: 7, code: "hane", displayName: "하네" }] } } });
    mocks.catalog.mockReturnValue({ data: { pages: [{ data: { items: [song] } }] } });
    mocks.detail.mockReturnValue({ data: { data: { ...song, performances: [{ id: "version-2", participants: [], relation: "cover", releasedAt: null }] } } });
  });
  afterEach(cleanup);
  it("does not query all songs before selecting a current member and uses vocal filtering", () => {
    const change = vi.fn();
    const view = render(<OtwPlayMembersPage search={{}} onSearchChange={change} />);
    expect(mocks.catalog.mock.lastCall?.[1]).toEqual({ enabled: false });
    fireEvent.click(screen.getByRole("button", { name: "하네" }));
    expect(change).toHaveBeenCalledWith({ member: "7", participantRole: "vocal", relation: undefined, sort: undefined });
    view.rerender(<OtwPlayMembersPage search={{ member: "7", participantRole: "vocal", relation: "cover" }} onSearchChange={change} />);
    expect(mocks.catalog.mock.lastCall?.[0]).toMatchObject({ member: [7], participantRole: "vocal", relation: "cover" });
    expect(mocks.catalog.mock.lastCall?.[1]).toEqual({ enabled: true });
    expect(screen.getByRole("button", { name: "하네" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("fetches detail only when expanded and plays the selected actual version", () => {
    function Entries() {
      const [expanded, setExpanded] = useState<string | null>(null);
      return [song, { ...song, id: "song-2", slug: "song-two", title: "다른 곡" }].map(item =>
        <OtwPlaySongEntry key={item.id} song={item} expanded={expanded === item.id} onToggle={() => setExpanded(expanded === item.id ? null : item.id)} />);
    }
    render(<Entries />);
    expect(mocks.detail).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "버전 보기 · 노래" }));
    expect(mocks.detail).toHaveBeenLastCalledWith("song-one");
    fireEvent.click(screen.getByRole("button", { name: "가창 재생" }));
    expect(mocks.play).toHaveBeenCalledWith("version-2");
    fireEvent.click(screen.getByRole("button", { name: "버전 보기 · 다른 곡" }));
    expect(screen.getAllByRole("button", { name: "버전 닫기" })).toHaveLength(1);
    expect(mocks.detail).toHaveBeenLastCalledWith("song-two");
    fireEvent.click(screen.getByRole("button", { name: "버전 닫기" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "버전 보기 · 다른 곡" }));
  });
});
