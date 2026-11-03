import type { FxRssCandidate, FxRssExcludedCandidate, FxRssPaidBatch } from "@contracts/x-collection";
import { parseSiteId } from "@contracts/site-definition";
import type { Env } from "../../../platform/types";
import type { OfficialRssHydrationResult } from "../ports/fx-rss-collection";
import { parseFxRssContinuation } from "../application/fx-rss-collection";
import { fxRssWriteFenceSql, type FxRssWriteFence } from "./fx-rss-write-fence";
import { prepareStoredRssCandidateIds } from "./rss-stored-candidates";
import { estimateXApiRequestCostMicros, estimateXSharedApiReservationMicros, normalizeDailyBudgetMicros, normalizeXTimelineResponse, requestXApi, writeStoredPosts, xTimelineWriteContext, XApiError, type XApiUsageTracker, type XTweetLookupResponse } from "./x-api";

const pathFor = (ids: string[]) => `/tweets?${new URLSearchParams({ ids: ids.join(","), "tweet.fields": "author_id,created_at,public_metrics,attachments,entities,referenced_tweets,conversation_id,in_reply_to_user_id,note_tweet", expansions: "author_id,attachments.media_keys", "user.fields": "protected", "media.fields": "url,preview_image_url,type,width,height,alt_text" })}`;
type OfficialSource = { user_id: string | null; collection_started_at: number | null; last_completed_at: number | null; sync_pagination_token: string | null; sync_origin_scope: string | null; sync_timeline_completed_at: number | null; deactivated_at: number | null };
const readOfficialContext = async (env: Env, handle: string, candidates: FxRssCandidate[], fence?: FxRssWriteFence) => {
  const guard = fxRssWriteFenceSql(fence, parseSiteId(env.SITE_ID));
  const day = new Date(Date.now()).toISOString().slice(0, 10), start = Date.parse(`${day}T00:00:00Z`);
  const [sources, storedRows, timelineRows, settingsRows, budgetRows, itemRows] = await env.otw_db.batch([
    env.otw_db.prepare(`SELECT s.user_id,COALESCE(f.collection_started_at,s.collection_started_at) collection_started_at,s.last_completed_at,s.sync_pagination_token,s.sync_origin_scope,s.sync_timeline_completed_at,s.deactivated_at
      FROM x_post_sources s LEFT JOIN x_fx_sources f ON f.handle=s.handle WHERE s.handle=?`).bind(handle),
    prepareStoredRssCandidateIds(env.otw_db,candidates.map(candidate=>candidate.id)),
    env.otw_db.prepare(`SELECT 1 FROM scheduled_job_items current JOIN scheduled_job_items timeline ON timeline.run_id=current.run_id
      WHERE current.id=? AND timeline.id<>current.id AND COALESCE(json_extract(timeline.continuation_json,'$.provider'),'x_api')='x_api'
        AND EXISTS(SELECT 1 FROM json_each(timeline.continuation_json,'$.handles') WHERE value=?)`).bind(fence?.itemId ?? null,handle),
    env.otw_db.prepare("SELECT key,value FROM settings WHERE key IN ('x_api_backoff_until','x_collection_daily_budget_cents')"),
    env.otw_db.prepare(`SELECT COALESCE((SELECT used FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'),
      (SELECT COALESCE(SUM(estimated_cost_micros),0) FROM x_api_usage_events WHERE created_at>=? AND created_at<?)) used,
      COALESCE((SELECT reserved FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'),0) reserved`).bind(day,start,start+86_400_000,day),
    env.otw_db.prepare(`SELECT i.continuation_json,r.source FROM scheduled_job_items i JOIN scheduled_job_runs r ON r.id=i.run_id WHERE i.id=? AND (${guard.sql})`).bind(fence?.itemId ?? null,...guard.bindings),
  ]);
  const settings = new Map((settingsRows.results as {key:string;value:string}[]).map(row=>[row.key,row.value]));
  return { source: sources.results[0] as OfficialSource | undefined, stored: new Set(storedRows.results.map(row=>String((row as {id:string}).id))),
    timelinePending: timelineRows.results.length>0, backoff: Number(settings.get('x_api_backoff_until') ?? 0),
    limit: normalizeDailyBudgetMicros(settings.get('x_collection_daily_budget_cents')),
    site: budgetRows.results[0] as {used:number;reserved:number},
    item: itemRows.results[0] as {continuation_json:string|null;source:string} | undefined };
};

export async function prepareOfficialRssBatch(env: Env, handle: string, candidates: FxRssCandidate[], previous: FxRssPaidBatch | null, fence?: FxRssWriteFence): Promise<{ batch: FxRssPaidBatch | null; error: string | null }> {
  return prepareWithContext(env,handle,candidates,previous,await readOfficialContext(env,handle,candidates,fence),fence);
}

async function prepareWithContext(env: Env, handle: string, candidates: FxRssCandidate[], previous: FxRssPaidBatch | null,
  context: Awaited<ReturnType<typeof readOfficialContext>>, fence?: FxRssWriteFence): Promise<{ batch: FxRssPaidBatch | null; error: string | null }> {
  const {source,stored,site,limit} = context;
  if (fence && !context.item) return { batch: null, error: "rss_write_fence_lost" };
  const eligible = candidates.filter(candidate => candidate.stage === "official" && candidate.attempts >= 2 && candidate.nextAttemptAt <= Date.now());
  if (previous && eligible.length && eligible.every(candidate => stored.has(candidate.id))) return { batch: previous, error: null };
  if (!source?.user_id || source.deactivated_at != null || source.sync_pagination_token || source.sync_origin_scope || source.sync_timeline_completed_at != null || context.timelinePending) return { batch: null, error: "rss_official_timeline_pending" };
  const qualified = eligible.filter(candidate => stored.has(candidate.id) || Number(source.last_completed_at ?? 0) >= candidate.firstSeenAt);
  if (!qualified.some(candidate => !stored.has(candidate.id))) return { batch: null, error: "rss_official_timeline_pending" };
  if (context.backoff > Date.now()) return { batch: null, error: "rate_limited" };
  const shared = await env.X_API_GATEWAY?.readBudget();
  const single = pathFor(["1"]), siteRemaining = limit - site.used - site.reserved;
  const day = new Date(Date.now()).toISOString().slice(0, 10);
  if (!shared?.seeded || shared.day !== day || shared.remaining < 30_000) return { batch: null, error: "budget_exceeded" };
  const size = Math.max(0, Math.min(99, Math.floor(shared.remaining / estimateXSharedApiReservationMicros("tweet_lookup", single)), Math.floor(siteRemaining / estimateXApiRequestCostMicros("tweet_lookup", single))));
  // A successful cache replay still reserves the complete original batch.
  if (previous) {
    if (!previous.requestId.startsWith(`${parseSiteId(env.SITE_ID)}:rss:${handle}:`) || !env.X_API_GATEWAY?.readReceipt) return { batch: null, error: "shared_receipt_unavailable" };
    let receipt;
    try { receipt = await env.X_API_GATEWAY.readReceipt({ id: previous.requestId, operation: "tweet_lookup", path: pathFor(previous.ids) }); }
    catch { return { batch: null, error: "shared_receipt_unavailable" }; }
    if (!receipt || receipt.found !== false && (receipt.found !== true || !/^\d{4}-\d{2}-\d{2}$/.test(receipt.day) || receipt.day > day || typeof receipt.status !== "string" || ![true, false, null].includes(receipt.ok))) return { batch: null, error: "shared_receipt_unavailable" };
    if (receipt.found && receipt.status !== "blocked" && !(receipt.status === "complete" && receipt.ok !== null)) return { batch: null, error: receipt.status === "redacted" ? "x_gateway_result_redacted" : "x_gateway_request_in_progress" };
    if (receipt.found && receipt.status === "complete" && receipt.ok && receipt.day === day || !receipt.found && previous.day === day) {
      if (size < previous.ids.length || eligible.some(candidate => previous.ids.includes(candidate.id) && !qualified.includes(candidate))) return { batch: null, error: "budget_exceeded" };
      return { batch: previous, error: null };
    }
  }
  const ids = qualified.filter(candidate => !stored.has(candidate.id)).sort((a,b) => Math.min(a.firstSeenAt, a.createdAtHint) - Math.min(b.firstSeenAt, b.createdAtHint) || a.id.localeCompare(b.id)).slice(0, size).map(candidate => candidate.id);
  return ids.length ? { batch: { day, ids, requestId: `${parseSiteId(env.SITE_ID)}:rss:${handle}:${day}:${crypto.randomUUID()}` }, error: null } : { batch: null, error: "budget_exceeded" };
}

export async function hydrateOfficialRssCandidates(env: Env, handle: string, candidates: FxRssCandidate[], fence: FxRssWriteFence): Promise<OfficialRssHydrationResult> {
  const result: OfficialRssHydrationResult = { resolvedIds: [], remaining: candidates, postsReturned: 0, postsStored: 0, paidApiCalls: 0, estimatedCostMicros: 0, error: null };
  const context = await readOfficialContext(env,handle,candidates,fence);
  if (!context.item) return { ...result, error: "rss_write_fence_lost" };
  const batch = context.item.continuation_json ? parseFxRssContinuation(JSON.parse(context.item.continuation_json)).paidBatch : null;
  if (!batch) return { ...result, error: "rss_paid_batch_missing" };
  const stored = context.stored;
  result.resolvedIds = candidates.filter(candidate => stored.has(candidate.id)).map(candidate => candidate.id);
  const unresolved = candidates.filter(candidate => !stored.has(candidate.id));
  if (!unresolved.length) return { ...result, remaining: [], batchProcessed: true };
  const prepared = await prepareWithContext(env, handle, candidates, batch, context, fence);
  if (!prepared.batch || prepared.batch.requestId !== batch.requestId) return { ...result, error: prepared.error ?? "rss_paid_batch_expired" };
  const identity = context.source;
  const tracker: XApiUsageTracker = { apiCalls: 0, estimatedCostMicros: 0, reservedCostMicros: 0, uniqueResources: 0, previewDeferred: 0, authorCacheHits: 0, authorCacheMisses: 0, source: context.item.source === "manual" ? "manual" : "scheduled", purpose: "collection", gateway: env.X_API_GATEWAY };
  try {
    const response = await requestXApi<XTweetLookupResponse>(pathFor(batch.ids), env.X_BEARER_TOKEN ?? "", { cacheDb: env.otw_db, operation: "tweet_lookup", usageTracker: tracker, requestId: batch.requestId, admissionFence: { fence, siteId: parseSiteId(env.SITE_ID) } });
    const requested = new Set(batch.ids), needed = new Set(unresolved.map(candidate => candidate.id));
    const publicAuthor = response.includes?.users?.find(user => user.id === identity?.user_id && user.protected === false);
    const valid = (response.data ?? []).filter(post => requested.has(post.id) && needed.has(post.id) && post.author_id === identity?.user_id && publicAuthor && Number.isFinite(Date.parse(post.created_at ?? "")));
    result.excludedCandidates = (response.data ?? []).flatMap<FxRssExcludedCandidate>(post => {
      if (!requested.has(post.id) || !needed.has(post.id)) return [];
      if (identity?.user_id && typeof post.author_id === "string" && /^\d{1,25}$/.test(post.author_id) && post.author_id !== identity.user_id) return [{ id: post.id, reason: "wrong_author" as const }];
      if (!valid.includes(post)) return [];
      if (Date.parse(post.created_at!) < Number(identity?.collection_started_at ?? Date.now())) return [{ id: post.id, reason: "before_start" as const }];
      if (post.referenced_tweets?.some(reference => reference.type === "retweeted")) return [{ id: post.id, reason: "repost" as const }];
      return [];
    });
    const excluded = result.excludedCandidates.map(post => post.id);
    const eligible = { ...response, data: valid.filter(post => !excluded.includes(post.id)) };
    const posts = normalizeXTimelineResponse(eligible, handle);
    result.postsReturned = posts.length;
    const storedAt = Date.now();
    const saved = await writeStoredPosts(env.otw_db, handle, { id: identity!.user_id!, username: handle }, posts, storedAt, parseSiteId(env.SITE_ID), post => xTimelineWriteContext(eligible, post.id), fence);
    result.postsStored = saved.ok ? saved.count : saved.insertedIds.length;
    result.newlyStoredPosts = posts.filter(post => saved.insertedIds.includes(post.id)).map(post => ({ id: post.id, createdAt: post.createdAt, storedAt }));
    if (!saved.ok) return Object.assign(result, { error: "rss_storage_failed" });
    result.resolvedIds.push(...posts.map(post => post.id), ...excluded);
    const resolved = new Set(result.resolvedIds);
    result.remaining = candidates.filter(candidate => !resolved.has(candidate.id));
    const returnedIds = new Set((response.data ?? []).map(post => post.id));
    result.batchProcessed = result.remaining.every(candidate => !requested.has(candidate.id) || !returnedIds.has(candidate.id));
    result.error = result.remaining.length ? "rss_official_candidates_pending" : null;
    return result;
  } catch (error) {
    return Object.assign(result, { error: error instanceof XApiError ? error.code ?? "rss_official_lookup_failed" : "rss_official_lookup_failed" });
  } finally {
    // Object references are retained on early returns so incurred cost survives failures.
    result.paidApiCalls = tracker.apiCalls;
    result.estimatedCostMicros = tracker.estimatedCostMicros;
  }
}
