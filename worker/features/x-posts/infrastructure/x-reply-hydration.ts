import { FX_COLLECTION_LOOKBACK_HOURS } from "@contracts/x-collection";
import { parseSiteId } from "@contracts/site-definition";
import type { XLinkedPostPreviewDto } from "@contracts/x-posts";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { publicationHiddenSql } from "../../content-access";
import { fetchFxPostPreview, FxApiError } from "./fx-api";
import { hasXCollectionD1Room } from "./rss-d1-budget";
import { writeStoredPosts } from "./x-api";
import { readActiveXHandles } from "./x-collection";
import { parseXPreview, readStoredXPreview } from "./x-reference-store";

const MAX_TARGETS_PER_RUN = 4;
const RETRY_MS = 6 * 3_600_000;
// A lookup can spend four access/cache reads. Keep one call for the backoff batch.
const LOOKUP_D1_CALLS = 4 + 1;
const WRITE_D1_CALLS = 2 + 1;

export async function hydrateXReplyPreviews(env: Env, handles: string[]): Promise<void> {
  const db = env.otw_db;
  if (!handles.length || !hasXCollectionD1Room(db, LOOKUP_D1_CALLS + 2)) return;
  const siteId = parseSiteId(env.SITE_ID);
  const now = Date.now();
  try {
    const allowed = new Set(await readActiveXHandles(getDb(env), siteId));
    const active = handles.filter(handle => allowed.has(handle.toLowerCase()));
    if (!active.length) return;
    const candidates = await db.prepare(`
      SELECT p.id,p.handle,p.user_id,p.value,r.referenced_post_id
      FROM x_posts p CROSS JOIN x_post_references r ON r.source_post_id=p.id AND r.relation_type='reply'
      WHERE p.first_seen_at BETWEEN ? AND ? AND p.handle IN (SELECT value FROM json_each(?))
        AND p.user_id IS NOT NULL AND p.content_access='normal' AND p.hidden_at IS NULL AND p.content_removed_at IS NULL
        AND NOT (${publicationHiddenSql("x_posts", "p", siteId)})
        AND r.resolution_state='link_only' AND r.hydrated_at IS NULL
        AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=?)
      ORDER BY r.next_attempt_at,r.created_at,r.source_post_id LIMIT ?
    `).bind(now - FX_COLLECTION_LOOKBACK_HOURS * 3_600_000, now, JSON.stringify(active), now, MAX_TARGETS_PER_RUN)
      .all<{ id: string; handle: string; user_id: string; value: string; referenced_post_id: string }>();

    const targets = new Map<string, XLinkedPostPreviewDto | null>();
    const deferred: D1PreparedStatement[] = [];
    for (const row of candidates.results) {
      if (!hasXCollectionD1Room(db, LOOKUP_D1_CALLS)) break;
      const post = parseXPreview(row.value);
      if (post?.id !== row.id || !post.reply || post.reply.post || post.reply.postId !== row.referenced_post_id) continue;
      const { postId, inReplyToUserId } = post.reply;
      const key = `${postId}:${inReplyToUserId ?? ""}`;
      let preview = targets.get(key);
      if (preview === undefined) {
        const stored = await readStoredXPreview(db, postId, now, siteId);
        if (stored !== "hidden" && !hasXCollectionD1Room(db, WRITE_D1_CALLS)) break;
        preview = stored === "hidden" ? null : stored?.post ?? await fetchFxPostPreview(postId, inReplyToUserId).catch(error => {
          if (error instanceof FxApiError) return null;
          throw error;
        });
        targets.set(key, preview);
      }
      if (preview) {
        if (!hasXCollectionD1Room(db, WRITE_D1_CALLS)) break;
        const result = await writeStoredPosts(db, row.handle, { id: row.user_id, username: row.handle },
          [{ ...post, reply: { ...post.reply, post: preview } }], Date.now(), siteId,
          { origin: "fxembed", completeness: { text: false, media: false, relations: false }, replyPreviewOnly: true });
        if (!result.ok || result.count) continue;
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
}
