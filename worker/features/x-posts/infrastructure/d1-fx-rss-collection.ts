import { FX_RSS_INTERVAL_MS, type FxRssCandidate, type FxRssContinuation, type FxRssPaidBatch, type FxRssStats } from "@contracts/x-collection";
import { parseSiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";
import { parseFxRssContinuation } from "../application/fx-rss-collection";
import type { FxRssCollectionPorts } from "../ports/fx-rss-collection";
import type { XPostDto } from "@contracts/x-posts";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import type { ScheduledJobItemRecord } from "../../../platform/scheduled-jobs";
import { readActiveXHandles, prepareXSourceLeaseClaim, releaseXSourceLeases } from "./x-collection";
import { fetchFxRssFeed } from "./fx-rss-api";
import { fetchFxStatus } from "./fx-api";
import { extractXHandleFromUrl, writeStoredPosts } from "./x-api";
import { fxRssWriteFenceSql, type FxRssWriteFence } from "./fx-rss-write-fence";
import { hydrateOfficialRssCandidates, prepareOfficialRssBatch } from "./x-rss-official-hydration";
import { readStoredRssCandidateIds } from "./rss-stored-candidates";
import { rssD1RetryHasRoom } from "./rss-d1-budget";

const policySql = "SELECT key,value FROM settings WHERE key IN ('x_collection_enabled','x_collection_primary_source','x_collection_hybrid_policy','x_collection_hybrid_activated_at')";
const isRssPolicy = (rows: Array<{ key: string; value: string }>) => {
  const values = new Map(rows.map(row => [row.key, row.value]));
  const activatedAt = Number(values.get("x_collection_hybrid_activated_at"));
  return values.get("x_collection_enabled") === "true" && values.get("x_collection_primary_source") === "fxembed" && values.get("x_collection_hybrid_policy") === "rss_v1" && Number.isFinite(activatedAt) && activatedAt > 0;
};
const readPolicy = async (env: Env) => isRssPolicy((await env.otw_db.prepare(policySql).all<{ key: string; value: string }>()).results);

export async function readDueFxRssCollectionTargets(env: Env, timestamp: number): Promise<FxRssContinuation[]> {
  if (!await readPolicy(env)) return [];
  const handles = await readActiveXHandles(getDb(env), parseSiteId(env.SITE_ID));
  if (!handles.length) return [];
  const rows = await env.otw_db.prepare(`SELECT requested.value handle,s.deactivated_at,f.rss_pending_item_id,f.rss_cadence_anchor_at,f.rss_last_attempt_at,
      i.status,i.continuation_json FROM json_each(?) requested
    LEFT JOIN x_post_sources s ON s.handle=requested.value LEFT JOIN x_fx_sources f ON f.handle=requested.value
    LEFT JOIN scheduled_job_items i ON i.id=f.rss_pending_item_id`)
    .bind(JSON.stringify(handles)).all<{ handle: string; deactivated_at: number | null; rss_pending_item_id: string | null; rss_cadence_anchor_at: number | null; rss_last_attempt_at: number | null; status: string | null; continuation_json: string | null }>();
  const targets: FxRssContinuation[] = [];
  for (const row of rows.results) {
    if (row.deactivated_at !== null) continue;
    if (row.rss_pending_item_id) {
      if (!["partial", "failed", "throttled", "skipped"].includes(row.status ?? "") || !row.continuation_json) continue;
      try {
        const state = parseFxRssContinuation(JSON.parse(row.continuation_json));
        // An empty snapshot can still owe the source's final acknowledgement.
        if (Number(state.nextAttemptAt ?? 0) > timestamp) continue;
        if (state.candidates.length && state.candidates.every(candidate => candidate.stage === "official")) {
          const stored = await readStoredRssCandidateIds(env.otw_db, state.candidates.map(candidate => candidate.id));
          if (stored.length !== state.candidates.length && !(await prepareOfficialRssBatch(env, row.handle, state.candidates, state.paidBatch ?? null)).batch) continue;
        }
        targets.push({ ...state, scope: "pending" as const, resumeFromItemId: row.rss_pending_item_id,
          ...(state.candidates.some(candidate => candidate.stage === "official" || candidate.attempts >= 1) ? { executionPriority: {
            deadlineAt: Math.min(...state.candidates.map(candidate => candidate.firstSeenAt + 24 * 3_600_000)),
            lastAttemptAt: row.rss_last_attempt_at ?? 0, key: `${row.handle}:1-rss`,
          } } : {}) });
      } catch { /* Invalid snapshots remain pending for inspection. */ }
      continue;
    }
    const anchor = row.rss_cadence_anchor_at ?? row.rss_last_attempt_at;
    if (anchor === null || timestamp - anchor >= FX_RSS_INTERVAL_MS) targets.push({ provider: "fxembed", mode: "rss_candidates", scope: "regular", handles: [row.handle], phase: "fetch", candidates: [], nextAttemptAt: null });
  }
  return targets;
}

export class D1FxRssCollectionAdapter implements FxRssCollectionPorts {
  private token: string | null = null;
  private feedFetched = false;
  private writeFence: FxRssWriteFence | undefined;
  private trustedUserId: string | null = null;
  private readonly handle: string;
  private readonly env: Env;
  private readonly item: ScheduledJobItemRecord;
  private readonly save: (state: FxRssContinuation, stats: FxRssStats, commit: (statement: D1PreparedStatement) => Promise<boolean>) => Promise<boolean>;
  readonly now: () => number;
  constructor(env: Env, item: ScheduledJobItemRecord,
    save: D1FxRssCollectionAdapter["save"], now = Date.now) {
    this.env = env;
    this.item = item;
    this.save = save;
    this.now = now;
    this.handle = parseFxRssContinuation(JSON.parse(item.continuation_json ?? "{}")).handles[0];
  }
  async readContext(handle: string, claim?: {token:string;timestamp:number}) {
    const [settings, members, sources, leased] = await this.env.otw_db.batch([
      this.env.otw_db.prepare(policySql),
      this.env.otw_db.prepare(`SELECT uid,url_twitter FROM members WHERE coalesce(is_deprecated,0)=0 AND content_access='normal' AND NOT (${publicationHiddenSql("members", "members", parseSiteId(this.env.SITE_ID))})`),
      this.env.otw_db.prepare(`SELECT s.deactivated_at,COALESCE(s.user_id,f.user_id) user_id,COALESCE(f.collection_started_at,s.collection_started_at,?) collection_started_at,f.rss_pending_item_id,f.rss_last_raw_count,f.rss_previous_raw_count
        FROM x_post_sources s LEFT JOIN x_fx_sources f ON f.handle=s.handle WHERE s.handle=?`).bind(this.now(), handle),
      ...(claim ? [prepareXSourceLeaseClaim(this.env,handle,claim.token,claim.timestamp)] : []),
    ]);
    const source = sources.results[0] as { deactivated_at: number | null; user_id: string | null; collection_started_at: number; rss_pending_item_id: string | null; rss_last_raw_count: number | null; rss_previous_raw_count: number | null } | undefined;
    const allowed = (members.results as Array<{ url_twitter: string | null }>).some(member => typeof member.url_twitter === "string" && extractXHandleFromUrl(member.url_twitter)?.toLowerCase() === handle);
    this.trustedUserId = source?.user_id ?? null;
    return { claimed: Boolean(leased?.results.length), members: members.results as Array<{uid:number;url_twitter:string|null}>, allowed: allowed && source?.deactivated_at == null, policy: isRssPolicy(settings.results as Array<{ key: string; value: string }>) ? "rss_v1" as const : "legacy" as const,
      collectionStartedAt: source?.collection_started_at ?? this.now(), trustedUserId: source?.user_id ?? null, pendingItemId: source?.rss_pending_item_id ?? null,
      windowReduced: source?.rss_last_raw_count != null && source.rss_previous_raw_count != null && source.rss_last_raw_count < source.rss_previous_raw_count };
  }
  async start(state: FxRssContinuation) {
    this.token=crypto.randomUUID();
    const context = await this.readContext(this.handle,{token:this.token,timestamp:this.now()});
    if (!context.allowed || context.policy !== "rss_v1" || !context.trustedUserId) return false;
    if (!context.claimed) throw new Error("x_source_lease_busy");
    const now = this.now();
    this.writeFence = { handle: this.handle, itemId: this.item.id, itemLeaseToken: this.item.lease_token ?? "", sourceLeaseToken: this.token,
      members: context.members.flatMap(member => member.url_twitter && extractXHandleFromUrl(member.url_twitter)?.toLowerCase() === this.handle ? [{ uid: member.uid, urlTwitter: member.url_twitter }] : []) };
    const fence = fxRssWriteFenceSql(this.writeFence, parseSiteId(this.env.SITE_ID), false);
    const [, ack] = await this.env.otw_db.batch([
      this.env.otw_db.prepare(`INSERT INTO x_fx_sources(handle,collection_started_at,updated_at) SELECT ?,?,? WHERE (${fence.sql}) ON CONFLICT(handle) DO NOTHING`)
      .bind(this.handle, context.collectionStartedAt, now, ...fence.bindings),
      this.env.otw_db.prepare(`UPDATE x_fx_sources SET
      rss_cadence_anchor_at=CASE WHEN rss_pending_item_id IS NULL THEN (SELECT COALESCE(scheduled_for,?) FROM scheduled_job_runs WHERE id=?) ELSE rss_cadence_anchor_at END,
      rss_last_attempt_at=CASE WHEN rss_pending_item_id IS NULL THEN ? ELSE rss_last_attempt_at END,
      rss_pending_item_id=?,updated_at=?
      WHERE handle=? AND (rss_pending_item_id=? OR (? IS NOT NULL AND rss_pending_item_id=? AND EXISTS(
        SELECT 1 FROM scheduled_job_items predecessor WHERE predecessor.id=x_fx_sources.rss_pending_item_id
          AND json_extract(predecessor.continuation_json,'$.phase')=?
          AND json_extract(predecessor.continuation_json,'$.candidates')=json(?)
          AND json_extract(predecessor.continuation_json,'$.paidBatch') IS json_extract(?,'$')
          AND json_extract(predecessor.continuation_json,'$.nextAttemptAt') IS ?)) OR
        (? IS NULL AND rss_pending_item_id IS NULL AND ?='fetch' AND COALESCE(rss_cadence_anchor_at,rss_last_attempt_at,0)<=?))
      AND (${fence.sql})
      RETURNING handle`).bind(now, this.item.run_id, now, this.item.id, now, this.handle, this.item.id, state.resumeFromItemId ?? null, state.resumeFromItemId ?? null,
        state.phase, JSON.stringify(state.candidates), JSON.stringify(state.paidBatch ?? null), state.nextAttemptAt,
        state.resumeFromItemId ?? null, state.phase, now - FX_RSS_INTERVAL_MS, ...fence.bindings),
    ]);
    return ack.results.length > 0;
  }
  async release() { if (this.token) await releaseXSourceLeases(this.env, this.token); }
  async fetchFeed(handle: string) {
    const previous = await this.env.otw_db.prepare("SELECT rss_last_raw_count FROM x_fx_sources WHERE handle=?").bind(handle).first<number>("rss_last_raw_count");
    const page = await fetchFxRssFeed(handle);
    this.feedFetched = true;
    return { ...page, windowReduced: previous !== null && page.rawCount < previous };
  }
  fetchStatus = fetchFxStatus;
  async readStoredIds(ids: string[]) {
    return readStoredRssCandidateIds(this.env.otw_db, ids);
  }
  async store(post: XPostDto, origin: "fxembed" | "x_api") {
    if (!this.writeFence || !this.trustedUserId) return { ok: false, postsStored: 0 };
    const storedAt = this.now();
    // The writer snapshots and atomically revalidates the current effective identity and fence.
    const stored = await writeStoredPosts(this.env.otw_db, this.handle, { id: this.trustedUserId, username: this.handle }, [post], storedAt, parseSiteId(this.env.SITE_ID),
      { origin, completeness: { text: true, media: true, relations: true } }, this.writeFence);
    return { ok: stored.ok, postsStored: stored.count,
      newlyStoredPosts: stored.insertedIds.includes(post.id) ? [{ id: post.id, createdAt: post.createdAt, storedAt }] : [] };
  }
  async prepareOfficialBatch(candidates: FxRssCandidate[], batch: FxRssPaidBatch | null) {
    // Only a previously observed CAS conflict may defer paid admission to preserve its settlement and unwind.
    if (!rssD1RetryHasRoom(this.env.otw_db,30)) return { batch: null, error: "rss_d1_retry_budget" };
    return prepareOfficialRssBatch(this.env, this.handle, candidates, batch, this.writeFence);
  }
  async hydrateOfficial(candidates: FxRssCandidate[]) {
    if (!this.writeFence) throw new Error("rss_write_fence_missing");
    return hydrateOfficialRssCandidates(this.env, this.handle, candidates, this.writeFence);
  }
  async checkpoint(state: FxRssContinuation, stats: FxRssStats) {
    if (!this.writeFence) return false;
    const now = this.now(), completed = state.phase === "hydrate" && state.candidates.length === 0, fetched = this.feedFetched ? 1 : 0;
    const fence = fxRssWriteFenceSql(this.writeFence, parseSiteId(this.env.SITE_ID));
    const source = this.env.otw_db.prepare(`UPDATE x_fx_sources SET
      rss_last_http_success_at=CASE WHEN ? THEN ? ELSE rss_last_http_success_at END,
      rss_previous_raw_count=CASE WHEN ? THEN rss_last_raw_count ELSE rss_previous_raw_count END,
      rss_last_raw_count=CASE WHEN ? THEN ? ELSE rss_last_raw_count END,
      rss_last_candidate_count=CASE WHEN ? THEN ? ELSE rss_last_candidate_count END,
      rss_last_check_completed_at=CASE WHEN ? THEN ? ELSE rss_last_check_completed_at END,
      rss_last_error=?,rss_pending_item_id=CASE WHEN ? THEN NULL ELSE rss_pending_item_id END,updated_at=?
      WHERE handle=? AND rss_pending_item_id=? AND (${fence.sql})
      RETURNING handle`).bind(fetched, now, fetched, fetched, stats.rawCount, fetched, stats.candidatesFound,
        completed ? 1 : 0, now, state.candidates.find(candidate => candidate.error)?.error ?? (state.phase === "fetch" ? "rss_feed_pending" : null), completed ? 1 : 0, now, this.handle, this.item.id, ...fence.bindings);
    const saved = await this.save(state, stats, async item => {
      const assert = (predicate: string, bindings: (string | number)[] = []) => this.env.otw_db.prepare(
        `SELECT CASE WHEN (${predicate}) THEN 1 ELSE json_extract('[]','rss_checkpoint_lost') END`).bind(...bindings);
      try {
        await this.env.otw_db.batch([assert(fence.sql, fence.bindings), item, assert("changes()=1"), source, assert("changes()=1")]);
        return true;
      } catch (error) {
        if (error instanceof Error && error.message.includes("rss_checkpoint_lost")) return false;
        throw error;
      }
    });
    if (saved) this.feedFetched = false;
    return Boolean(saved);
  }
}
