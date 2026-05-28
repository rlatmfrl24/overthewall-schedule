import { describe, expect, it } from "vitest";
import type { XPost } from "@/lib/types";
import { filterXPostsByMembers } from "./use-x-posts";

const makePost = (id: string, memberUid?: number): XPost => ({
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
