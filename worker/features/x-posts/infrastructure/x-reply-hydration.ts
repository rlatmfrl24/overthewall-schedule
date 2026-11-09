import { FX_COLLECTION_LOOKBACK_HOURS } from "@contracts/x-collection";
import type { SiteId } from "@contracts/site-definition";
import type { XLinkedPostPreviewDto } from "@contracts/x-posts";
import { publicationHiddenSql } from "../../content-access";
import { fetchFxPostPreview, FxApiError } from "./fx-api";
import { writeStoredPosts } from "./x-api";
import { parseXPreview, readStoredXPreview } from "./x-reference-store";

const MAX_TARGETS_PER_RUN = 4;
const RETRY_MS = 6 * 3_600_000;

export async function hydrateXReplyPreviews(db: D1Database, siteId: SiteId, handles: string[]): Promise<number> {
  if (!handles.length) return 0;
  const now = Date.now();
  let calls = 0;
  try {
    const candidates = await db.prepare(`
      SELECT p.id,p.handle,p.user_id,p.value,r.referenced_post_id
      FROM x_posts p CROSS JOIN x_post_references r ON r.source_post_id=p.id AND r.relation_type='reply'
      WHERE p.first_seen_at BETWEEN ? AND ? AND p.handle IN (SELECT value FROM json_each(?))
        AND p.user_id IS NOT NULL AND p.content_access='normal' AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
        AND NOT (${publicationHiddenSql("x_posts", "p", siteId)})
        AND r.resolution_state='link_only' AND r.hydrated_at IS NULL
        AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=?)
      ORDER BY r.next_attempt_at,r.created_at,r.source_post_id LIMIT ?
    `).bind(now - FX_COLLECTION_LOOKBACK_HOURS * 3_600_000, now, JSON.stringify(handles), now, MAX_TARGETS_PER_RUN)
      .all<{ id: string; handle: string; user_id: string; value: string; referenced_post_id: string }>();

    const targets = new Map<string, Promise<XLinkedPostPreviewDto | null>>();
    const resolved = await Promise.all(candidates.results.map(async row => {
      const post = parseXPreview(row.value);
      if (post?.id !== row.id || !post.reply || post.reply.post || post.reply.postId !== row.referenced_post_id) return null;
      const { postId, inReplyToUserId } = post.reply;
      const key = `${postId}:${inReplyToUserId ?? ""}`;
      let request = targets.get(key);
      if (!request) {
        request = (async () => {
          const stored = await readStoredXPreview(db, postId, now, siteId);
          if (stored === "hidden") return null;
          if (stored) return stored.post;
          try {
            calls++;
            return await fetchFxPostPreview(postId, inReplyToUserId);
          } catch (error) {
            if (error instanceof FxApiError) return null;
            throw error;
          }
        })();
        targets.set(key, request);
      }
      return { row, post, preview: await request };
    }));

    const deferred: D1PreparedStatement[] = [];
    for (const item of resolved) {
      if (!item) continue;
      const { row, post, preview } = item;
      if (preview && post.reply) {
        const result = await writeStoredPosts(db, row.handle, { id: row.user_id, username: row.handle },
          [{ ...post, reply: { ...post.reply, post: preview } }], Date.now(), siteId,
          { origin: "fxembed", completeness: { text: false, media: false, relations: false }, replyPreviewOnly: true });
        if (result.count) continue;
      }
      deferred.push(db.prepare(`UPDATE x_post_references SET next_attempt_at=?
        WHERE source_post_id=? AND relation_type='reply' AND referenced_post_id=?
          AND resolution_state='link_only' AND hydrated_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at<=?)`)
        .bind(now + RETRY_MS, row.id, row.referenced_post_id, now));
    }
    if (deferred.length) await db.batch(deferred);
  } catch (error) {
    console.warn("Failed to hydrate X reply previews", error);
  }
  return calls;
}
