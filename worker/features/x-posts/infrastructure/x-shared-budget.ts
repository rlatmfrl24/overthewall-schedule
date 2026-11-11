import type { SiteId } from "@contracts/site-definition";
import { xRequestExpiryDaySql } from "../../../../db/x-request-retention";
import type { XApiGateway, XApiGatewayReceipt, XApiGatewayReceiptRequest, XApiGatewayRequest, XApiGatewayResult } from "@contracts/x-activity";
import { xActivityMediaReady } from "../domain/x-activity";
import { estimateXSharedApiReservationMicros, requestXApi, XApiError, type XApiUsageTracker, type XTweetLookupResponse } from "./x-api";
import { isXTimelineGapPayload } from "./x-timeline-gaps";

export interface XBudgetSnapshot { day: string; used: number; reserved: number }
export interface XSharedBudget extends XBudgetSnapshot { limit: number; remaining: number; seeded: boolean }
const DAY = 86_400_000;
const REQUEST_RECOVERY_MS = 10 * 60_000;
const failure = (error: string, status = 503): XApiGatewayResult => ({ ok: false, status, error, costMicros: 0, cached: false, dispatched: false });
const utcDay = () => new Date(Date.now()).toISOString().slice(0,10);

export const prepareXReceiptCleanup = (db: D1Database, timestamp = Date.now()) => db.prepare(`DELETE FROM x_shared_requests
  WHERE id IN (SELECT id FROM x_shared_requests WHERE status != 'running' AND ${xRequestExpiryDaySql} <= julianday(?)
    ORDER BY ${xRequestExpiryDaySql} LIMIT 100)`)
  .bind(new Date(timestamp).toISOString().slice(0, 10));

export { readSiteXBudget } from "./x-api";

const prepareSharedDay = (db: D1Database, day: string) => db.prepare(`INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at)
  SELECT ?,0,0,1000000,'{"rollover":true}',? WHERE EXISTS(SELECT 1 FROM x_activity_coordinator WHERE id=1 AND ready=1)
  AND EXISTS(SELECT 1 FROM x_shared_budgets WHERE day<?) ON CONFLICT(day) DO NOTHING`).bind(day,Date.now(),day);

export class D1SharedXBudget {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async initialize(snapshots: XBudgetSnapshot[]) {
    const day = utcDay();
    if (snapshots.length !== 2 || snapshots.some(item => item.day !== day || !Number.isSafeInteger(item.used) || item.used < 0 || !Number.isSafeInteger(item.reserved) || item.reserved < 0)) throw new Error("shared_budget_snapshot_invalid");
    const control = await this.db.prepare("SELECT bootstrap_extra_day,bootstrap_extra_micros FROM x_activity_coordinator WHERE id=1").first<{ bootstrap_extra_day: string; bootstrap_extra_micros: number }>();
    if (!control) throw new Error("shared_budget_storage_unavailable");
    const extra = control.bootstrap_extra_day === day ? control.bootstrap_extra_micros : 0;
    const used = snapshots.reduce((sum,item) => sum + item.used, extra);
    const reserved = snapshots.reduce((sum,item) => sum + item.reserved, 0);
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at) VALUES(?,?,?,1000000,?,?)")
        .bind(day,used,reserved,JSON.stringify({ snapshots, externalCanaryMicros: extra }),Date.now()),
      this.db.prepare("UPDATE x_activity_coordinator SET ready=1,updated_at=? WHERE id=1 AND EXISTS(SELECT 1 FROM x_shared_budgets WHERE day=?)").bind(Date.now(),day),
    ]);
    return this.read();
  }

  async ensureDay(): Promise<XSharedBudget> {
    const day = utcDay();
    const [, rows] = await this.db.batch([
      prepareSharedDay(this.db,day),
      this.db.prepare("SELECT used,reserved,limit_value FROM x_shared_budgets WHERE day=?").bind(day),
    ]);
    const row = rows.results[0] as { used: number; reserved: number; limit_value: number } | undefined;
    return { day, used: row?.used ?? 0, reserved: row?.reserved ?? 0, limit: row?.limit_value ?? 1_000_000,
      remaining: row ? Math.max(0,row.limit_value-row.used-row.reserved) : 0, seeded: !!row };
  }

  async read(): Promise<XSharedBudget> {
    const day = utcDay();
    const row = await this.db.prepare("SELECT used,reserved,limit_value FROM x_shared_budgets WHERE day=?").bind(day).first<{ used: number; reserved: number; limit_value: number }>();
    return { day, used: row?.used ?? 0, reserved: row?.reserved ?? 0, limit: row?.limit_value ?? 1_000_000,
      remaining: row ? Math.max(0,row.limit_value-row.used-row.reserved) : 0, seeded: !!row };
  }
}

export class D1SharedXApiGateway implements XApiGateway {
  private readonly db: D1Database;
  private readonly site: SiteId;
  private readonly token: string | undefined;
  private readonly admitD1: () => Promise<boolean>;
  private readonly bootstrapBudget: (() => Promise<void>) | undefined;
  constructor(options: { db: D1Database; site: SiteId; token?: string; admitD1: () => Promise<boolean>; bootstrapBudget?: () => Promise<void> }) {
    this.db = options.db; this.site = options.site; this.token = options.token; this.admitD1 = options.admitD1;
    this.bootstrapBudget = options.bootstrapBudget;
  }
  readBudget(){return new D1SharedXBudget(this.db).read();}

  async readReceipt(input: XApiGatewayReceiptRequest): Promise<XApiGatewayReceipt> {
    if (!input || typeof input.id !== "string" || !/^[A-Za-z0-9_:-]{1,256}$/.test(input.id) || typeof input.path !== "string" || input.path.length > 16_000 || !["user_lookup", "timeline", "tweet_lookup"].includes(input.operation)) throw new Error("invalid_x_gateway_receipt");
    const includeBody = input.includeTimelineBody === true && input.operation === "timeline" && input.id.startsWith(`${this.site}:gap:`);
    const includeReference = input.includeReferenceResult === true && input.id.startsWith(`${this.site}:quote:`) &&
      (input.operation === "tweet_lookup" && input.path.startsWith("/tweets?ids=") || input.operation === "user_lookup" && input.path.startsWith("/users?ids="));
    const row = await this.db.prepare(`SELECT day,status,updated_at,CASE WHEN json_valid(result) THEN json_extract(result,'$.ok') END ok,
      CASE WHEN ? AND status='complete' AND json_valid(result) AND NOT EXISTS (
        SELECT 1 FROM json_each(post_ids) ids JOIN x_activity_cache_redactions hidden ON hidden.post_id=ids.value
      ) THEN CASE WHEN ? THEN result ELSE json_quote(json_extract(result,'$.body')) END END AS body
      FROM x_shared_requests WHERE id=? AND site=? AND operation=? AND path=?`)
      .bind(includeBody || includeReference ? 1 : 0, includeReference ? 1 : 0, input.id, this.site, input.operation, input.path).first<{ day: string; status: string; updated_at: number; ok: number | null; body: string | null }>();
    // Expire only the local recovery claim; uncertain provider charges stay reserved in the ledger.
    const referenceResult = row?.body && includeReference ? JSON.parse(row.body) as XApiGatewayResult
      : row && includeReference && ["running", "redacting"].includes(row.status) && Date.now() - row.updated_at >= REQUEST_RECOVERY_MS
        ? failure("x_gateway_quote_claim_expired") : undefined;
    return row ? { found: true, day: row.day, status: row.status, ok: row.ok === 1 ? true : row.ok === 0 ? false : null,
      ...(referenceResult ? { referenceResult }
        : row.body && row.ok === 1 ? { timelineBody: JSON.parse(row.body) as unknown } : {}) } : { found: false };
  }

  async readReceipts(inputs: XApiGatewayReceiptRequest[]): Promise<XApiGatewayReceipt[]> {
    if (!Array.isArray(inputs) || inputs.length > 100 || inputs.some(input => !input || input.includeTimelineBody || input.includeReferenceResult ||
      input.operation !== "timeline" || typeof input.id !== "string" || !/^(otw|luvdia):gap:[a-f0-9]{64}$/.test(input.id) ||
      typeof input.path !== "string" || input.path.length > 16_000 || !/^\/users\/[1-9]\d{0,24}\/tweets\?/.test(input.path))) {
      throw new Error("invalid_x_gateway_receipt_batch");
    }
    const { results } = await this.db.prepare(`SELECT request.day,request.status,
      CASE WHEN json_valid(request.result) AND NOT EXISTS(SELECT 1 FROM json_each(request.post_ids) ids
        JOIN x_activity_cache_redactions hidden ON hidden.post_id=ids.value) THEN json_extract(request.result,'$.ok') END AS ok
      FROM json_each(?) input LEFT JOIN x_shared_requests request
      ON request.id=json_extract(input.value,'$.id') AND request.path=json_extract(input.value,'$.path')
        AND request.site=? AND request.operation='timeline' ORDER BY input.key`)
      .bind(JSON.stringify(inputs), this.site).all<{ day: string | null; status: string; ok: number | null }>();
    return results.map(row => row.day ? { found: true, day: row.day, status: row.status, ok: row.ok === null ? null : row.ok === 1 } : { found: false });
  }

  async redactPost(postId:string){
    if(!/^[1-9]\d{4,24}$/.test(postId))throw new Error("invalid_x_post_id");
    const timestamp=Date.now(),other=this.site==="otw"?"luvdia":"otw";
    await this.db.batch([
      this.db.prepare(`INSERT INTO x_activity_cache_redactions(post_id,created_at,completed_at,next_attempt_at) VALUES(?,?,?,0)
        ON CONFLICT(post_id) DO UPDATE SET completed_at=CASE WHEN ?='otw' THEN excluded.completed_at ELSE x_activity_cache_redactions.completed_at END`)
        .bind(postId,timestamp,timestamp,this.site),
      this.db.prepare(`UPDATE x_shared_requests SET result=NULL,status='redacted',updated_at=? WHERE day>=? AND status='complete'
        AND EXISTS(SELECT 1 FROM json_each(post_ids) WHERE value=?)`).bind(timestamp,new Date(timestamp-DAY).toISOString().slice(0,10),postId),
      // Timeline IDs arrive after dispatch, so a purge also fences active post results.
      this.db.prepare("UPDATE x_shared_requests SET status='redacting' WHERE status='running' AND operation!='user_lookup'"),
      this.db.prepare(`UPDATE x_activity_dispatch SET ${this.site}_status='skipped',payload=CASE WHEN ${other}_status='pending' THEN payload ELSE NULL END WHERE post_id=?`).bind(postId),
    ]);
  }

  async execute(input: XApiGatewayRequest): Promise<XApiGatewayResult> {
    if (!input || typeof input.id !== "string" || typeof input.path !== "string" || !/^[A-Za-z0-9_:-]{1,256}$/.test(input.id) || input.path.length > 16_000) return failure("invalid_x_gateway_request",400);
    const expected = /^\/users\/by\?/.test(input.path) || /^\/users\?/.test(input.path) ? "user_lookup"
      : /^\/tweets\?/.test(input.path) ? "tweet_lookup" : /^\/users\/[1-9]\d{0,24}\/tweets\?/.test(input.path) ? "timeline" : null;
    if (expected !== input.operation) return failure("invalid_x_gateway_request",400);
    const gapRequest = input.operation === "timeline" && input.id.startsWith(`${this.site}:gap:`);
    try {
      if (!this.token || !await this.admitD1()) return failure("shared_budget_unavailable");
      let budget = await new D1SharedXBudget(this.db).ensureDay();
      if (!budget.seeded && this.bootstrapBudget && await this.db.prepare("SELECT ready FROM x_activity_coordinator WHERE id=1").first<number>("ready") === 0) {
        await this.bootstrapBudget(); budget = await new D1SharedXBudget(this.db).ensureDay();
      }
      if (!budget.seeded) return failure("shared_budget_unavailable");
      const estimate = estimateXSharedApiReservationMicros(input.operation,input.path,input.estimatedCostMicros);
      if (!Number.isSafeInteger(estimate) || estimate <= 0 || estimate > 1_000_000) return failure("invalid_x_gateway_estimate",400);
      const day = budget.day;
      if (input.operation === "tweet_lookup" && input.id.startsWith("otw:xaa:") && input.id.endsWith(`:media:${day}`)) {
        const completed = await this.db.prepare(`SELECT result FROM x_shared_requests
          WHERE day=? AND operation=? AND path=? AND status='complete' AND json_extract(result,'$.ok')=1
          AND json_array_length(result,'$.body.data')=1 AND COALESCE(json_array_length(result,'$.body.errors'),0)=0
          AND EXISTS(SELECT 1 FROM x_activity_dispatch WHERE event_id=?
            AND post_id=json_extract(result,'$.body.data[0].id') AND user_id=json_extract(result,'$.body.data[0].author_id'))
          AND NOT EXISTS(SELECT 1 FROM x_shared_requests WHERE id=?) ORDER BY updated_at DESC LIMIT 1`)
          .bind(day,input.operation,input.path,input.id.slice(0,-`:media:${day}`.length),input.id).first<{ result: string }>();
        if (completed) {
          const result = JSON.parse(completed.result) as XApiGatewayResult;
          const body = result.body as XTweetLookupResponse, post = body.data![0]!;
          if (!post.attachments?.media_keys?.length || xActivityMediaReady({ post, includes: body.includes ?? {} })) {
            return { ...result, cached: true, costMicros: 0, dispatched: false };
          }
        }
      }
      const token = crypto.randomUUID();
      const timestamp = Date.now();
      const claimResults = await this.db.batch([
        this.db.prepare(`INSERT OR IGNORE INTO x_shared_requests(id,site,operation,path,status,claim_token,estimate,cost,day,created_at,updated_at)
          VALUES(?,?,?,?,'new',?,?,0,?,?,?)`).bind(input.id,this.site,input.operation,input.path,token,estimate,day,timestamp,timestamp),
        this.db.prepare(`UPDATE x_shared_budgets SET reserved=reserved+?,updated_at=? WHERE day=? AND used+reserved+MAX(?,30000)<=limit_value
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status='new')`).bind(estimate,timestamp,day,estimate,input.id,token),
        this.db.prepare(`UPDATE x_shared_requests SET status=CASE WHEN changes()=1 THEN 'running' ELSE 'blocked' END
          WHERE id=? AND claim_token=? AND status='new'`).bind(input.id,token),
        this.db.prepare("SELECT claim_token,status,path,operation,result,updated_at FROM x_shared_requests WHERE id=?").bind(input.id),
      ]);
      const claim = claimResults[3].results[0] as { claim_token: string; status: string; path: string; operation: string; result: string | null; updated_at: number } | undefined;
      if (!claim || claim.path !== input.path || claim.operation !== input.operation) return failure("x_gateway_identity_conflict",409);
      if (claim.claim_token !== token) {
        if (claim.result) return { ...JSON.parse(claim.result) as XApiGatewayResult, cached: true, costMicros: 0, dispatched: false };
        if(claim.status==="redacted")return failure("x_gateway_result_redacted",410);
        if (gapRequest &&
          (claim.status === "running" || claim.status === "redacting") && timestamp - claim.updated_at >= REQUEST_RECOVERY_MS) {
          return failure("x_gateway_result_unknown");
        }
        return failure(claim.status === "blocked" ? "budget_exceeded" : "x_gateway_request_in_progress", claim.status === "blocked" ? 429 : 503);
      }
      if (claim.status !== "running") return failure("budget_exceeded",429);
      const tracker: XApiUsageTracker = { apiCalls: 0, estimatedCostMicros: 0, reservedCostMicros: 0, uniqueResources: 0,
        previewDeferred: 0, authorCacheHits: 0, authorCacheMisses: 0 };
      let result: XApiGatewayResult;
      try {
        const body = await requestXApi<unknown>(input.path,this.token,{ operation: input.operation, estimatedCostMicros: estimate,
          usageTracker: tracker, backoffDb: this.db });
        if (gapRequest && !isXTimelineGapPayload(body)) throw new XApiError("Invalid or incomplete X timeline range", 502, { code: "invalid_x_gap_response" });
        result = { ok: true, status: 200, body, costMicros: tracker.estimatedCostMicros, cached: false, dispatched: tracker.apiCalls > 0 };
      } catch (error) {
        result = { ok: false, status: error instanceof XApiError ? error.status : 503,
          error: error instanceof XApiError ? error.code ?? "x_api_failed" : "x_api_failed",
          costMicros: tracker.estimatedCostMicros, cached: false, dispatched: tracker.apiCalls > 0 };
      }
      const postIds = input.operation !== "user_lookup" && result.ok
        ? ((result.body as { data?: Array<{ id?: string }> }).data ?? []).flatMap(post => typeof post.id === "string" ? [post.id] : []) : [];
      const settlementDay=utcDay();
      await this.db.batch([
        ...(settlementDay===day?[]:[prepareSharedDay(this.db,settlementDay)]),
        this.db.prepare(`UPDATE x_shared_budgets SET reserved=MAX(0,reserved-?),used=used+?,updated_at=? WHERE day=?
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status IN ('running','redacting'))`)
          .bind(estimate,settlementDay===day?result.costMicros:0,Date.now(),day,input.id,token),
        ...(settlementDay===day?[]:[this.db.prepare(`UPDATE x_shared_budgets SET used=used+?,updated_at=? WHERE day=?
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status IN ('running','redacting'))`)
          .bind(result.costMicros,Date.now(),settlementDay,input.id,token)]),
        this.db.prepare(`UPDATE x_shared_requests SET status=CASE WHEN status='redacting' OR EXISTS(SELECT 1 FROM x_activity_cache_redactions WHERE post_id IN (SELECT value FROM json_each(?))) THEN 'redacted' ELSE 'complete' END,
          cost=?,result=CASE WHEN status='redacting' OR EXISTS(SELECT 1 FROM x_activity_cache_redactions WHERE post_id IN (SELECT value FROM json_each(?))) THEN NULL ELSE ? END,post_ids=?,day=?,updated_at=? WHERE id=? AND claim_token=? AND status IN ('running','redacting')`)
          .bind(JSON.stringify(postIds),result.costMicros,JSON.stringify(postIds),JSON.stringify(result),JSON.stringify(postIds),settlementDay,Date.now(),input.id,token),
      ]);
      return result;
    } catch { return failure("shared_budget_unavailable"); }
  }
}
