import { connectReplyFromSnapshot } from "./x-reply-reference";
import { noteRssD1Conflict, rssD1RetryHasRoom } from "./rss-d1-budget";
import type { SiteId } from "@contracts/site-definition";
import type { XPostItem } from "../../../platform/types";
import { publicationHiddenSql } from "../../content-access";
import { fxRssWriteFenceSql, type FxRssWriteFence } from "./fx-rss-write-fence";
import { mergeStoredXPost, xPostContentKey, type XPostAuthority, type XPostWriteContext } from "../domain/merge-x-post";
import { handleFromUrl, prepareXPostFact, type MemberRow } from "./x-history";
import { parseXPreview, parseCachedXPreview, storedXPreview, linkedPostKey, type StoredXPreview } from "./x-reference-store";

type XCacheDb = Pick<D1Database, "prepare" | "batch">;
const prepareXPostReferences = (
  cacheDb: XCacheDb,
  posts: XPostItem[],
  recordedAt: number,
  siteId: SiteId,
  localIds: ReadonlySet<string>,
  rssFence?: FxRssWriteFence,
) => {
  const statements: D1PreparedStatement[] = [];
  for (const post of posts) {
    const references = [
      post.quote
        ? { type: "quote", id: post.quote.postId, hydrated: Boolean(post.quote.post) }
        : null,
      post.reply
        ? { type: "reply", id: post.reply.postId, hydrated: Boolean(post.reply.post) }
        : null,
    ].filter((reference): reference is { type: "quote" | "reply"; id: string; hydrated: boolean } =>
      Boolean(reference?.id)
    );
    for (const reference of references) {
      const local = reference.type === "quote" && localIds.has(reference.id);
      const state = reference.type === "reply" && !reference.hydrated ? "link_only" : local
        ? "local"
        : reference.hydrated
          ? "hydrated"
          : "pending";
      const fence = fxRssWriteFenceSql(rssFence, siteId);
      statements.push(cacheDb.prepare(
        `INSERT INTO x_post_references (
           source_post_id, relation_type, referenced_post_id,
           resolution_state, attempt_count, next_attempt_at, hydrated_at,
           created_at, updated_at
         ) SELECT CASE WHEN (${fence.sql}) THEN iif(EXISTS(SELECT 1 FROM x_posts p WHERE p.id=incoming.column1 AND ${publicationHiddenSql("x_posts", "p", siteId)}),json('site_member_cutover'),incoming.column1) ELSE json_extract('[]','rss_write_fence_lost') END, incoming.column2, incoming.column3, incoming.column4, incoming.column5, incoming.column6, incoming.column7, incoming.column8, incoming.column9
         FROM (VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)) incoming
         WHERE EXISTS(SELECT 1 FROM x_posts current WHERE current.id=incoming.column1
           AND current.hidden_at IS NULL AND current.content_removed_at IS NULL AND current.content_access='normal'
           AND json_extract(current.value,'$.' || incoming.column2 || '.postId')=incoming.column3)
         ON CONFLICT(source_post_id, relation_type) DO UPDATE SET
           referenced_post_id = excluded.referenced_post_id,
            resolution_state = CASE
              WHEN x_post_references.resolution_state = 'terminal'
                AND x_post_references.referenced_post_id = excluded.referenced_post_id
                THEN x_post_references.resolution_state
              WHEN x_post_references.referenced_post_id = excluded.referenced_post_id
                AND x_post_references.hydrated_at IS NOT NULL
                THEN x_post_references.resolution_state
              ELSE excluded.resolution_state
            END,
            next_attempt_at = CASE
              WHEN excluded.relation_type = 'reply' THEN NULL
              WHEN x_post_references.referenced_post_id = excluded.referenced_post_id
                AND (x_post_references.hydrated_at IS NOT NULL OR x_post_references.resolution_state = 'terminal')
              THEN x_post_references.next_attempt_at ELSE excluded.next_attempt_at END,
           hydrated_at = CASE WHEN x_post_references.referenced_post_id=excluded.referenced_post_id
             THEN COALESCE(excluded.hydrated_at, x_post_references.hydrated_at) ELSE excluded.hydrated_at END,
           author_state = CASE WHEN x_post_references.referenced_post_id<>excluded.referenced_post_id THEN 'not_required'
             WHEN excluded.relation_type='reply' AND x_post_references.resolution_state<>'terminal'
             THEN 'not_required' ELSE x_post_references.author_state END,
           author_next_attempt_at = CASE WHEN excluded.relation_type='reply' THEN NULL ELSE x_post_references.author_next_attempt_at END,
           author_last_error_code = CASE WHEN excluded.relation_type='reply' THEN NULL ELSE x_post_references.author_last_error_code END,
           last_error_code = CASE WHEN x_post_references.referenced_post_id<>excluded.referenced_post_id THEN NULL
             WHEN excluded.relation_type='reply' AND x_post_references.resolution_state<>'terminal'
             THEN NULL ELSE x_post_references.last_error_code END,
           updated_at = excluded.updated_at`,
      ).bind(
        ...fence.bindings,
        post.id,
        reference.type,
        reference.id,
        state,
        reference.type === "quote" && !reference.hydrated ? recordedAt : null,
        reference.hydrated ? recordedAt : null,
        recordedAt,
        recordedAt,
      ));
    }
  }
  return statements;
};


type RootRow = { id: string; value: string; source_authority: string | null; content_hash: string | null; revision: number; hidden_at: number | null; content_removed_at: number | null; content_access: string; user_id: string | null; handle: string; publication_hidden: number };
type SourceRow = { handle: string; user_id: string | null; username: string | null };
type CacheRow = { key: string; value: string; expires_at: number };
type SnapshotMember = MemberRow & { is_deprecated: number | null; content_access: string; publication_hidden: number };
const protectedRoot = (row: RootRow) => row.hidden_at !== null || row.content_removed_at !== null || row.content_access !== "normal" || Boolean(row.publication_hidden);
const assertion = (db: XCacheDb, predicate: string, values: (string | number | null)[] = [], error = "post_revision_conflict") =>
  db.prepare(`SELECT CASE WHEN (${predicate}) THEN 1 ELSE json_extract('[]','${error}') END AS valid`).bind(...values);

export async function commitStoredPosts(
  db: XCacheDb, handle: string, user: { id: string }, posts: XPostItem[], fetchedAt: number,
  siteId: SiteId, context: XPostWriteContext | ((post: XPostItem) => XPostWriteContext), rssFence?: FxRssWriteFence,
) {
  // Current and incoming relationships both matter: merge may retain an omitted relation.
  const input = JSON.stringify(posts);
  const relations = `WITH incoming AS (SELECT value FROM json_each(?)), versions AS (
    SELECT value FROM incoming UNION ALL SELECT p.value FROM x_posts p
    WHERE p.id IN (SELECT json_extract(value,'$.id') FROM incoming)), targets AS (
    SELECT json_extract(value,'$.quote.postId') id FROM versions UNION SELECT json_extract(value,'$.reply.postId') FROM versions
    UNION SELECT json_extract(value,'$.quote.post.id') FROM versions UNION SELECT json_extract(value,'$.reply.post.id') FROM versions
    UNION SELECT json_extract(link.value,'$.linkedPost.id') FROM versions,json_each(versions.value,'$.links') link), users AS (
    SELECT json_extract(value,'$.reply.inReplyToUserId') id FROM versions)`;
  const query = (select: string, columns: string[], bindings: (string | number)[] = [input]) => ({
    sql: `SELECT json_group_array(json_object(${columns.map(column => `'${column}',${column}`).join(",")})) AS data FROM (${select})`, bindings,
  });
  const queries = [
    query(`${relations} SELECT p.*,${publicationHiddenSql("x_posts", "p", siteId)} publication_hidden FROM x_posts p WHERE p.id IN (SELECT id FROM targets UNION SELECT json_extract(value,'$.id') FROM incoming) ORDER BY p.id`, ["id", "value", "source_authority", "content_hash", "revision", "hidden_at", "content_removed_at", "content_access", "user_id", "handle", "publication_hidden"]),
    query(`${relations} SELECT post_id FROM x_post_facts f WHERE post_id IN (SELECT id FROM targets) AND (content_access='admin_archive' OR ${publicationHiddenSql("x_post_facts", "f", siteId)}) ORDER BY post_id`, ["post_id"]),
    query(`${relations} SELECT DISTINCT referenced_post_id FROM x_post_references INDEXED BY idx_x_post_references_target WHERE referenced_post_id IN (SELECT id FROM targets) AND resolution_state='terminal' ORDER BY referenced_post_id`, ["referenced_post_id"]),
    query(`${relations} SELECT key,value,expires_at FROM x_api_cache WHERE key IN (SELECT 'x:linked-post:v1:'||id FROM targets UNION SELECT 'x:linked-user:v1:'||id FROM users) AND expires_at>max(CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),${Date.now()}) ORDER BY key`, ["key", "value", "expires_at"]),
    query(`${relations} SELECT s.handle,COALESCE(s.user_id,f.user_id) user_id,s.username FROM x_post_sources s
      LEFT JOIN x_fx_sources f ON f.handle=s.handle WHERE s.handle=? OR s.user_id IN (SELECT id FROM users) ORDER BY s.handle`, ["handle", "user_id", "username"], [input, handle]),
    query(`SELECT uid,name,url_twitter,is_deprecated,content_access,${publicationHiddenSql("members", "members", siteId)} publication_hidden FROM members ORDER BY uid`, ["uid", "name", "url_twitter", "is_deprecated", "content_access", "publication_hidden"], []),
    query("SELECT key,value FROM settings WHERE key IN ('x_history_analytics_enabled','x_history_retention_days') ORDER BY key", ["key", "value"], []),
  ];
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const snapshot = await db.batch<{ data: string }>(queries.map(q => db.prepare(q.sql).bind(...q.bindings)));
      const data = snapshot.map(result => result.results[0]!.data);
      const roots = new Map((JSON.parse(data[0]) as RootRow[]).map(row => [row.id, row]));
      const hidden = new Set([
        ...(JSON.parse(data[1]) as { post_id: string }[]).map(row => row.post_id),
        ...(JSON.parse(data[2]) as { referenced_post_id: string }[]).map(row => row.referenced_post_id),
        ...[...roots.values()].filter(protectedRoot).map(row => row.id),
      ]);
      const caches = new Map((JSON.parse(data[3]) as CacheRow[]).map(row => [row.key, row.value]));
      const sources = JSON.parse(data[4]) as SourceRow[];
      const members = JSON.parse(data[5]) as SnapshotMember[];
      const settings = new Map((JSON.parse(data[6]) as { key: string; value: string }[]).map(row => [row.key, row.value]));
      const source = sources.find(row => row.handle === handle);
      if (source?.user_id && source.user_id !== user.id) throw new Error("post_author_mismatch");
      if (rssFence && source?.user_id !== user.id) throw new Error("post_author_mismatch");
      const member = members.find(row => !row.is_deprecated && handleFromUrl(row.url_twitter) === handle);
      const hiddenHandles = new Set(members.filter(row => row.content_access !== "normal" || row.publication_hidden).map(row => handleFromUrl(row.url_twitter)));
      const previews = new Map<string, StoredXPreview>();
      for (const row of roots.values()) {
        if (hidden.has(row.id)) continue;
        const post = parseXPreview(row.value);
        if (post?.id === row.id && !hiddenHandles.has(post.username.toLowerCase())) previews.set(row.id, storedXPreview(post, row.user_id));
      }
      const localPreview = (id: string) => {
        if (hidden.has(id)) return null;
        if (previews.has(id)) return previews.get(id)!;
        return parseCachedXPreview(caches.get(linkedPostKey(id)) ?? "null", id, hiddenHandles);
      };
      const byId = new Map<string, { row: RootRow | undefined; merged: ReturnType<typeof mergeStoredXPost>; count: number }>();
      for (const incoming of posts) {
        const row = roots.get(incoming.id);
        if (row && protectedRoot(row)) continue;
        if (row && (row.handle !== handle || (row.user_id && row.user_id !== user.id))) throw new Error("post_author_mismatch");
        const previous = byId.get(incoming.id);
        const existing = previous?.merged ?? (row ? { post: JSON.parse(row.value) as XPostItem, authority: row.source_authority ? JSON.parse(row.source_authority) as XPostAuthority : null } : null);
        const merged = mergeStoredXPost(existing, incoming, typeof context === "function" ? context(incoming) : context);
        const repair = Boolean(previous || (row?.source_authority && row.content_hash === null));
        if (merged.changed || repair) byId.set(incoming.id, { row, merged: { ...merged, changed: merged.changed || Boolean(previous?.merged.changed) }, count: (previous?.count ?? 0) + 1 });
      }
      const plans = [...byId.values()];
      if (!plans.length) return { count: 0, insertedIds: [] };
      // Related roots committed together are also valid local reply targets.
      for (const { merged } of plans) {
        const p = merged.post;
        if (!hidden.has(p.id) && !hiddenHandles.has(p.username.toLowerCase())) previews.set(p.id, storedXPreview(p));
      }
      const statements: D1PreparedStatement[] = [];
      const fence = fxRssWriteFenceSql(rssFence, siteId);
      for (let i = 0; i < queries.length; i++) {
        const q = queries[i];
        statements.push(assertion(db, `(${q.sql})=?`, [...q.bindings, data[i]]));
      }
      if (plans.length) statements.push(assertion(db, fence.sql, fence.bindings, "rss_write_fence_lost"));
      const inserts: { id: string; index: number }[] = [];
      for (const { row, merged } of plans) {
        let post = merged.post;
        const embedded = [post.quote?.post, post.reply?.post, ...(post.links ?? []).map(link => link.linkedPost)];
        if (embedded.some(preview => preview && (hidden.has(preview.id) || hiddenHandles.has(preview.username?.toLowerCase() ?? null)))) throw new Error("post_reference_protected");
        post = connectReplyFromSnapshot(post, hidden, localPreview, sources, caches);

        const value = JSON.stringify(post), authority = JSON.stringify(merged.authority);
        const changed = merged.changed || value !== row?.value;
        const revision = (row?.revision ?? 0) + Number(changed);
        if (changed) {
          const index = statements.length;
          statements.push(row ? db.prepare(`UPDATE x_posts SET value=?,source_authority=?,content_hash=NULL,revision=revision+1,fetched_at=? WHERE id=? AND revision=? AND value=? AND hidden_at IS NULL AND content_removed_at IS NULL AND content_access='normal' AND NOT (${publicationHiddenSql("x_posts", "x_posts", siteId)}) AND (${fence.sql})`)
            .bind(value, authority, fetchedAt, post.id, row.revision, row.value, ...fence.bindings)
            : db.prepare(`INSERT INTO x_posts(id,handle,user_id,username,value,created_at,first_seen_at,fetched_at,source_authority,content_hash,revision)
              SELECT ?,?,?,?,?,?,?,?,?,NULL,1 FROM (SELECT ? handle) incoming WHERE NOT (${publicationHiddenSql("x_post_sources", "incoming", siteId)}) AND (${fence.sql}) ON CONFLICT(id) DO NOTHING`)
              .bind(post.id, handle, user.id, post.username, value, post.createdAt, fetchedAt, fetchedAt, authority, handle, ...fence.bindings));
          // changes() belongs to this root DML, never a competitor's identical value.
          statements.push(assertion(db, "changes()=1"));
          if (!row) inserts.push({ id: post.id, index });
        } else statements.push(assertion(db, "EXISTS(SELECT 1 FROM x_posts WHERE id=? AND revision=? AND value=? AND source_authority=? AND content_hash IS NULL)", [post.id, revision, value, authority]));
        if (member && settings.get("x_history_analytics_enabled") === "true" && Number.isFinite(Date.parse(post.createdAt))) {
          statements.push(prepareXPostFact(db, member, post, fetchedAt, siteId, rssFence), assertion(db, "changes()=1", [], "post_fact_write_failed"));
        }
        for (const reference of prepareXPostReferences(db, [post], fetchedAt, siteId, new Set([...roots.keys(), ...plans.map(plan => plan.merged.post.id)]), rssFence)) {
          statements.push(reference, assertion(db, "changes()=1", [], "post_reference_write_failed"));
        }
        const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(xPostContentKey(post))))].map(byte => byte.toString(16).padStart(2,"0")).join("");
        statements.push(db.prepare(`UPDATE x_posts SET content_hash=? WHERE id=? AND revision=? AND value=? AND source_authority=? AND content_hash IS NULL AND hidden_at IS NULL AND content_removed_at IS NULL AND content_access='normal' AND (${fence.sql})`).bind(hash, post.id, revision, value, authority, ...fence.bindings), assertion(db, "changes()=1", [], "post_hash_write_failed"));
      }
      const results = await db.batch(statements);
      return { count: plans.reduce((sum, plan) => sum + plan.count, 0), insertedIds: inserts.filter(insert => results[insert.index].meta.changes > 0).map(insert => insert.id) };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("post_revision_conflict")) throw error;
      if (rssFence) {
        noteRssD1Conflict(db);
        // Two retry calls plus twelve for checkpoint, release, outbox and a failed final ACK retry.
        if (!rssD1RetryHasRoom(db,14)) throw new Error("rss_d1_retry_budget");
      }
      if (attempt === 3) throw new Error("post_revision_conflict");
    }
  }
  throw new Error("post_revision_conflict");
}
