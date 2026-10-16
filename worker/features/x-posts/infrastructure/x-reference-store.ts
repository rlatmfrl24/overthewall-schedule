import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-transition";
import type { XLinkedPostPreviewDto, XPostDto } from "@contracts/x-posts";
import { extractXHandle } from "../domain/handle-targets";

type DB = Pick<D1Database, "prepare">;
export type StoredXPreview = {
  post: XLinkedPostPreviewDto;
  authorId?: string | null;
  local: boolean;
};

export const linkedPostKey = (id: string) => `x:linked-post:v1:${id}`;
export const linkedUserKey = (id: string) => `x:linked-user:v1:${id}`;
export const REFERENCE_CACHE_TTL = 30 * 86_400_000;

export function parseXPreview(value: string): XPostDto | null {
  try {
    const post = JSON.parse(value) as XPostDto;
    return post &&
      typeof post.id === "string" &&
      typeof post.text === "string" &&
      typeof post.username === "string" &&
      Array.isArray(post.media) &&
      post.metrics
      ? post
      : null;
  } catch {
    return null;
  }
}

export async function isXReferenceHidden(db: DB, id: string, siteId: SiteId = "luvdia") {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 AS hidden FROM x_posts WHERE id=?
    AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL OR content_access='admin_archive' OR ${publicationHiddenSql("x_posts", "x_posts", siteId)})
    UNION ALL SELECT 1 FROM x_post_facts WHERE post_id=? AND (content_access='admin_archive' OR ${publicationHiddenSql("x_post_facts", "x_post_facts", siteId)})
    UNION ALL SELECT 1 FROM x_post_references WHERE referenced_post_id=?
    AND resolution_state='terminal' LIMIT 1`,
      )
      .bind(id, id, id)
      .first(),
  );
}

/** Embedded previews were stored before the access change; root filtering alone cannot protect them. */
export async function filterArchivedXReferences(db: DB, posts: XPostDto[], siteId: SiteId = "luvdia"): Promise<XPostDto[]> {
  const ids = [...new Set(posts.flatMap(post => [post.id, post.quote?.postId, post.reply?.postId,
    ...(post.links ?? []).map(link => link.linkedPost?.id)].filter((id): id is string => Boolean(id))))];
  if (!ids.length) return posts;
  const rows = await db.prepare(`SELECT id, NULL AS handle FROM x_posts WHERE (content_access='admin_archive' OR ${publicationHiddenSql("x_posts","x_posts",siteId)}) AND id IN (SELECT value FROM json_each(?))
    UNION SELECT post_id AS id, NULL AS handle FROM x_post_facts WHERE (content_access='admin_archive' OR ${publicationHiddenSql("x_post_facts","x_post_facts",siteId)}) AND post_id IN (SELECT value FROM json_each(?))
    UNION SELECT NULL AS id, url_twitter AS handle FROM members WHERE (content_access='admin_archive' OR ${publicationHiddenSql("members","members",siteId)}) AND url_twitter IS NOT NULL`)
    .bind(JSON.stringify(ids), JSON.stringify(ids)).all<{id:string|null;handle:string|null}>();
  const hidden = new Set(rows.results.map(row => row.id).filter(Boolean));
  const handles = new Set(rows.results.map(row => extractXHandle(row.handle)?.toLowerCase()).filter(Boolean));
  const unavailable = (post: {id:string;username?:string} | null | undefined) => Boolean(post && (hidden.has(post.id) || handles.has(post.username?.toLowerCase())));
  return posts.filter(post => !unavailable(post)).map(post => ({ ...post,
    ...(post.quote && (hidden.has(post.quote.postId) || unavailable(post.quote.post)) ? { quote: undefined } : {}),
    ...(post.reply && (hidden.has(post.reply.postId) || unavailable(post.reply.post) || handles.has(post.reply.targetUsername?.toLowerCase())) ? { reply: undefined } : {}),
    links: post.links?.filter(link => !unavailable(link.linkedPost)),
  }));
}

// Used by both public reads and background hydration. No writes or provider calls.
export async function readStoredXPreview(
  db: DB,
  id: string,
  timestamp = Date.now(),
  siteId: SiteId = "luvdia",
): Promise<StoredXPreview | null> {
  if (await isXReferenceHidden(db, id, siteId)) return null;
  const row = await db
    .prepare(
      `SELECT value, user_id, hidden_at, content_removed_at FROM x_posts WHERE id=?`,
    )
    .bind(id)
    .first<{
      value: string;
      user_id: string | null;
      hidden_at: number | null;
      content_removed_at: number | null;
    }>();
  if (row && (row.hidden_at != null || row.content_removed_at != null))
    return null;
  if (row) {
    const post = parseXPreview(row.value);
    if (post?.id === id && (await filterArchivedXReferences(db, [post], siteId)).length)
      return {
        local: true,
        authorId: row.user_id,
        post: {
          id,
          text: post.text,
          username: post.username,
          createdAt: post.createdAt,
          url: post.url,
          metrics: post.metrics,
          media: post.media,
          name: null,
          profileImageUrl: null,
        },
      };
  }
  const cache = await db
    .prepare(`SELECT value FROM x_api_cache WHERE key=? AND expires_at>?`)
    .bind(linkedPostKey(id), timestamp)
    .first<{ value: string }>();
  if (!cache) return null;
  try {
    const parsed = JSON.parse(cache.value) as {
      post: XLinkedPostPreviewDto | null;
      authorId?: string | null;
    };
    if (
      parsed.post?.id !== id ||
      typeof parsed.post.text !== "string" ||
      !Array.isArray(parsed.post.media)
    )
      return null;
    const members = await db.prepare(`SELECT url_twitter FROM members WHERE content_access='admin_archive' OR ${publicationHiddenSql("members", "members", siteId)}`).bind().all<{url_twitter:string|null}>();
    if (members.results.some(row => extractXHandle(row.url_twitter)?.toLowerCase() === parsed.post!.username?.toLowerCase())) return null;
    return { post: parsed.post, authorId: parsed.authorId, local: false };
  } catch {
    return null;
  }
}
