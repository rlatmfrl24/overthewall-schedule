import type {
  XHistoryHealthResponseDto,
  XHistoryPostDto,
  XHistoryPostStatus,
  XHistoryPostsResponseDto,
  XPostDto,
} from "@contracts/x-posts";
import type { XPostItem } from "../../../platform/types";
import { readXReferenceBudget } from "./x-reference-budget";
import { readXReferenceHealthCounts } from "./x-reference-health-read-model";

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
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const dayStart = Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    new Date(timestamp).getUTCDate(),
  );
  const [latest, budget, settings, resources, dailyCost, references, coalesced, guards] = await Promise.all([
    db.prepare(
      "SELECT MAX(last_success_at) AS lastSuccessAt FROM x_post_sources",
    ).first<{ lastSuccessAt: number | string | null }>(),
    db.prepare(
      "SELECT COALESCE(SUM(estimated_cost_micros), 0) AS used FROM x_api_usage_events WHERE created_at >= ?",
    ).bind(dayStart).first<{ used: number | string }>(),
    db.prepare(
      `SELECT key, value FROM settings WHERE key IN (
         'x_cost_optimizer_enabled', 'x_collection_interval_hours',
         'x_reference_preview_mode', 'x_api_backoff_until'
       )`,
    ).all<{ key: string; value: string | null }>(),
    db.prepare(
      `SELECT resource_type, COUNT(*) AS count FROM x_api_resource_daily
       WHERE utc_day = ? GROUP BY resource_type`,
    ).bind(day).all<{ resource_type: string; count: number | string }>(),
    db.prepare(
      `SELECT COALESCE(SUM(listed_cost_micros), 0) AS listed,
              COALESCE(SUM(conservative_cost_micros), 0) AS conservative,
              COALESCE(SUM(CASE WHEN operation = 'linked_user_cache_hit' THEN resource_count ELSE 0 END), 0) AS cacheHits,
              COALESCE(SUM(CASE WHEN operation = 'linked_user_cache_miss' THEN resource_count ELSE 0 END), 0) AS cacheMisses
       FROM x_api_usage_daily WHERE utc_day = ?`,
    ).bind(day).first<{
      listed: number | string;
      conservative: number | string;
      cacheHits: number | string;
      cacheMisses: number | string;
    }>(),
    readXReferenceHealthCounts(db),
    db.prepare(
      `SELECT COALESCE(SUM(coalesced_handles), 0) AS count
       FROM x_collection_runs WHERE started_at >= ?`,
    ).bind(dayStart).first<{ count: number | string }>(),
    db.prepare(
      `SELECT resource, COALESCE(SUM(used + reserved), 0) AS consumed,
              MAX(limit_value) AS limitValue
       FROM scheduled_usage_daily WHERE day = ? AND lane = 'all'
       AND resource IN ('x_api_cost_micros','d1_rows_read','d1_rows_written','queue_operations')
       GROUP BY resource`,
    ).bind(day).all<{ resource: string; consumed: number | string; limitValue: number | string | null }>(),
  ]);
  const referenceBudget = await readXReferenceBudget(db, timestamp);
  const settingMap = new Map(settings.results.map((row) => [row.key, row.value]));
  const configuredHours = Number(settingMap.get("x_collection_interval_hours") ?? "2");
  const optimizerEnabled = settingMap.get("x_cost_optimizer_enabled") === "true";
  const backoffUntil = Number(settingMap.get("x_api_backoff_until") ?? 0);
  const guarded = guards.results.find((row) => {
    const limit = Number(row.limitValue ?? 0);
    return limit > 0 && Number(row.consumed) / limit >= 0.7;
  });
  const fallbackByResource: Record<string, string> = {
    x_api_cost_micros: "x_budget",
    d1_rows_read: "d1_reads",
    d1_rows_written: "d1_writes",
    queue_operations: "queue",
  };
  const fallbackReason = backoffUntil > timestamp
    ? "provider_backoff"
    : guarded
      ? fallbackByResource[guarded.resource] ?? guarded.resource
      : null;
  const resourceCounts = new Map(resources.results.map((row) => [row.resource_type, asNumber(row.count)]));
  const previewMode = settingMap.get("x_reference_preview_mode");
  return {
    observedAt: timestamp,
    lastCollectionSuccessAt: latest?.lastSuccessAt === null
      ? null
      : asNumber(latest?.lastSuccessAt),
    budgetUsedMicros: asNumber(budget?.used),
    referenceHydration: {
      ...references,
      budgetDay: referenceBudget.day, budgetLimitMicros: referenceBudget.previewLimit,
      budgetUsedMicros: referenceBudget.previewUsed, budgetReservedMicros: referenceBudget.previewReserved,
      globalBudget: { limitMicros: referenceBudget.globalLimit, usedMicros: referenceBudget.globalUsed, reservedMicros: referenceBudget.globalReserved },
    },
    optimizer: {
      enabled: optimizerEnabled,
      configuredIntervalMinutes: configuredHours * 60,
      effectiveIntervalMinutes: optimizerEnabled && fallbackReason
        ? Math.max(configuredHours * 60, 60)
        : configuredHours * 60,
      fallbackReason,
      referencePreviewMode: previewMode === "post_only" || previewMode === "link_only"
        ? previewMode
        : "cached_author",
      previewBacklog: references.pendingPosts,
      authorCacheHitsToday: asNumber(dailyCost?.cacheHits),
      authorCacheMissesToday: asNumber(dailyCost?.cacheMisses),
      coalescedHandlesToday: asNumber(coalesced?.count),
    },
    utcCost: {
      day,
      uniquePosts: resourceCounts.get("post") ?? 0,
      uniqueUsers: resourceCounts.get("user") ?? 0,
      uniqueMedia: resourceCounts.get("media") ?? 0,
      listedCostMicros: asNumber(dailyCost?.listed),
      conservativeCostMicros: asNumber(dailyCost?.conservative),
    },
  };
};

export const backfillXPostReferencesFromStoredPosts = async (
  db: D1,
  limit = 100,
) => {
  const boundedLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
  const rows = await db.prepare(
    `SELECT p.id, p.value
     FROM x_posts p
     WHERE p.hidden_at IS NULL AND p.content_removed_at IS NULL
       AND json_valid(p.value)
       AND ((json_extract(p.value, '$.quote.postId') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM x_post_references r WHERE r.source_post_id=p.id AND r.relation_type='quote'))
         OR (json_extract(p.value, '$.reply.postId') IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM x_post_references r WHERE r.source_post_id=p.id AND r.relation_type='reply')))
     ORDER BY p.first_seen_at, p.id LIMIT ?`,
  ).bind(boundedLimit).all<{ id: string; value: string }>();
  let recorded = 0;
  let invalid = 0;
  const timestamp = Date.now();
  for (const row of rows.results) {
    const post = parseBackfillPost(row.value);
    if (!post || post.id !== row.id) {
      invalid += 1;
      continue;
    }
    const references = [
      post.quote ? { type: "quote", id: post.quote.postId, hydrated: Boolean(post.quote.post) } : null,
      post.reply ? { type: "reply", id: post.reply.postId, hydrated: Boolean(post.reply.post) } : null,
    ].filter((reference): reference is { type: "quote" | "reply"; id: string; hydrated: boolean } =>
      Boolean(reference?.id)
    );
    for (const reference of references) {
      const local = await db.prepare("SELECT 1 AS found FROM x_posts WHERE id = ? LIMIT 1")
        .bind(reference.id).first<{ found: number }>();
      const state = local ? "local" : reference.hydrated ? "hydrated" : "pending";
      await db.prepare(
        `INSERT OR IGNORE INTO x_post_references (
           source_post_id, relation_type, referenced_post_id,
           resolution_state, attempt_count, next_attempt_at, hydrated_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      ).bind(
        row.id,
        reference.type,
        reference.id,
        state,
        !reference.hydrated ? timestamp : null,
        reference.hydrated ? timestamp : null,
        timestamp,
        timestamp,
      ).run();
      recorded += 1;
    }
  }
  return { scanned: rows.results.length, recorded, invalid };
};
