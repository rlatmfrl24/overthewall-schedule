// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ collect: vi.fn(), append: vi.fn(() => "추가 완료"), owner: "first" }));
vi.mock("../use-cases/resolve-playlist", () => ({ collectPlaylist: mocks.collect }));
vi.mock("./use-public-catalog", () => ({ usePublicRequestOptions: () => ({}) }));
vi.mock("../player/play-player-context", () => ({ useOtwPlayPlayer: () => ({ enqueueBatch: mocks.append }) }));
vi.mock("@clerk/clerk-react", () => ({ useUser: () => ({ user: mocks.owner ? { id: mocks.owner } : null }) }));
import { usePlaylistActions, usePlaylistOwner } from "./use-playlists";
const empty = { items: [], unavailableIds: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.owner = "first"; mocks.append.mockReturnValue("추가 완료"); });
afterEach(cleanup);
describe("playlist asynchronous actions", () => {
  it("passes the explicit playback request only after the whole playlist resolves", async () => {
    mocks.collect.mockResolvedValueOnce(empty);
    const { result } = renderHook(usePlaylistActions);
    act(() => result.current.add("a", ["a"], true));
    await waitFor(() => expect(mocks.append).toHaveBeenCalledWith([], 0, true));
  });
  it("serializes different clicks and resolves each whole list before appending", async () => {
    let finish!: (value: typeof empty) => void;
    mocks.collect.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(empty);
    const { result } = renderHook(usePlaylistActions);
    act(() => { result.current.add("a", ["a"]); result.current.add("b", ["b"]); });
    await waitFor(() => expect(mocks.collect).toHaveBeenCalledTimes(1));
    expect(mocks.append).not.toHaveBeenCalled();
    await act(async () => finish(empty));
    await waitFor(() => expect(mocks.append).toHaveBeenCalledTimes(2));
    expect(mocks.collect.mock.calls.map(call => call[0])).toEqual([["a"], ["b"]]);
  });
  it("cancels queued and in-flight work without partially appending", async () => {
    let finish!: (value: typeof empty) => void;
    mocks.collect.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(usePlaylistActions);
    act(() => { result.current.add("a", ["a"]); result.current.add("b", ["b"]); });
    await waitFor(() => expect(mocks.collect).toHaveBeenCalledTimes(1));
    act(() => result.current.cancel());
    await act(async () => finish(empty));
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.collect).toHaveBeenCalledTimes(1);
    expect(mocks.collect.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("removes private cache on account change and logout while retaining public data", () => {
    const client = new QueryClient();
    client.setQueryData(["otw-play-private", "first", "playlists"], ["private"]);
    client.setQueryData(["otw-play", "playlist-defaults"], ["public"]);
    const { rerender } = renderHook(usePlaylistOwner, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    mocks.owner = "second"; rerender();
    expect(client.getQueryData(["otw-play-private", "first", "playlists"])).toBeUndefined();
    client.setQueryData(["otw-play-private", "second", "playlists"], ["private"]);
    mocks.owner = ""; rerender();
    expect(client.getQueryData(["otw-play-private", "second", "playlists"])).toBeUndefined();
    expect(client.getQueryData(["otw-play", "playlist-defaults"])).toEqual(["public"]);
  });
});
