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
