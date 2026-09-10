import type { UnifiedMemberPostDto as UnifiedMemberPost } from "@contracts/member-posts";

export type FeedSource = "all" | "x" | "cafe";
export function filterFeed(posts: UnifiedMemberPost[], member: number | null, source: FeedSource) {
  return posts.filter(post => (member === null || post.memberUid === member) && (source === "all" || post.kind === source));
}

export function groupFeed(posts: UnifiedMemberPost[]) {
  const groups = new Map<string, { label: string; posts: UnifiedMemberPost[] }>();
  const today = new Date();
  for (const post of posts) {
    const date = new Date(post.createdAt);
    const valid = !Number.isNaN(date.getTime());
    const key = valid ? date.toDateString() : "unknown";
    if (!groups.has(key)) {
      const display = valid ? date.toLocaleDateString("ko-KR", { year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined, month: "long", day: "numeric" }) : "날짜 확인 불가";
      groups.set(key, { label: !valid ? display : key === today.toDateString() ? `오늘 · ${display}` : `${display} · ${date.toLocaleDateString("ko-KR", { weekday: "long" })}`, posts: [] });
    }
    groups.get(key)!.posts.push(post);
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
}
