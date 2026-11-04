import type { XPostDto } from "@contracts/x-posts";
import { linkedUserKey, type StoredXPreview } from "./x-reference-store";

const username = (value: string | null | undefined) => value && value !== "i" && /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : null;

export function connectReplyFromSnapshot(post: XPostDto, hidden: ReadonlySet<string>, preview: (id: string) => StoredXPreview | null,
  sources: readonly { user_id: string | null; username: string | null; handle: string }[], caches: ReadonlyMap<string, string>): XPostDto {
  if (!post.reply || post.reply.post || hidden.has(post.reply.postId)) return post;
  const target = preview(post.reply.postId);
  const author = sources.find(row => row.user_id === post.reply!.inReplyToUserId);
  let cachedUsername: string | null = null;
  try {
    const cached = JSON.parse(caches.get(linkedUserKey(post.reply.inReplyToUserId ?? "")) ?? "null") as { user?: { id?: string; username?: string } } | null;
    if (cached?.user?.id === post.reply.inReplyToUserId) cachedUsername = username(cached?.user?.username);
  } catch { /* Invalid cached authors remain link-only. */ }
  const targetUsername = username(target?.post.username) ?? username(author?.username ?? author?.handle) ?? cachedUsername ?? username(post.reply.targetUsername);
  return target || targetUsername ? { ...post, reply: { ...post.reply, targetUsername, post: target?.post ?? null } } : post;
}
