// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDto } from "@contracts/members";
import { createQueryWrapper } from "@/test/query-client";
import type { XPostViewModel } from "../model/types";
import { filterXPostsByMembers } from "../model/filter-x-posts";
import { useXPosts } from "./use-x-posts";

const fetchMembersXPostsMock = vi.hoisted(() => vi.fn());

vi.mock("../api/x-posts-api", () => ({
  fetchMembersXPosts: fetchMembersXPostsMock,
}));

const makePost = (id: string, memberUid?: number): XPostViewModel => ({
  id,
  text: "게시글",
  createdAt: "2026-02-13T00:00:00Z",
  url: `https://x.com/member/status/${id}`,
  username: "member",
  metrics: {
    likeCount: 0,
    replyCount: 0,
    repostCount: 0,
    quoteCount: 0,
  },
  media: [],
  memberUid,
});

const makeMember = (): MemberDto => ({
  uid: 1,
  code: "member",
  name: "멤버",
  main_color: null,
  sub_color: null,
  oshi_mark: null,
  url_twitter: "https://x.com/member",
  url_youtube: null,
  url_chzzk: null,
  youtube_channel_id: null,
  birth_date: null,
  debut_date: null,
  unit_name: null,
  fan_name: null,
  introduction: null,
  is_deprecated: 0,
});

describe("filterXPostsByMembers", () => {
  it("선택된 멤버가 없으면 원본 배열을 반환한다", () => {
    const posts = [makePost("p1", 1)];

    const result = filterXPostsByMembers(posts, null);

    expect(result).toBe(posts);
  });

  it("선택된 멤버 uid 기준으로 필터링한다", () => {
    const posts = [makePost("p1", 1), makePost("p2", 2), makePost("p3")];

    const result = filterXPostsByMembers(posts, [2]);

    expect(result.map((post) => post.id)).toEqual(["p2"]);
  });
});

describe("useXPosts", () => {
  beforeEach(() => {
    fetchMembersXPostsMock.mockReset();
  });

  it("기존 데이터가 있는 reload 실패는 stale 상태로 표시한다", async () => {
    const member = makeMember();
    fetchMembersXPostsMock
      .mockResolvedValueOnce({
        posts: [makePost("p1", 1)],
        byHandle: [],
        updatedAt: "2026-05-27T00:00:00Z",
      })
      .mockRejectedValueOnce(new Error("network"));

    const { result } = renderHook(() => useXPosts([member]), {
      wrapper: createQueryWrapper(),
    });
    await waitFor(() => expect(result.current.hasLoaded).toBe(true));

    await act(async () => {
      await expect(result.current.reload()).rejects.toThrow("network");
    });

    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.posts[0]?.id).toBe("p1");
  });

  it("비활성화되면 요청하지 않는다", async () => {
    const { result } = renderHook(
      () => useXPosts([makeMember()], { enabled: false }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hasLoaded).toBe(false);
    expect(fetchMembersXPostsMock).not.toHaveBeenCalled();
  });

  it("기본 조회 개수와 stale source 메타를 반환한다", async () => {
    fetchMembersXPostsMock.mockResolvedValue({
      posts: [],
      updatedAt: "2026-02-13T00:00:00Z",
      byHandle: [
        {
          handle: "member",
          userId: "u1",
          posts: [],
          error: null,
          stale: true,
        },
      ],
    });
    const member = makeMember();
    const { result } = renderHook(() => useXPosts([member]), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.hasLoaded).toBe(true));
    expect(fetchMembersXPostsMock).toHaveBeenCalledWith([member], {
      admin: false,
      force: false,
      maxResults: 5,
    });
    expect(result.current.updatedAt).toBe("2026-02-13T00:00:00Z");
    expect(result.current.byHandle[0]?.handle).toBe("member");
    expect(result.current.stale).toBe(true);
  });
});
