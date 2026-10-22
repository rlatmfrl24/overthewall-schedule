// @vitest-environment jsdom
import React from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { createMemberFixture } from "@/test/member-fixtures";
import { useMultiviewSources } from "./use-multiview-sources";
const id = "a".repeat(32), other = "b".repeat(32);
const member = createMemberFixture({ uid: 1, code: "public", name: "Public member", url_chzzk: `https://chzzk.naver.com/${id}` });
const saved = (channelId: string) => ({ channelId, channelName: "Saved channel", channelImageUrl: null, addedAt: 1 });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps a verified personal live status when the same default channel's public query fails", async () => {
  vi.stubGlobal("fetch", async () => new Response("unavailable", { status: 503 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMultiviewSources([member], { channels: [saved(id)], statuses: [{ channelId: id, content: { channelId: id, channelName: "External", channelImageUrl: "", status: "OPEN", liveTitle: "Live", concurrentUserCount: 1, liveImageUrl: "", defaultThumbnailImageUrl: "" } }], loading: false, isError: false }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.sources).toHaveLength(1);
  expect(result.current.sources[0]?.member?.uid).toBe(1);
  expect(result.current.sources[0]?.isLive).toBe(true);
});
it("merges personal channels by channel id without inventing members and keeps public LIVE during a private failure", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ items: [{ channelId: id, content: { channelId: id, status: "OPEN" } }] }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useMultiviewSources([member], { channels: [saved(id), saved(other)], statuses: [], loading: false, isError: true }), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
  await waitFor(() => expect(result.current.sources).toHaveLength(2));
  await waitFor(() => expect(result.current.sources.find(x => x.channelId === id)?.isLive).toBe(true));
  expect(result.current.sources.find(x => x.channelId === id)?.member?.uid).toBe(1);
  expect(result.current.sources.find(x => x.channelId === other)?.member).toBeUndefined();
  expect(result.current.sources.find(x => x.channelId === other)?.isLive).toBe(false);
});
