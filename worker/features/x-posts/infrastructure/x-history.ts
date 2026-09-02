import type {
  XHistoryHealthResponseDto,
  XHistoryPostDto,
  XHistoryPostStatus,
  XHistoryPostsResponseDto,
  XPostDto,
} from "@contracts/x-posts";
import type { XPostItem } from "../../../platform/types";

type D1 = Pick<D1Database, "prepare">;

type MemberRow = { uid: number | string; name: string; url_twitter: string | null };
type FactRow = {
  post_id: string;
  member_uid: number | string;
  member_name_snapshot: string;
  post_type: "post" | "reply" | "quote";
  created_at: number | string;
  first_seen_at: number | string;
  media_count: number | string;
  link_count: number | string;
  hidden_at: number | string | null;
  hidden_reason: string | null;
  stored_hidden_at: number | string | null;
  stored_hidden_reason: string | null;
  value: string | null;
};

type BackfillRow = { handle: string; value: string };

const settingIsEnabled = async (db: D1, key: string) => {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key).first<{ value: string | null }>();
  return row?.value === "true";
};

const normalizeHandle = (value: string) => value.trim().replace(/^@/, "").toLowerCase();

const handleFromUrl = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    const value = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
    return /^[A-Za-z0-9_]{1,15}$/.test(value) ? normalizeHandle(value) : null;
  } catch {
    return /^[A-Za-z0-9_]{1,15}$/.test(url) ? normalizeHandle(url) : null;
  }
};

const toPostType = (post: XPostItem): "post" | "reply" | "quote" =>
  post.reply ? "reply" : post.quote ? "quote" : "post";

const asNumber = (value: number | string | null | undefined) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const parseStoredPost = (value: string | null, postId: string): XPostDto | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<XPostDto>;
    return parsed.id === postId && typeof parsed.text === "string" &&
        typeof parsed.createdAt === "string" && typeof parsed.url === "string" &&
        typeof parsed.username === "string" && Array.isArray(parsed.media) &&
        typeof parsed.metrics === "object" && parsed.metrics !== null
      ? parsed as XPostDto
      : null;
  } catch {
    return null;
  }
};

const parseBackfillPost = (value: string): XPostItem | null => {
  try {
    const parsed = JSON.parse(value) as Partial<XPostItem>;
    return typeof parsed.id === "string" && typeof parsed.text === "string" &&
        typeof parsed.createdAt === "string" && typeof parsed.url === "string" &&
        typeof parsed.username === "string" && Array.isArray(parsed.media)
      ? parsed as XPostItem
      : null;
  } catch {
    return null;
  }
};

const toHistoryPost = (row: FactRow): XHistoryPostDto => {
  const hiddenAtValue = row.hidden_at ?? row.stored_hidden_at;
  const status: XHistoryPostStatus = hiddenAtValue === null ? "visible" : "redacted";
  return {
    postId: row.post_id,
    memberUid: asNumber(row.member_uid),
    memberName: row.member_name_snapshot,
    postType: row.post_type,
    createdAt: asNumber(row.created_at),
    firstSeenAt: asNumber(row.first_seen_at),
    mediaCount: asNumber(row.media_count),
    linkCount: asNumber(row.link_count),
    status,
    hiddenAt: hiddenAtValue === null ? null : asNumber(hiddenAtValue),
    hiddenReason: row.hidden_reason ?? row.stored_hidden_reason,
    post: status === "visible" ? parseStoredPost(row.value, row.post_id) : null,
  };
};

const findMemberByHandle = async (db: D1, handle: string) => {
  const rows = await db.prepare(
    "SELECT uid, name, url_twitter FROM members WHERE is_deprecated IS NULL OR is_deprecated = 0",
  ).all<MemberRow>();
  const normalized = normalizeHandle(handle);
  return rows.results.find((row) => handleFromUrl(row.url_twitter) === normalized) ?? null;
};

export const recordXPostFacts = async (
  db: D1,
  handle: string,
  posts: readonly XPostItem[],
  timestamp = Date.now(),
) => {
  if (posts.length === 0 || !(await settingIsEnabled(db, "x_history_analytics_enabled"))) {
    return { recorded: 0, skipped: posts.length };
  }
  const member = await findMemberByHandle(db, handle);
  if (!member) return { recorded: 0, skipped: posts.length };
  let recorded = 0;
  for (const post of posts) {
    const createdAt = Date.parse(post.createdAt);
    if (!Number.isFinite(createdAt)) continue;
    await db.prepare(
      `INSERT INTO x_post_facts (
         post_id, member_uid, member_name_snapshot, post_type, created_at,
         first_seen_at, media_count, link_count, edit_root_post_id,
         superseded_by_post_id, hidden_at, hidden_reason, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         member_uid = excluded.member_uid,
         member_name_snapshot = excluded.member_name_snapshot,
         post_type = excluded.post_type,
         media_count = excluded.media_count,
         link_count = excluded.link_count,
         updated_at = excluded.updated_at`,
    ).bind(
      post.id,
      asNumber(member.uid),
      member.name,
      toPostType(post),
      createdAt,
      timestamp,
      post.media.length,
      post.links?.length ?? 0,
      post.id,
      timestamp,
    ).run();
    recorded += 1;
  }
  return { recorded, skipped: posts.length - recorded };
};

export const backfillXPostFactsFromStoredPosts = async (db: D1, limit = 100) => {
  if (!(await settingIsEnabled(db, "x_history_analytics_enabled"))) {
    return { scanned: 0, recorded: 0, invalid: 0, skipped: true };
  }
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await db.prepare(
    `SELECT p.handle, p.value
     FROM x_posts p
     LEFT JOIN x_post_facts f ON f.post_id = p.id
     WHERE f.post_id IS NULL AND p.hidden_at IS NULL
       AND p.content_removed_at IS NULL
     ORDER BY p.first_seen_at, p.id
     LIMIT ?`,
  ).bind(boundedLimit).all<BackfillRow>();
  const grouped = new Map<string, XPostItem[]>();
  let invalid = 0;
  for (const row of rows.results) {
    const post = parseBackfillPost(row.value);
    if (!post) {
      invalid += 1;
      continue;
    }
    const handle = normalizeHandle(row.handle);
    grouped.set(handle, [...(grouped.get(handle) ?? []), post]);
  }
  let recorded = 0;
  for (const [handle, posts] of grouped) {
    recorded += (await recordXPostFacts(db, handle, posts)).recorded;
  }
  return { scanned: rows.results.length, recorded, invalid, skipped: false };
};

export const redactXPostHistory = async (
  db: D1,
  postIds: readonly string[],
  timestamp = Date.now(),
) => {
  const ids = [...new Set(postIds.filter(Boolean))];
  if (ids.length === 0) return { redacted: 0 };
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50);
    await db.prepare(
      `UPDATE x_post_facts SET hidden_at = ?, hidden_reason = 'admin', updated_at = ?
       WHERE post_id IN (${chunk.map(() => "?").join(", ")})`,
    ).bind(timestamp, timestamp, ...chunk).run();
  }
  return { redacted: ids.length };
};

export const readXHistoryPosts = async (
  db: D1,
  options: {
    memberUid?: number;
    from?: number;
    to?: number;
    status?: XHistoryPostStatus;
    cursor?: { createdAt: number; postId: string };
    limit: number;
  },
): Promise<XHistoryPostsResponseDto> => {
  const where: string[] = [];
  const bindings: Array<number | string> = [];
  if (options.memberUid) {
    where.push("f.member_uid = ?");
    bindings.push(options.memberUid);
  }
  if (options.from) {
    where.push("f.created_at >= ?");
    bindings.push(options.from);
  }
  if (options.to) {
    where.push("f.created_at <= ?");
    bindings.push(options.to);
  }
  if (options.status === "visible") {
    where.push("f.hidden_at IS NULL AND p.hidden_at IS NULL");
  } else if (options.status === "redacted") {
    where.push("(f.hidden_at IS NOT NULL OR p.hidden_at IS NOT NULL)");
  }
  if (options.cursor) {
    where.push("(f.created_at < ? OR (f.created_at = ? AND f.post_id < ?))");
    bindings.push(options.cursor.createdAt, options.cursor.createdAt, options.cursor.postId);
  }
  const rows = await db.prepare(
    `SELECT f.post_id, f.member_uid, f.member_name_snapshot, f.post_type,
            f.created_at, f.first_seen_at, f.media_count, f.link_count,
            f.hidden_at, f.hidden_reason, p.hidden_at AS stored_hidden_at,
            p.hidden_reason AS stored_hidden_reason, p.value
     FROM x_post_facts f
     LEFT JOIN x_posts p ON p.id = f.post_id
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY f.created_at DESC, f.post_id DESC LIMIT ?`,
  ).bind(...bindings, options.limit + 1).all<FactRow>();
  const hasMore = rows.results.length > options.limit;
  const posts = rows.results.slice(0, options.limit).map(toHistoryPost);
  const last = posts.at(-1);
  return {
    posts,
    hasMore,
    nextCursor: hasMore && last ? `${last.createdAt}:${last.postId}` : null,
  };
};

export const readXHistoryHealth = async (
  db: D1,
  timestamp = Date.now(),
): Promise<XHistoryHealthResponseDto> => {
  const [latest, budget] = await Promise.all([
    db.prepare(
      "SELECT MAX(last_success_at) AS lastSuccessAt FROM x_post_sources",
    ).first<{ lastSuccessAt: number | string | null }>(),
    db.prepare(
      "SELECT COALESCE(SUM(estimated_cost_micros), 0) AS used FROM x_api_usage_events WHERE created_at >= ?",
    ).bind(
      Date.UTC(
        new Date(timestamp).getUTCFullYear(),
        new Date(timestamp).getUTCMonth(),
        new Date(timestamp).getUTCDate(),
      ),
    ).first<{ used: number | string }>(),
  ]);
  return {
    lastCollectionSuccessAt: latest?.lastSuccessAt === null
      ? null
      : asNumber(latest?.lastSuccessAt),
    budgetUsedMicros: asNumber(budget?.used),
  };
};
