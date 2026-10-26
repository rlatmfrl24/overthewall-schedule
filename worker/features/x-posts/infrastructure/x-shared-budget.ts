import type { SiteId } from "@contracts/site-definition";
import type { XApiGateway, XApiGatewayRequest, XApiGatewayResult } from "@contracts/x-activity";
import { estimateXApiRequestCostMicros, requestXApi, XApiError, type XApiUsageTracker } from "./x-api";

export interface XBudgetSnapshot { day: string; used: number; reserved: number }
export interface XSharedBudget extends XBudgetSnapshot { limit: number; remaining: number; seeded: boolean }
const DAY = 86_400_000;
const failure = (error: string, status = 503): XApiGatewayResult => ({ ok: false, status, error, costMicros: 0, cached: false, dispatched: false });
const utcDay = () => new Date(Date.now()).toISOString().slice(0,10);

export async function readSiteXBudget(db: D1Database): Promise<XBudgetSnapshot> {
  const day = utcDay();
  const row = await db.prepare("SELECT used,reserved FROM scheduled_usage_daily WHERE day=? AND lane='all' AND resource='x_api_cost_micros'").bind(day).first<{ used: number; reserved: number }>();
  const start = Date.parse(`${day}T00:00:00Z`);
  const total = row ? row.used : await db.prepare("SELECT COALESCE(SUM(estimated_cost_micros),0) AS used FROM x_api_usage_events WHERE created_at>=? AND created_at<?").bind(start,start+DAY).first<number>("used");
  return { day, used: Number(total ?? 0), reserved: Number(row?.reserved ?? 0) };
}

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
    await this.db.prepare(`INSERT INTO x_shared_budgets(day,used,reserved,limit_value,seed_detail,updated_at)
      SELECT ?,0,0,1000000,'{"rollover":true}',? WHERE EXISTS(SELECT 1 FROM x_activity_coordinator WHERE id=1 AND ready=1)
      AND EXISTS(SELECT 1 FROM x_shared_budgets WHERE day<?) ON CONFLICT(day) DO NOTHING`).bind(day,Date.now(),day).run();
    return this.read();
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
  constructor(options: { db: D1Database; site: SiteId; token?: string; admitD1: () => Promise<boolean> }) {
    this.db = options.db; this.site = options.site; this.token = options.token; this.admitD1 = options.admitD1;
  }
  readBudget(){return new D1SharedXBudget(this.db).read();}

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
    try {
      if (!this.token || !await this.admitD1()) return failure("shared_budget_unavailable");
      const budget = await new D1SharedXBudget(this.db).ensureDay();
      if (!budget.seeded) return failure("shared_budget_unavailable");
      const query = new URLSearchParams(input.path.split("?")[1]);
      const ids = query.get("ids")?.split(",").filter(Boolean).length ?? 0;
      const count = input.operation === "timeline" ? Number(query.get("max_results") ?? 25) : ids;
      const mediaReserve = query.get("expansions")?.split(",").includes("attachments.media_keys") ? count * 15_000 : 0;
      const estimate = Math.max(estimateXApiRequestCostMicros(input.operation,input.path) + mediaReserve, input.estimatedCostMicros ?? 0);
      if (!Number.isSafeInteger(estimate) || estimate <= 0 || estimate > 1_000_000) return failure("invalid_x_gateway_estimate",400);
      const day = budget.day;
      const token = crypto.randomUUID();
      const timestamp = Date.now();
      await this.db.batch([
        this.db.prepare(`INSERT OR IGNORE INTO x_shared_requests(id,site,operation,path,status,claim_token,estimate,cost,day,created_at,updated_at)
          VALUES(?,?,?,?,'new',?,?,0,?,?,?)`).bind(input.id,this.site,input.operation,input.path,token,estimate,day,timestamp,timestamp),
        this.db.prepare(`UPDATE x_shared_budgets SET reserved=reserved+?,updated_at=? WHERE day=? AND used+reserved+MAX(?,30000)<=limit_value
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status='new')`).bind(estimate,timestamp,day,estimate,input.id,token),
        this.db.prepare(`UPDATE x_shared_requests SET status=CASE WHEN changes()=1 THEN 'running' ELSE 'blocked' END
          WHERE id=? AND claim_token=? AND status='new'`).bind(input.id,token),
      ]);
      const claim = await this.db.prepare("SELECT claim_token,status,path,operation,result FROM x_shared_requests WHERE id=?").bind(input.id).first<{ claim_token: string; status: string; path: string; operation: string; result: string | null }>();
      if (!claim || claim.path !== input.path || claim.operation !== input.operation) return failure("x_gateway_identity_conflict",409);
      if (claim.claim_token !== token) {
        if (claim.result) return { ...JSON.parse(claim.result) as XApiGatewayResult, cached: true, costMicros: 0, dispatched: false };
        if(claim.status==="redacted")return failure("x_gateway_result_redacted",410);
        return failure(claim.status === "blocked" ? "budget_exceeded" : "x_gateway_request_in_progress", claim.status === "blocked" ? 429 : 503);
      }
      if (claim.status !== "running") return failure("budget_exceeded",429);
      const tracker: XApiUsageTracker = { apiCalls: 0, estimatedCostMicros: 0, reservedCostMicros: 0, uniqueResources: 0,
        previewDeferred: 0, authorCacheHits: 0, authorCacheMisses: 0 };
      let result: XApiGatewayResult;
      try {
        const body = await requestXApi<unknown>(input.path,this.token,{ operation: input.operation, estimatedCostMicros: estimate,
          usageTracker: tracker, backoffDb: this.db });
        result = { ok: true, status: 200, body, costMicros: tracker.estimatedCostMicros, cached: false, dispatched: tracker.apiCalls > 0 };
      } catch (error) {
        result = { ok: false, status: error instanceof XApiError ? error.status : 503,
          error: error instanceof XApiError ? error.code ?? "x_api_failed" : "x_api_failed",
          costMicros: tracker.estimatedCostMicros, cached: false, dispatched: tracker.apiCalls > 0 };
      }
      const postIds = input.operation !== "user_lookup" && result.ok
        ? ((result.body as { data?: Array<{ id?: string }> }).data ?? []).flatMap(post => typeof post.id === "string" ? [post.id] : []) : [];
      const redacted=postIds.length?await this.db.prepare("SELECT post_id FROM x_activity_cache_redactions WHERE post_id IN (SELECT value FROM json_each(?)) LIMIT 1").bind(JSON.stringify(postIds)).first():null;
      const settlementDay=utcDay();
      if(settlementDay!==day)await new D1SharedXBudget(this.db).ensureDay();
      await this.db.batch([
        this.db.prepare(`UPDATE x_shared_budgets SET reserved=MAX(0,reserved-?),used=used+?,updated_at=? WHERE day=?
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status IN ('running','redacting'))`)
          .bind(estimate,settlementDay===day?result.costMicros:0,Date.now(),day,input.id,token),
        ...(settlementDay===day?[]:[this.db.prepare(`UPDATE x_shared_budgets SET used=used+?,updated_at=? WHERE day=?
          AND EXISTS(SELECT 1 FROM x_shared_requests WHERE id=? AND claim_token=? AND status IN ('running','redacting'))`)
          .bind(result.costMicros,Date.now(),settlementDay,input.id,token)]),
        this.db.prepare(`UPDATE x_shared_requests SET status=CASE WHEN status='redacting' OR ?=1 THEN 'redacted' ELSE 'complete' END,
          cost=?,result=CASE WHEN status='redacting' OR ?=1 THEN NULL ELSE ? END,post_ids=?,day=?,updated_at=? WHERE id=? AND claim_token=? AND status IN ('running','redacting')`)
          .bind(redacted?1:0,result.costMicros,redacted?1:0,JSON.stringify(result),JSON.stringify(postIds),settlementDay,Date.now(),input.id,token),
      ]);
      return result;
    } catch { return failure("shared_budget_unavailable"); }
  }
}
