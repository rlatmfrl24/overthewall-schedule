import type { XLinkedPostPreviewDto, XPostDto } from "@contracts/x-posts";

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

export async function isXReferenceHidden(db: DB, id: string) {
  return Boolean(
    await db
      .prepare(
        `SELECT 1 AS hidden FROM x_posts WHERE id=?
    AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL)
    UNION ALL SELECT 1 FROM x_post_references WHERE referenced_post_id=?
    AND resolution_state='terminal' LIMIT 1`,
      )
      .bind(id, id)
      .first(),
  );
}

// Used by both public reads and background hydration. No writes or provider calls.
export async function readStoredXPreview(
  db: DB,
  id: string,
  timestamp = Date.now(),
): Promise<StoredXPreview | null> {
  if (await isXReferenceHidden(db, id)) return null;
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
    if (post?.id === id)
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
    return { post: parsed.post, authorId: parsed.authorId, local: false };
  } catch {
    return null;
  }
}
