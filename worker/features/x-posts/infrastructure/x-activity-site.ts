import type { SiteId } from "@contracts/site-definition";
import type { XApiGateway, XActivitySiteSnapshot, XActivityStatusDto } from "@contracts/x-activity";
import { parseXActivityEvent, xActivityMediaReady, type XActivityEvent } from "../domain/x-activity";
import { readActiveXHandles } from "./d1-active-handles";
import { normalizeXTimelineResponse, requestXApi, writeStoredPosts, invalidateXPostMemoryCache, XApiError, estimateXApiRequestCostMicros, readDailyBudgetMicros, type XApiUser, type XTweetLookupResponse } from "./x-api";
import { X_COLLECTION_MAX_RESULTS, X_OPTIMIZED_FIRST_PAGE_RESULTS } from "./x-collection";
import { readXReferenceBudget } from "./x-reference-budget";
import { readSiteXBudget } from "./x-shared-budget";

interface Options {
  db: D1Database; siteId: SiteId; gateway: XApiGateway;
  publicationOpen(): boolean; dispatch(eventId: string): Promise<void>;
}
interface Inbox {
  event_id: string; post_id: string; handle: string; user_id: string; payload: string | null;
  hydrated_payload: string | null; received_at: number; lookup_attempted_at: number | null; lookup_attempts: number;
}
const DAY = 86_400_000;
const nextDay = () => (Math.floor(Date.now()/DAY)+1)*DAY;
const errorCode = (error: unknown) => error instanceof Error ? error.message.slice(0,250) : "x_activity_failed";

export class D1XActivitySite {
  private readonly options: Options;
  constructor(options: Options) { this.options = options; }
  private get db() { return this.options.db; }
  private async collectionEnabled() {
    return this.options.publicationOpen() && await this.db.prepare("SELECT value FROM settings WHERE key='x_collection_enabled'").first("value") === "true";
  }
  private async sourceAllowed(handle: string, userId: string) {
    return (await readActiveXHandles(this.db,this.options.siteId)).has(handle) &&
      !!await this.db.prepare("SELECT handle FROM x_post_sources WHERE handle=? AND user_id=? AND deactivated_at IS NULL").bind(handle,userId).first();
  }
  async snapshot(): Promise<XActivitySiteSnapshot> {
    const enabled = await this.collectionEnabled();
    const handles = enabled ? [...await readActiveXHandles(this.db,this.options.siteId)] : [];
    const rows = handles.length ? await this.db.prepare("SELECT handle,user_id FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?)) AND deactivated_at IS NULL")
      .bind(JSON.stringify(handles)).all<{handle:string;user_id:string|null}>() : {results:[]};
    const users = new Map(rows.results.map(row=>[row.handle,row.user_id]));
    const recovery = await this.db.prepare("SELECT MIN(last_success_at) AS lastSuccessAt,COUNT(CASE WHEN sync_pagination_token IS NOT NULL THEN 1 END) AS pendingSources FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?))")
      .bind(JSON.stringify(handles)).first<{lastSuccessAt:number|null;pendingSources:number}>();
    const interval = await this.db.prepare("SELECT value FROM settings WHERE key='x_collection_interval_hours'").first<string>("value");
    const cachePurgePending=await this.db.prepare("SELECT COUNT(*) AS count FROM x_activity_cache_redactions WHERE completed_at IS NULL").first<number>("count");
    const optimized=await this.db.prepare("SELECT value FROM settings WHERE key='x_cost_optimizer_enabled'").first<string>("value")==="true";
    const pageSize=optimized?X_OPTIMIZED_FIRST_PAGE_RESULTS:X_COLLECTION_MAX_RESULTS;
    const perPageMicros=estimateXApiRequestCostMicros("timeline",`/users/1/tweets?max_results=${pageSize}`);
    // A source ID does not guarantee a fresh user cache, so include refresh headroom for every target.
    const identityMicros=estimateXApiRequestCostMicros("user_lookup","/users/by?"+new URLSearchParams({usernames:handles.join(",")}));
    return { site: this.options.siteId, collectionEnabled: enabled, targets: handles.map(handle=>({handle,userId:users.get(handle)??null})),
      budget: await readSiteXBudget(this.db), cachePurgePending:Number(cachePurgePending??0), recovery: {
        intervalHours: Number(interval ?? 24), lastSuccessAt: recovery?.lastSuccessAt ?? null, pendingSources: recovery?.pendingSources ?? 0,
        estimate:{targetCount:handles.length,pageSize,perPageMicros,firstPagesMicros:handles.length*perPageMicros+identityMicros,identityMicros,siteLimitMicros:await readDailyBudgetMicros(this.db)},
      } };
  }
  async rememberUser(handle: string, user: XApiUser) {
    if (!/^[1-9]\d{0,24}$/.test(user.id) || user.protected || user.username.toLowerCase()!==handle ||
      !(await readActiveXHandles(this.db,this.options.siteId)).has(handle)) return false;
    const row = await this.db.prepare(`INSERT INTO x_post_sources(handle,user_id,username,last_checked_at,updated_at,collection_started_at)
      VALUES(?,?,?,0,?,?) ON CONFLICT(handle) DO UPDATE SET user_id=excluded.user_id,username=excluded.username,updated_at=excluded.updated_at,
      deactivated_at=NULL,collection_started_at=COALESCE(x_post_sources.collection_started_at,excluded.collection_started_at)
      WHERE x_post_sources.user_id IS NULL OR x_post_sources.user_id=excluded.user_id RETURNING handle`)
      .bind(handle,user.id,user.username,Date.now(),Date.now()).first();
    return !!row;
  }
  async events(): Promise<XActivityStatusDto["events"]> {
    return (await this.db.prepare(`SELECT post_id AS postId,received_at AS receivedAt,status,media_source AS mediaSource,
      media_count AS mediaCount,media_types AS mediaTypes,last_error AS error FROM x_activity_inbox ORDER BY received_at DESC LIMIT 20`).all<XActivityStatusDto["events"][number]>()).results;
  }
  async setRecoveryInterval() {
    if (!await this.collectionEnabled()) throw new Error("x_collection_disabled");
    const handles=[...await readActiveXHandles(this.db,this.options.siteId)],now=Date.now();
    await this.db.batch([
      this.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('x_collection_interval_hours','24',?) ON CONFLICT(key) DO UPDATE SET value='24',updated_at=excluded.updated_at").bind(now),
      this.db.prepare(`UPDATE x_post_sources SET collection_started_at=?,updated_at=? WHERE handle IN (SELECT value FROM json_each(?))
        AND collection_started_at IS NULL AND last_seen_post_id IS NULL AND initialization_completed_at IS NULL`).bind(now,now,JSON.stringify(handles)),
    ]);
  }
  async accept(body: unknown) {
    const event = parseXActivityEvent(body);
    if (!event || !await this.collectionEnabled()) return false;
    const handles = [...await readActiveXHandles(this.db,this.options.siteId)];
    const source = await this.db.prepare("SELECT handle FROM x_post_sources WHERE user_id=? AND handle IN (SELECT value FROM json_each(?)) AND deactivated_at IS NULL LIMIT 1")
      .bind(event.userId,JSON.stringify(handles)).first<{handle:string}>();
    if (!source) return false;
    const removed=await this.db.prepare("SELECT id FROM x_posts WHERE id=? AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL OR content_access!='normal')").bind(event.post.id).first();
    const timestamp=Date.now();
    const fresh="EXISTS(SELECT 1 FROM x_activity_inbox WHERE event_id=? AND charged=0)";
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO x_activity_inbox(event_id,post_id,handle,user_id,payload,received_at,status) VALUES(?,?,?,?,?,?,?)")
        .bind(event.eventId,event.post.id,source.handle,event.userId,removed?null:JSON.stringify(body),timestamp,removed?"skipped":"pending"),
      this.db.prepare(`INSERT INTO x_api_usage_events(operation,endpoint,resource_type,resource_count,estimated_cost_micros,status,created_at,detail)
        SELECT 'activity_event','/2/activity/post.create','shared_event',1,0,200,?,? WHERE ${fresh}`)
        .bind(timestamp,JSON.stringify({source:"xaa",purpose:"collection",sharedEventCostMicros:5000,postId:event.post.id}),event.eventId),
      this.db.prepare("UPDATE x_activity_inbox SET charged=1 WHERE event_id=? AND charged=0").bind(event.eventId),
    ]);
    const pending=await this.db.prepare("SELECT event_id FROM x_activity_inbox WHERE event_id=? AND status='pending' AND lease_until<=? AND next_attempt_at<=?")
      .bind(event.eventId,timestamp,timestamp).first();
    if(pending) await this.options.dispatch(event.eventId);
    return !removed;
  }
  async recover() {
    const redactions=await this.db.prepare("SELECT post_id FROM x_activity_cache_redactions WHERE completed_at IS NULL AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 20").bind(Date.now()).all<{post_id:string}>();
    for(const row of redactions.results){
      try{
        await this.options.gateway.redactPost(row.post_id);
        await this.db.prepare("UPDATE x_activity_cache_redactions SET completed_at=?,last_error=NULL WHERE post_id=?").bind(Date.now(),row.post_id).run();
      }catch(error){await this.db.prepare("UPDATE x_activity_cache_redactions SET next_attempt_at=?,last_error=? WHERE post_id=?").bind(Date.now()+60_000,errorCode(error),row.post_id).run();}
    }
    const rows=await this.db.prepare("SELECT event_id FROM x_activity_inbox WHERE status='pending' AND next_attempt_at<=? AND lease_until<=? ORDER BY next_attempt_at LIMIT 20")
      .bind(Date.now(),Date.now()).all<{event_id:string}>();
    for(const row of rows.results) await this.options.dispatch(row.event_id);
    await this.db.prepare("DELETE FROM x_activity_inbox WHERE event_id IN (SELECT event_id FROM x_activity_inbox WHERE received_at<? ORDER BY received_at LIMIT 100)")
      .bind(Date.now()-30*DAY).run();
  }
  private normalize(event: XActivityEvent, lookup?: XTweetLookupResponse) {
    const enriched = lookup?.data?.find(post => post.id === event.post.id);
    const response = { data: [{ ...event.post, ...enriched,
      note_tweet: (enriched as Record<string, unknown> | undefined)?.note_tweet ?? event.post.note_tweet }], includes: lookup?.includes ?? event.includes };
    return normalizeXTimelineResponse(response as Parameters<typeof normalizeXTimelineResponse>[0], "");
  }

  async process(eventId: string) {
    const timestamp = Date.now();
    const capacity = await this.db.prepare("SELECT used+reserved AS consumed,limit_value FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='d1_rows_written'").bind(new Date(timestamp).toISOString().slice(0,10)).first<{ consumed: number; limit_value: number }>();
    if (capacity && capacity.consumed >= capacity.limit_value) return;
    const lease = timestamp + 5 * 60_000;
    const row = await this.db.prepare("UPDATE x_activity_inbox SET lease_until=? WHERE event_id=? AND status='pending' AND lease_until<=? AND next_attempt_at<=? RETURNING *").bind(lease, eventId, timestamp, timestamp).first<Inbox>();
    if (!row) return;
    try {
      const event = row.payload ? parseXActivityEvent(JSON.parse(row.payload)) : null;
      const removed = await this.db.prepare("SELECT id FROM x_posts WHERE id=? AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL OR content_access!='normal')").bind(row.post_id).first();
      if (!event || removed || !await this.collectionEnabled() || !await this.sourceAllowed(row.handle, row.user_id) ||
        (event.post.referenced_tweets as Array<{ type?: string }> | undefined)?.some(ref => ref.type === "retweeted")) {
        await this.finish(row, "skipped", lease); return;
      }
      const user: XApiUser = { id: row.user_id, username: row.handle };
      const write = async (lookup?: XTweetLookupResponse) => {
        const posts = this.normalize(event, lookup).map(post => ({ ...post, username: row.handle, url: `https://x.com/${row.handle}/status/${post.id}` }));
        const result = await writeStoredPosts(this.db, row.handle, user, posts, row.received_at, this.options.siteId);
        if (!result.ok) throw new Error(result.error ?? "x_activity_store_failed");
        invalidateXPostMemoryCache();
        return posts[0]!;
      };
      let lookup = row.hydrated_payload ? JSON.parse(row.hydrated_payload) as XTweetLookupResponse : undefined;
      const rawReady = xActivityMediaReady(event);
      const existing = await this.db.prepare("SELECT id FROM x_posts WHERE id=?").bind(row.post_id).first();
      // An incomplete webhook must not erase media already collected by polling.
      if (!lookup && !rawReady && !existing) await write();
      if (!rawReady && !lookup) {
        if (row.lookup_attempts >= 3) { await this.finish(row, "failed", lease, "media_lookup_attempts_exhausted"); return; }
        if (row.lookup_attempted_at && Math.floor(row.lookup_attempted_at / DAY) === Math.floor(timestamp / DAY)) {
          await this.defer(row, lease, "media_lookup_result_uncertain"); return;
        }
        const budget = await readXReferenceBudget(this.db);
        if (budget.globalUsed + budget.globalReserved + 25_000 > budget.globalLimit) {
          await this.defer(row, lease, "budget_exceeded"); return;
        }
        const admitted = await this.db.prepare("UPDATE x_activity_inbox SET lookup_attempted_at=?,lookup_attempts=lookup_attempts+1 WHERE event_id=? AND lease_until=? AND status='pending' RETURNING event_id").bind(timestamp, eventId, lease).first();
        if (!admitted) return;
        const query = new URLSearchParams({ ids: row.post_id, "tweet.fields": "author_id,created_at,attachments,entities,referenced_tweets,conversation_id,in_reply_to_user_id,note_tweet,public_metrics",
          expansions: "attachments.media_keys", "media.fields": "media_key,type,url,preview_image_url,width,height,alt_text" });
        try {
          lookup = await requestXApi<XTweetLookupResponse>(`/tweets?${query}`, "shared-gateway", { cacheDb: this.db, operation: "tweet_lookup", estimatedCostMicros: 25_000,
            gateway: this.options.gateway, requestId: `${eventId}:media:${new Date(Date.now()).toISOString().slice(0,10)}` });
        } catch (error) {
          if(error instanceof XApiError&&error.code==="x_gateway_request_in_progress"){
            await this.db.prepare("UPDATE x_activity_inbox SET lookup_attempted_at=NULL,lookup_attempts=MAX(0,lookup_attempts-1),next_attempt_at=?,last_error=? WHERE event_id=? AND lease_until=? AND status='pending'")
              .bind(Date.now()+60_000,error.code,eventId,lease).run();
          }else await this.defer(row, lease, errorCode(error));
          return;
        }
        const post = lookup.data?.find(post => post.id === row.post_id && post.author_id === row.user_id);
        if (!post) { await this.finish(row, "unavailable", lease, "post_lookup_unavailable"); return; }
        const persisted = await this.db.prepare("UPDATE x_activity_inbox SET hydrated_payload=? WHERE event_id=? AND lease_until=? AND status='pending' RETURNING event_id").bind(JSON.stringify(lookup), eventId, lease).first();
        if (!persisted) return;
      }
      const post = await write(lookup);
      const ready = rawReady || (lookup && (!lookup.data?.[0]?.attachments?.media_keys?.length ||
        xActivityMediaReady({ ...event, post: { ...event.post, ...lookup.data[0] }, includes: lookup.includes as XActivityEvent["includes"] })));
      if (!ready) { await this.finish(row, "unavailable", lease, "media_details_missing"); return; }
      await this.db.prepare("UPDATE x_activity_inbox SET media_source=?,media_count=?,media_types=? WHERE event_id=? AND lease_until=? AND status='pending'")
        .bind(lookup ? "lookup" : "raw", post.media.length, [...new Set(post.media.map(item => item.type))].join(", "), eventId, lease).run();
      await this.finish(row, "complete", lease);
    } catch(error) {
      await this.db.prepare("UPDATE x_activity_inbox SET last_error=?,next_attempt_at=? WHERE event_id=? AND lease_until=? AND status='pending'").bind(errorCode(error),Date.now()+60_000,eventId,lease).run();
      throw error;
    } finally { await this.db.prepare("UPDATE x_activity_inbox SET lease_until=0 WHERE event_id=? AND lease_until=?").bind(eventId, lease).run(); }
  }
  private finish(row: Inbox, status: string, lease: number, error: string | null = null) {
    return this.db.prepare("UPDATE x_activity_inbox SET status=?,payload=NULL,hydrated_payload=NULL,last_error=? WHERE event_id=? AND lease_until=? AND status='pending'").bind(status, error, row.event_id, lease).run();
  }
  private defer(row: Inbox, lease: number, error: string) {
    return this.db.prepare("UPDATE x_activity_inbox SET next_attempt_at=?,last_error=? WHERE event_id=? AND lease_until=? AND status='pending'").bind(nextDay(), error, row.event_id, lease).run();
  }

}
