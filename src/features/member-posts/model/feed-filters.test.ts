import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnifiedMemberPostDto } from "@contracts/member-posts";
import { filterFeed, groupFeed } from "./feed-filters";

const makeX = (id: string, createdAt: string, reply = false, quote = false): UnifiedMemberPostDto => ({
  kind: "x", id, memberUid: 1, createdAt,
  post: { id, createdAt, text: id, username: "member", url: `https://x.com/member/status/${id}`, media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 }, reply: reply ? { postId: "parent", conversationId: null, post: null } : null, quote: quote ? { postId: "quote", post: null } : null },
});

describe("피드 필터와 날짜 구분", () => {
  afterEach(() => vi.useRealTimers());
  it("답글과 인용을 모두 유지하며 멤버·출처만 필터링한다", () => {
    const posts = [makeX("3", "2026-09-10T12:00:00", false, true), makeX("2", "2026-09-10T11:00:00", true, true), makeX("1", "2026-09-09T10:00:00")];
    expect(filterFeed(posts, null, "all").map(post => post.id)).toEqual(["3", "2", "1"]);
    expect(filterFeed(posts, 1, "x")).toEqual(posts);
    expect(filterFeed(posts, 2, "all")).toEqual([]);
    expect(filterFeed(posts, null, "cafe")).toEqual([]);
  });
  it("오늘과 요일을 간결하게 표시하고 이전 연도만 연도를 포함한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-10T15:00:00"));
    const groups = groupFeed([makeX("3", "2026-09-10T12:00:00"), makeX("2", "2026-09-04T12:00:00"), makeX("1", "2025-09-04T12:00:00")]);
    expect(groups.map(group => group.label)).toEqual(["오늘 · 9월 10일", "9월 4일 · 금요일", "2025년 9월 4일 · 목요일"]);
    expect(groups.flatMap(group => group.posts.map(post => post.id))).toEqual(["3", "2", "1"]);
  });
});
