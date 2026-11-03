import { describe, expect, it } from "vitest";
import type { XPostDto } from "@contracts/x-posts";
import { mergeStoredXPost } from "./merge-x-post";

const post: XPostDto = { id: "123", username: "member", text: "official", createdAt: "2026-11-03T00:00:00Z", url: "https://x.com/member/status/123", media: [], metrics: { likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0 }, reply: { postId: "122", conversationId: "100", post: null } };
const complete = { text: true, media: true, relations: true };
describe("source authority", () => {
  it("treats legacy content as official and preserves it on Fx replay", () => {
    const merged = mergeStoredXPost({ post, authority: null }, { ...post, text: "Fx", reply: null }, { origin: "fxembed", completeness: complete });
    expect(merged.post).toEqual(post);
    expect(merged.changed).toBe(false);
  });
  it("ignores metrics-only Fx replay, but promotes fields independently", () => {
    const fx = mergeStoredXPost(null, post, { origin: "fxembed", completeness: complete });
    expect(mergeStoredXPost(fx, { ...post, metrics: { ...post.metrics, likeCount: 50 } }, { origin: "fxembed", completeness: complete }).changed).toBe(false);
    const official = mergeStoredXPost(fx, { ...post, text: "confirmed", media: [], reply: null }, { origin: "x_api", completeness: { text: true, media: false, relations: false } });
    expect(official.post.reply).toEqual(post.reply);
    expect(official.authority).toEqual({ text: "x_api", media: "fxembed", relations: "fxembed" });
  });
  it("preserves hydrated previews for the same relation only", () => {
    const preview = { id: "122", text: "parent", createdAt: null, url: "https://x.com/a/status/122", username: "a", name: null, profileImageUrl: null, metrics: post.metrics, media: [] };
    const existing = { post: { ...post, reply: { ...post.reply!, post: preview } }, authority: null };
    expect(mergeStoredXPost(existing, post, { origin: "x_api", completeness: complete }).post.reply?.post).toEqual(preview);
    expect(mergeStoredXPost(existing, { ...post, reply: { ...post.reply!, postId: "121" } }, { origin: "x_api", completeness: complete }).post.reply?.post).toBeNull();
  });
  it("keeps an attached preview on Fx replay even when Fx also supplies a preview", () => {
    const preview = { id: "122", text: "official parent", createdAt: null, url: "https://x.com/a/status/122", username: "a", name: null, profileImageUrl: null, metrics: post.metrics, media: [] };
    const authority = { text: "fxembed", media: "fxembed", relations: "fxembed" } as const;
    const existing = { post: { ...post, reply: { ...post.reply!, post: preview } }, authority };
    const incoming = { ...post, reply: { ...post.reply!, post: { ...preview, text: "Fx parent", metrics: { ...post.metrics, likeCount: 10 } } } };
    expect(mergeStoredXPost(existing, incoming, { origin: "fxembed", completeness: complete }).changed).toBe(false);
  });
});
