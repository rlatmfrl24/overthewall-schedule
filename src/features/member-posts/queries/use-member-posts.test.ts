// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/query-client";
import { useMemberPosts } from "./use-member-posts";

const fetchMemberPostsAggregateMock = vi.hoisted(() => vi.fn());

vi.mock("../api/member-posts-api", () => ({
  fetchMemberPostsAggregate: fetchMemberPostsAggregateMock,
}));

const makePolicy = (source: "x" | "naver-cafe") => ({
  source,
  requested: true,
  admin: false,
  enabled: true,
  visibility: "public" as const,
  accessible: true,
  status: "visible" as const,
  reason: null,
  publicPath: "/feed",
  monitorPath: "/admin/member-posts",
  apiPath: `/api/member-posts?sources=${source}`,
});

describe("useMemberPosts", () => {
  beforeEach(() => {
    fetchMemberPostsAggregateMock.mockReset();
  });

  it("기존 aggregate 데이터가 있는 reload 실패는 두 source를 stale로 표시한다", async () => {
    fetchMemberPostsAggregateMock
      .mockResolvedValueOnce({
        updatedAt: "2026-05-27T00:00:00Z",
        posts: [],
        x: {
          posts: [],
          byHandle: [],
          updatedAt: "2026-05-27T00:00:00Z",
          error: null,
          policy: makePolicy("x"),
        },
        naverCafe: {
          posts: [],
          sources: [],
          updatedAt: "2026-05-27T00:00:00Z",
          error: null,
          policy: makePolicy("naver-cafe"),
        },
      })
      .mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useMemberPosts(), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow("network");
    });

    await waitFor(() => expect(result.current.x.stale).toBe(true));
    expect(result.current.naverCafe.stale).toBe(true);
  });
});

const feedPage = (ids: string[], nextCursor: string | null) => ({
  updatedAt: "2026-09-17T00:00:00Z", nextCursor,
  posts: ids.map(id => ({ id, kind: "x", createdAt: "2026-09-16T00:00:00Z", memberUid: 1, post: { id } })),
  x: { posts: [], byHandle: [], updatedAt: "", error: null, policy: makePolicy("x") },
  naverCafe: { posts: [], sources: [], updatedAt: "", error: null, policy: makePolicy("naver-cafe") },
});

describe("member feed pagination", () => {
  beforeEach(() => fetchMemberPostsAggregateMock.mockReset());
  it("retains loaded posts after failure and retries the same cursor without duplicates", async () => {
    fetchMemberPostsAggregateMock.mockResolvedValueOnce(feedPage(["a"], "next"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(feedPage(["a", "b"], null));
    const { result } = renderHook(() => useMemberPosts({ paginated: true }), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    expect(result.current.posts.map(post => post.id)).toEqual(["a"]);
    await waitFor(() => expect(result.current.loadMoreError).toBe(true));
    await act(async () => { await result.current.loadMore(); });
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(["a", "b"]));
    expect(result.current.hasNextPage).toBe(false);
    expect(fetchMemberPostsAggregateMock.mock.calls.slice(1).map(([options]) => options.cursor)).toEqual(["next", "next"]);
  });
  it("starts a new cursor for a selected member and cannot mix late previous results", async () => {
    let finish!: (value: ReturnType<typeof feedPage>) => void;
    fetchMemberPostsAggregateMock.mockResolvedValueOnce(feedPage(["all"], "older"))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce(feedPage(["member2"], null));
    const { result, rerender } = renderHook(({ memberUid }: { memberUid?: number }) => useMemberPosts({ paginated: true, memberUid }), {
      initialProps: {}, wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    act(() => { void result.current.loadMore(); });
    rerender({ memberUid: 2 });
    await waitFor(() => expect(result.current.posts.map(post => post.id)).toEqual(["member2"]));
    await act(async () => finish(feedPage(["old"], null)));
    expect(result.current.posts.map(post => post.id)).toEqual(["member2"]);
    expect(fetchMemberPostsAggregateMock.mock.calls[2][0]).toMatchObject({ memberUid: 2, cursor: undefined });
  });
});
