// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SavedMultiviewChannel } from "@contracts/multiview";
const session = vi.hoisted(() => ({ owner: "alice", isLoaded: true, isSignedIn: true }));
vi.mock("@clerk/clerk-react", () => ({ useUser: () => ({ ...session, user: { id: session.owner } }) }));
import { usePersonalMultiview } from "./use-personal-multiview";
const id = "a".repeat(32), row = { channelId: id, channelName: "My channel", channelImageUrl: null, addedAt: 1 };
let rows: SavedMultiviewChannel[], failRead: boolean, writes: number, fetches: number;
beforeEach(() => {
  Object.assign(session, { owner: "alice", isLoaded: true, isSignedIn: true }); rows = []; failRead = false; writes = 0; fetches = 0;
  Object.assign(window, { Clerk: { session: { getToken: async () => session.owner } } });
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    fetches++;
    if (init.method === "POST") { writes++; rows = [row]; return Response.json({ item: row }); }
    if (init.method === "DELETE") { rows = []; return Response.json({ deleted: true }); }
    if (path.endsWith("live-status")) return Response.json({ items: [{ channelId: id, content: null }], updatedAt: "now" });
    if (failRead) return Response.json({ error: { message: "Unavailable" } }, { status: 503 });
    return Response.json({ items: session.owner === "alice" ? rows : [], limit: 30 });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(window, "Clerk"); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...renderHook(usePersonalMultiview, { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }) };
}
it.each(["loading", "signed-out"])("does not fetch a private list while auth is %s", async mode => {
  session.isLoaded = mode !== "loading"; session.isSignedIn = false;
  const { result } = mount();
  expect(result.current.channels).toEqual([]);
  await act(async () => {});
  expect(fetches).toBe(0);
});
it("reads the persisted list after adding and removing instead of just appending a local row", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.add(id));
  await waitFor(() => expect(result.current.channels).toEqual([row]));
  expect(writes).toBe(1);
  await act(() => result.current.remove(id));
  await waitFor(() => expect(result.current.channels).toEqual([]));
});
it("distinguishes a committed save followed by a failed list read", async () => {
  const { result } = mount();
  await waitFor(() => expect(result.current.loading).toBe(false));
  failRead = true;
  await act(() => result.current.add(id));
  expect(writes).toBe(1);
  expect(result.current.addError?.message).toBe("저장됐지만 목록을 다시 불러오지 못했어요. 다시 불러와 주세요.");
  expect(result.current.listError).toBeTruthy();
});
it("cancels a late write on account switch and never inserts its result into the new account", async () => {
  let finish!: (response: Response) => void;
  let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (init.method === "POST") { signal = init.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve; }); }
    return Response.json(path.endsWith("live-status") ? { items: [] } : { items: [], limit: 30 });
  });
  const { result, rerender, client } = mount();
  await waitFor(() => expect(result.current.loading).toBe(false));
  let operation!: Promise<void>;
  act(() => { operation = result.current.add(id); });
  await waitFor(() => expect(signal).toBeDefined());
  session.owner = "bob"; rerender();
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => { finish(Response.json({ item: row })); await operation; });
  expect(result.current.channels).toEqual([]);
  expect(result.current.addError).toBeNull();
  expect(client.getQueryCache().findAll({ queryKey: ["multiview-private", "otw", "alice"] })).toEqual([]);
});
