import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";

export const X_TIMELINE_GAP_BATCH_SIZE = 2;
export const X_TIMELINE_GAP_MAX_PAGES = 4096;

export type XTimelineGapCheckpoint = {
  startedAt: number;
  base: string | null;
  after: string | null;
  page: { until: string | null; token: string; newest: string | null; seenTokens?: string[]; storedIds?: string[] } | null;
  attempt?: string;
  boundsRevision?: number;
  recovery?: { until: string | null };
  request?: { id: string; path: string; until: string | null };
};

export const isXTimelineId = (id: unknown): id is string => typeof id === "string" && /^[1-9]\d{0,18}$/.test(id);

const parseCheckpoint = (value: string): XTimelineGapCheckpoint => {
  const state = JSON.parse(value) as XTimelineGapCheckpoint | null;
  if (!state || !Number.isSafeInteger(state.startedAt) || !(state.base === null || isXTimelineId(state.base)) ||
    (state.boundsRevision !== undefined && (!Number.isSafeInteger(state.boundsRevision) || state.boundsRevision < 0)) ||
    (state.recovery !== undefined && (!state.recovery ||
      !(state.recovery.until === null || isXTimelineId(state.recovery.until)))) ||
    (state.request !== undefined && (!state.request || !/^(otw|luvdia):gap:[a-f0-9]{64}$/.test(state.request.id) ||
      typeof state.request.path !== "string" || !/^\/users\/[1-9]\d{0,24}\/tweets\?/.test(state.request.path) ||
      !(state.request.until === null || isXTimelineId(state.request.until)))) ||
    (state.attempt !== undefined && (typeof state.attempt !== "string" || !/^[a-f0-9-]{36}$/.test(state.attempt))) ||
    !(state.after === null || isXTimelineId(state.after)) || !(state.page === null || (
    state.page && (state.page.until === null || isXTimelineId(state.page.until)) &&
    typeof state.page.token === "string" && state.page.token.length > 0 &&
    (state.page.storedIds === undefined || Array.isArray(state.page.storedIds) && state.page.storedIds.every(isXTimelineId)) &&
    (state.page.seenTokens === undefined || Array.isArray(state.page.seenTokens) && state.page.seenTokens.length <= X_TIMELINE_GAP_MAX_PAGES &&
      state.page.seenTokens.every(token => typeof token === "string" && /^[a-f0-9]{64}$/.test(token))) &&
    (state.page.newest === null || isXTimelineId(state.page.newest))
  ))) throw new Error("invalid_x_gap_checkpoint");
  return state;
};

export function readXTimelineGapRequest(value: string | null, userId?: string | null) {
  if (!value) return undefined;
  try {
    const request = parseCheckpoint(value).request;
    return !userId || request?.path.startsWith(`/users/${userId}/tweets?`) ? request : undefined;
  }
  catch { return undefined; }
}

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const optionalArray = (value: unknown, validate: (item: unknown) => boolean) => value === undefined || Array.isArray(value) && value.every(validate);
const optionalStrings = (value: Record<string, unknown>, keys: string[]) => keys.every(key => value[key] == null || typeof value[key] === "string");
const optionalCounts = (value: Record<string, unknown>, keys: string[]) => keys.every(key => {
  const count = value[key];
  return count == null || typeof count === "number" && Number.isSafeInteger(count) && count >= 0;
});
const validEntities = (value: unknown): boolean => value === undefined || record(value) && optionalArray(value.urls,
  item => record(item) && optionalStrings(item, ["url", "expanded_url", "display_url", "unwound_url", "title", "description"]) &&
    optionalArray(item.images, image => record(image) && optionalStrings(image, ["url"])));

export function isXTimelineGapPayload(value: unknown): boolean {
  if (!record(value)) return false;
  const { data, includes, meta, errors } = value;
  if (meta !== undefined && !record(meta) || includes !== undefined && !record(includes)) return false;
  const count = record(meta) ? meta.result_count : undefined;
  const token = record(meta) ? meta.next_token : undefined;
  if (errors !== undefined && (!Array.isArray(errors) || errors.length > 0) ||
      data === undefined && count !== 0 || count !== undefined && count !== (Array.isArray(data) ? data.length : 0) ||
      token !== undefined && (typeof token !== "string" || !token)) return false;
  return (!record(includes) || (optionalArray(includes.media, item => record(item) && typeof item.media_key === "string" &&
    optionalStrings(item, ["url", "type", "preview_image_url", "alt_text"]) && optionalCounts(item, ["width", "height"])) &&
    optionalArray(includes.users, record))) && optionalArray(data, post => record(post) && isXTimelineId(post.id) &&
    typeof post.created_at === "string" && Number.isFinite(Date.parse(post.created_at)) &&
    optionalStrings(post, ["text", "conversation_id", "in_reply_to_user_id"]) && (post.public_metrics === undefined ||
      record(post.public_metrics) && optionalCounts(post.public_metrics, ["like_count", "reply_count", "retweet_count", "quote_count"])) &&
    (post.attachments === undefined || record(post.attachments) && optionalArray(post.attachments.media_keys, key => typeof key === "string")) &&
    optionalArray(post.referenced_tweets, item => record(item) && optionalStrings(item, ["id", "type"])) && validEntities(post.entities) &&
    (post.note_tweet === undefined || record(post.note_tweet) && optionalStrings(post.note_tweet, ["text"]) && validEntities(post.note_tweet.entities)));
}

export async function xTimelineTokenFingerprint(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function xTimelineGapRequestId(site: string, handle: string, startedAt: number, path: string, attempt?: string) {
  return `${site}:gap:${await xTimelineTokenFingerprint(JSON.stringify([handle, startedAt, path, attempt]))}`;
}

export async function writeXTimelineGapCheckpoint(db: Pick<D1Database, "prepare">, handle: string, lease: string, now: number, site: SiteId, checkpoint: XTimelineGapCheckpoint) {
  const value=JSON.stringify(checkpoint);
  const revision=checkpoint.request ? checkpoint.boundsRevision ?? -1 : null;
  const changed=checkpoint.request ? JSON.stringify({startedAt:checkpoint.startedAt,base:checkpoint.base,after:checkpoint.after,page:null,
    attempt:crypto.randomUUID(),recovery:checkpoint.recovery ?? {until:checkpoint.request.until}}) : value;
  // Confirm the request and its storage snapshot in the same write, or persist immediate resegmentation.
  const result = await db.prepare(`UPDATE x_post_sources SET sync_gap_state=CASE WHEN ? IS NULL OR insert_revision=? THEN ? ELSE ? END WHERE handle=? AND lease_token=? AND lease_until>?
    AND sync_origin_started_at=? AND last_seen_post_id IS ? AND deactivated_at IS NULL
    AND NOT (${publicationHiddenSql("x_post_sources", "x_post_sources", site)}) RETURNING sync_gap_state=? AS matched`)
    .bind(revision,revision,value,changed,handle,lease,now,checkpoint.startedAt,checkpoint.base,value).all<{matched:number}>();
  const row=result.results[0];
  if(!row)return false;
  return row.matched ? true : "boundary_changed";
}

export async function readXTimelineGapBatch(db: Pick<D1Database, "prepare">, handle: string, userId: string, lease: string, now: number) {
  const source = await db.prepare(`SELECT insert_revision,last_seen_post_id,collection_started_at,sync_gap_state,sync_origin_scope,
    sync_origin_started_at,sync_pagination_token,sync_base_post_id,sync_newest_post_id FROM x_post_sources WHERE handle=? AND lease_token=? AND lease_until>?`)
    .bind(handle, lease, now).first<{
      insert_revision: number; last_seen_post_id: string | null; collection_started_at: number | null; sync_gap_state: string | null;
      sync_origin_scope: string | null; sync_origin_started_at: number | null; sync_pagination_token: string | null;
      sync_base_post_id: string | null; sync_newest_post_id: string | null;
    }>();
  if (!source) throw new Error("x_source_lease_lost");
  if (source.sync_origin_scope !== "regular") return null;

  const base = source.last_seen_post_id;
  if (base !== null && !isXTimelineId(base)) throw new Error("invalid_x_gap_watermark");
  const persisted = source.sync_gap_state ? parseCheckpoint(source.sync_gap_state) : null;
  const startedAt = source.sync_origin_started_at;
  if (startedAt === null) throw new Error("missing_x_gap_snapshot");
  const checkpoint: XTimelineGapCheckpoint = persisted?.startedAt === startedAt && persisted.base === base
    ? persisted : source.sync_pagination_token ? {
      startedAt, base, after: source.sync_base_post_id ?? base,
      page: { until: null, token: source.sync_pagination_token, newest: source.sync_newest_post_id },
    } : { startedAt, base, after: base, page: null };
  const startTime = new Date(source.collection_started_at ?? startedAt).toISOString();
  const fixedRange = checkpoint.request ?? checkpoint.page;
  const lower = fixedRange?.until ?? checkpoint.after ?? "";
  // Prefix the ID with a two-digit length so SQLite can seek in numeric order without integer coercion.
  const lowerKey = `${lower.length + 10}${lower}`;
  const upper = checkpoint.recovery?.until;
  const upperKey = upper ? `${upper.length + 10}${upper}` : null;
  const needsBounds = !fixedRange || fixedRange.until !== null && fixedRange.until !== upper;
  const bounds = needsBounds ? (await db.prepare(`SELECT id FROM x_posts
    WHERE handle=? AND ((length(id) + 10) || id)>?
      AND (user_id=? OR user_id IS NULL) AND (? IS NOT NULL OR created_at>=?)
      AND length(id)<=19 AND id GLOB '[1-9]*' AND id NOT GLOB '*[^0-9]*'
      ${upperKey === null ? "" : "AND ((length(id) + 10) || id) < ?"}
    ORDER BY (length(id) + 10) || id LIMIT ?`)
    .bind(handle, lowerKey, userId, base, startTime,
      ...(upperKey === null ? [] : [upperKey]), X_TIMELINE_GAP_BATCH_SIZE)
    .all<{ id: string }>()).results.map(row => row.id) : [];
  if (needsBounds && upper && bounds.length < X_TIMELINE_GAP_BATCH_SIZE) bounds.push(upper);

  return { base, checkpoint, bounds, startTime, revision: source.insert_revision };
}

export async function readXTimelineGapBoundary(db: Pick<D1Database, "prepare">, handle: string, userId: string,
  after: string | null, until: string | null, revision: number, storedIds: string[] = []) {
  const lower = after ?? "";
  const current = await db.prepare(`SELECT insert_revision AS revision, EXISTS(SELECT 1 FROM x_posts INDEXED BY idx_x_posts_handle_insert_revision WHERE handle=x_post_sources.handle AND (user_id=? OR user_id IS NULL)
    AND ((length(id)+10)||id)>? ${until ? "AND ((length(id)+10)||id)<?" : ""}
    AND insert_revision>? AND id NOT IN (SELECT value FROM json_each(?))
    AND length(id)<=19 AND id GLOB '[1-9]*' AND id NOT GLOB '*[^0-9]*') AS changed FROM x_post_sources WHERE handle=?`)
    .bind(userId, `${lower.length + 10}${lower}`, ...(until ? [`${until.length + 10}${until}`] : []), revision, JSON.stringify(storedIds), handle)
    .first<{ revision: number; changed: number }>();
  if (!current) throw new Error("x_source_lease_lost");
  return current;
}
