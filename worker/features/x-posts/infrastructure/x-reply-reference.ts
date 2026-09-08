import type { XPostDto } from "@contracts/x-posts";
import { linkedUserKey, readStoredXPreview, type StoredXPreview } from "./x-reference-store";

type DB = Pick<D1Database, "prepare">;
const knownUsername = (value: string | null | undefined) =>
  value && value !== "i" && /^[A-Za-z0-9_]{1,15}$/.test(value) ? value : null;

/** One local lookup per distinct target, only while storing newly collected posts.
 * A miss is a completed relation, never a reason to purchase or retry a resource. */
export async function connectStoredReplyReferences(db: DB, posts: XPostDto[]) {
  const replies = posts.filter((post) => post.reply && !post.reply.post);
  const targets = new Map<string, StoredXPreview | null>();
  for (const post of replies) {
    const id = post.reply!.postId;
    if (!targets.has(id)) targets.set(id, await readStoredXPreview(db, id));
  }
  const userIds = [...new Set(replies.flatMap((post) =>
    post.reply?.inReplyToUserId ? [post.reply.inReplyToUserId] : []))];
  const usernames = new Map<string, string>();
  if (userIds.length) {
    const rows = await db.prepare(`SELECT user_id, username, handle FROM x_post_sources
      WHERE user_id IN (${userIds.map(() => "?").join(",")})`)
      .bind(...userIds).all<{ user_id: string; username: string | null; handle: string }>();
    for (const row of rows.results) usernames.set(row.user_id, row.username ?? row.handle);
    for (const id of userIds) {
      if (usernames.has(id)) continue;
      const cached = await db.prepare("SELECT value FROM x_api_cache WHERE key=? AND expires_at>?")
        .bind(linkedUserKey(id), Date.now()).first<{ value: string }>();
      if (!cached) continue;
      try {
        const user = (JSON.parse(cached.value) as { user?: { id?: string; username?: string } }).user;
        if (user?.id === id && knownUsername(user.username)) usernames.set(id, user.username!);
      } catch { /* Invalid cached authors do not trigger provider work. */ }
    }
  }
  const result: XPostDto[] = [];
  for (const post of posts) {
    if (!post.reply || post.reply.post) { result.push(post); continue; }
    const stored = targets.get(post.reply.postId);
    const targetUsername = knownUsername(stored?.post.username)
      ?? knownUsername(usernames.get(post.reply.inReplyToUserId ?? ""))
      ?? knownUsername(post.reply.targetUsername);
    const reply = { ...post.reply, targetUsername, post: stored?.post ?? null };
    if (stored || targetUsername) {
      // Never overwrite a preserved preview on replay or resurrect a redacted target.
      const updated = await db.prepare(`UPDATE x_posts SET value=json_set(value,
        '$.reply.targetUsername',?, '$.reply.post',
        COALESCE(json_extract(value,'$.reply.post'),json(?)))
        WHERE id=? AND hidden_at IS NULL AND content_removed_at IS NULL
        AND json_valid(value) AND json_extract(value,'$.reply.postId')=?
        AND NOT EXISTS(SELECT 1 FROM x_posts target WHERE target.id=?
          AND (target.hidden_at IS NOT NULL OR target.content_removed_at IS NOT NULL))
        AND NOT EXISTS(SELECT 1 FROM x_post_references WHERE referenced_post_id=? AND resolution_state='terminal')`)
        .bind(targetUsername, JSON.stringify(reply.post), post.id, reply.postId, reply.postId, reply.postId).run();
      result.push(updated.meta.changes ? { ...post, reply } : post);
    } else result.push({ ...post, reply });
  }
  return result;
}
