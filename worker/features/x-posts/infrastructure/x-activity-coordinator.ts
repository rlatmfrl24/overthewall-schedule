import type { SiteId } from "@contracts/site-definition";
import type { XActivitySitePort, XActivitySiteSnapshot, XActivityStatusDto, XApiGateway } from "@contracts/x-activity";
import { XActivityError } from "../application/x-activity-service";
import { parseXActivityEvent } from "../domain/x-activity";
import { D1SharedXBudget } from "./x-shared-budget";

interface Subscription { subscription_id: string; event_type: string; filter: { user_id?: string }; tag?: string; webhook_id?: string; expires_at?: string }
interface Owned { user_id: string; tag: string; subscription_id: string | null; webhook_id: string | null; expires_at: number | null; status: string; last_error: string | null }
interface Control { site: SiteId; enabled: number; pause_reason: string | null; resume_at: number | null; last_error: string | null }
interface Target { site: SiteId; handle: string; user_id: string | null; status: string; last_error: string | null }
interface Options {
  db: D1Database; origin: string; bearerToken?: string; clientSecret?: string;
  gateway: XApiGateway; sites: Record<SiteId,XActivitySitePort>;
  peerReady(): Promise<boolean>; admitD1(): Promise<boolean>; dispatch(eventId: string): Promise<void>;
}
const DAY=86_400_000;
const message=(error:unknown)=>error instanceof Error?error.message.slice(0,250):"x_activity_failed";
const nextDay=()=> (Math.floor(Date.now()/DAY)+1)*DAY;
const ownership=(item:Subscription,row:Owned,hook:string)=>item.subscription_id===row.subscription_id && item.tag===row.tag && item.webhook_id===hook && item.event_type==="post.create" && item.filter?.user_id===row.user_id;

export class D1XActivityCoordinator {
  private readonly options:Options;
  constructor(options:Options){this.options=options;}
  private get db(){return this.options.db;}
  private get callback(){return `${this.options.origin}/api/x/activity/webhook`;}
  private async provider<T>(path:string,method="GET",body?:unknown):Promise<T>{
    if(!this.options.bearerToken)throw new XActivityError("x_activity_credentials_missing",503);
    const response=await fetch(`https://api.x.com/2${path}`,{method,signal:AbortSignal.timeout(5000),headers:{Authorization:`Bearer ${this.options.bearerToken}`,"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok)throw new XActivityError(`x_activity_provider_${response.status}`,502);
    return await response.json() as T;
  }
  private async inventory<T>(path:string){
    const result=await this.provider<{data?:T[];errors?:unknown[];meta?:{next_token?:string;result_count?:number}}>(path);
    const data=result.data===undefined&&result.meta?.result_count===0?[]:result.data;
    // shortcut: reject truncated app inventories; paginate before supporting 1000 subscriptions.
    if(!Array.isArray(data)||(result.errors!==undefined&&(!Array.isArray(result.errors)||result.errors.length>0))||result.meta?.next_token||data.length>=1000||
      (result.meta?.result_count!==undefined&&result.meta.result_count!==data.length))throw new XActivityError("x_activity_inventory_incomplete",502);
    return data;
  }
  private subscriptions(){return this.inventory<Subscription>("/activity/subscriptions");}
  private hooks(){return this.inventory<{id:string;url:string;valid:boolean}>("/webhooks");}

  async status(site:SiteId):Promise<XActivityStatusDto>{
    const budget=await new D1SharedXBudget(this.db).read();
    const coordinatorError=await this.db.prepare("SELECT last_error FROM x_activity_coordinator WHERE id=1").first<string>("last_error");
    const controls=await this.db.prepare("SELECT * FROM x_activity_sites ORDER BY site").all<Control>();
    const rows=await this.db.prepare(`SELECT t.site,t.handle,t.user_id,t.status AS target_status,t.last_error AS target_error,s.status,s.subscription_id,s.expires_at,s.last_error
      FROM x_activity_targets t LEFT JOIN x_activity_subscriptions s ON s.user_id=t.user_id WHERE t.enabled=1 ORDER BY t.site,t.handle`).all<Target & {target_status:string;target_error:string|null;subscription_id:string|null;expires_at:number|null}>();
    const sites=controls.results.map(control=>{
      const targets=rows.results.filter(row=>row.site===control.site);
      return {site:control.site,enabled:!!control.enabled,targetCount:targets.length,
        activeCount:targets.filter(row=>row.subscription_id&&row.status!=="stopped"&&(row.expires_at??0)>Date.now()).length,
        failedCount:targets.filter(row=>row.target_error||row.last_error).length,pauseReason:control.pause_reason,resumeAt:control.resume_at,lastError:control.last_error};
    });
    const current=sites.find(row=>row.site===site);
    let snapshot:XActivitySiteSnapshot|null=null;
    let events:XActivityStatusDto["events"]=[];
    try{snapshot=await this.options.sites[site].snapshot();events=await this.options.sites[site].events();}catch{/* Failed site remains explicitly unavailable. */}
    const connected=await this.options.peerReady().catch(()=>false);
    const mode:XActivityStatusDto["mode"]=!connected||!budget.seeded||!snapshot?"unavailable":current?.pauseReason==="budget"?"budget_paused":current?.pauseReason==="site"?"site_paused":!current?.enabled?"user_paused":current.lastError||current.failedCount||coordinatorError||events.some(event=>event.error)?"partial":current.activeCount!==current.targetCount?"registering":"normal";
    return {configured:!!(connected&&this.options.bearerToken&&this.options.clientSecret),callbackUrl:this.callback,subscription:null,
      budget:{limitMicros:budget.limit,usedMicros:budget.used,reservedMicros:budget.reserved,strictDailyCap:false},events,site,mode,
      pauseReason:current?.pauseReason??null,resumeAt:current?.resumeAt??null,budgetDay:budget.day,budgetReady:budget.seeded,sites,
      providerActiveCount:new Set(rows.results.filter(row=>row.subscription_id&&row.status!=="stopped"&&(row.expires_at??0)>Date.now()).map(row=>row.subscription_id)).size,
      cachePurgePending:snapshot?.cachePurgePending??0,coordinatorError,
      subscriptions:rows.results.map(row=>({userId:row.user_id,handle:row.handle,site:row.site,state:row.target_error?"error":row.status??row.target_status,
        subscriptionId:row.subscription_id,expiresAt:row.expires_at,error:row.target_error??row.last_error})),recovery:snapshot?.recovery};
  }

  async start(site:SiteId){
    if(!this.options.clientSecret||!this.options.bearerToken||!await this.options.peerReady())throw new XActivityError("x_activity_connection_unavailable",503);
    if(!await this.options.admitD1())throw new XActivityError("d1_budget_unavailable",503);
    const snapshots=await Promise.all([this.options.sites.otw.snapshot(),this.options.sites.luvdia.snapshot()]);
    const snapshot=snapshots.find(item=>item.site===site);
    if(!snapshot?.collectionEnabled)throw new XActivityError("x_collection_disabled");
    await new D1SharedXBudget(this.db).initialize(snapshots.map(item=>item.budget));
    await this.options.sites[site].setRecoveryInterval();
    await this.db.prepare("UPDATE x_activity_sites SET enabled=1,pause_reason=NULL,resume_at=NULL,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site).run();
    await this.reconcile(true);
    return this.status(site);
  }

  async stop(site:SiteId){
    await this.db.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason='user',resume_at=NULL,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site).run();
    await this.reconcile(await this.options.admitD1());
    return this.status(site);
  }

  private async syncSite(site:SiteId){
    try{
      const snapshot=await this.options.sites[site].snapshot();
      if(snapshot.site!==site)throw new Error("x_activity_site_identity_mismatch");
      const now=Date.now();
      await this.db.batch([
        this.db.prepare("UPDATE x_activity_targets SET enabled=0,updated_at=? WHERE site=?").bind(now,site),
        ...snapshot.targets.map(target=>this.db.prepare(`INSERT INTO x_activity_targets(site,handle,user_id,enabled,status,updated_at) VALUES(?,?,?,1,'pending',?)
          ON CONFLICT(site,handle) DO UPDATE SET user_id=excluded.user_id,enabled=1,
          last_error=CASE WHEN excluded.user_id IS NOT NULL THEN NULL ELSE x_activity_targets.last_error END,updated_at=excluded.updated_at`)
          .bind(site,target.handle,target.userId,now)),
        this.db.prepare(`UPDATE x_activity_sites SET synced_at=?,last_error=NULL,enabled=CASE WHEN ?=0 THEN 0 ELSE enabled END,
          pause_reason=CASE WHEN ?=0 AND COALESCE(pause_reason,'')!='user' THEN 'site' ELSE pause_reason END,updated_at=? WHERE site=?`)
          .bind(now,snapshot.collectionEnabled?1:0,snapshot.collectionEnabled?1:0,now,site),
      ]);
    }catch(error){await this.db.prepare("UPDATE x_activity_sites SET last_error=?,updated_at=? WHERE site=?").bind(message(error),Date.now(),site).run();}
  }

  private async ensureHook(){
    const state=await this.db.prepare("SELECT webhook_id,webhook_url FROM x_activity_coordinator WHERE id=1").first<{webhook_id:string|null;webhook_url:string|null}>();
    const hooks=await this.hooks();
    let hook=hooks.find(item=>item.id===state?.webhook_id&&item.url===this.callback);
    if(!hook&&state?.webhook_url===this.callback)hook=hooks.find(item=>item.url===this.callback);
    if(!hook){
      await this.db.prepare("UPDATE x_activity_coordinator SET webhook_url=? WHERE id=1").bind(this.callback).run();
      hook=(await this.provider<{data:{id:string;url:string;valid:boolean}}>("/webhooks","POST",{url:this.callback})).data;
    }
    if(!hook?.id||hook.url!==this.callback||!hook.valid)throw new XActivityError("x_activity_webhook_invalid",502);
    await this.db.prepare("UPDATE x_activity_coordinator SET webhook_id=?,last_error=NULL WHERE id=1").bind(hook.id).run();
    return hook.id;
  }

  private async removeOwned(row:Owned,inventory:Subscription[]){
    const remote=inventory.find(item=>item.subscription_id===row.subscription_id);
    if(remote&&!ownership(remote,row,row.webhook_id??""))throw new Error("x_activity_ownership_mismatch");
    // A lost create response is recovered only from its persisted random tag and owned webhook.
    const recovering=!row.subscription_id?inventory.find(item=>item.tag===row.tag&&item.webhook_id===row.webhook_id&&item.event_type==="post.create"&&item.filter?.user_id===row.user_id):undefined;
    const id=remote?.subscription_id??recovering?.subscription_id;
    if(id)await this.provider(`/activity/subscriptions/${encodeURIComponent(id)}`,"DELETE");
    if((await this.subscriptions()).some(item=>item.subscription_id===id||item.tag===row.tag))throw new Error("x_activity_stop_readback_failed");
    await this.db.prepare("UPDATE x_activity_subscriptions SET status='stopped',subscription_id=NULL,expires_at=NULL,last_error=NULL,updated_at=? WHERE user_id=?").bind(Date.now(),row.user_id).run();
  }

  private async removeUnusedHook(){
    const state=await this.db.prepare("SELECT webhook_id,webhook_url FROM x_activity_coordinator WHERE id=1").first<{webhook_id:string|null;webhook_url:string|null}>();
    if(!state?.webhook_id&&state?.webhook_url!==this.callback)return;
    const hook=(await this.hooks()).find(item=>(item.id===state.webhook_id||!state.webhook_id)&&item.url===this.callback);
    if(hook&&!(await this.subscriptions()).some(item=>item.webhook_id===hook.id)){
      await this.provider(`/webhooks/${encodeURIComponent(hook.id)}`,"DELETE");
      if((await this.hooks()).some(item=>item.id===hook.id))throw new Error("x_activity_webhook_delete_readback_failed");
    }else if(hook)return;
    await this.db.prepare("UPDATE x_activity_coordinator SET webhook_id=NULL,webhook_url=NULL WHERE id=1").run();
  }

  async reconcile(canProcess=true){
    const now=Date.now(),lease=now+10*60_000;
    const claimed=await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=? WHERE id=1 AND lease_until<=? RETURNING ready").bind(lease,now).first<{ready:number}>();
    if(!claimed)return;
    try{
      const budget=await new D1SharedXBudget(this.db).ensureDay();
      if(!claimed.ready)return;
      if(!canProcess||budget.remaining<30_000){
        await this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),now).run();
      }else{
        await this.db.prepare("UPDATE x_activity_sites SET pause_reason=NULL,resume_at=NULL,updated_at=? WHERE enabled=1 AND pause_reason='budget' AND resume_at<=?").bind(now,now).run();
        await this.syncSite("otw");await this.syncSite("luvdia");
      }
      const controls=await this.db.prepare("SELECT * FROM x_activity_sites").all<Control>();
      const activeSites=controls.results.filter(row=>row.enabled&&!row.pause_reason&&!row.last_error).map(row=>row.site);
      const targets=(await this.db.prepare("SELECT * FROM x_activity_targets WHERE enabled=1 AND site IN (SELECT value FROM json_each(?)) ORDER BY site,handle").bind(JSON.stringify(activeSites)).all<Target>()).results;
      if(canProcess&&budget.remaining>=30_000){
        for(const target of targets.filter(item=>!item.user_id)){
          try{
            const result=await this.options.gateway.execute({id:`resolve:${target.handle}:${budget.day}`,operation:"user_lookup",path:`/users/by?usernames=${encodeURIComponent(target.handle)}&user.fields=id,username,protected`});
            if(!result.ok)throw new Error(result.error??"x_activity_user_lookup_failed");
            const user=(result.body as {data?:Array<{id:string;username:string;protected?:boolean}>}).data?.find(item=>item.username.toLowerCase()===target.handle);
            if(!user||user.protected||!await this.options.sites[target.site].rememberUser(target.handle,user))throw new Error("x_activity_user_unavailable");
            target.user_id=user.id;
            await this.db.prepare("UPDATE x_activity_targets SET user_id=?,status='pending',last_error=NULL,updated_at=? WHERE site=? AND handle=?").bind(user.id,Date.now(),target.site,target.handle).run();
          }catch(error){await this.db.prepare("UPDATE x_activity_targets SET status='error',last_error=?,updated_at=? WHERE site=? AND handle=?").bind(message(error),Date.now(),target.site,target.handle).run();}
        }
      }
      let users=[...new Set(targets.flatMap(item=>item.user_id?[item.user_id]:[]))];
      if((await new D1SharedXBudget(this.db).read()).remaining<30_000){
        await this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),Date.now()).run();
        users=[];
      }
      const inventory=await this.subscriptions();
      const owned=(await this.db.prepare("SELECT * FROM x_activity_subscriptions").all<Owned>()).results;
      for(const row of owned.filter(item=>!users.includes(item.user_id)&&(item.subscription_id||item.status!=="stopped")))try{await this.removeOwned(row,inventory);}catch(error){await this.db.prepare("UPDATE x_activity_subscriptions SET status='error',last_error=?,updated_at=? WHERE user_id=?").bind(message(error),Date.now(),row.user_id).run();}
      if(canProcess&&users.length){
        const hook=await this.ensureHook();
        for(const userId of users){
          try{
            if((await new D1SharedXBudget(this.db).read()).remaining<30_000)break;
            await this.db.prepare("INSERT OR IGNORE INTO x_activity_subscriptions(user_id,tag,status,updated_at) VALUES(?,?,'pending',?)").bind(userId,`otw:xaa:${crypto.randomUUID()}`,Date.now()).run();
            const row=(await this.db.prepare("SELECT * FROM x_activity_subscriptions WHERE user_id=?").bind(userId).first<Owned>())!;
            const matching=inventory.filter(item=>item.event_type==="post.create"&&item.filter?.user_id===userId);
            if(matching.some(item=>!ownership(item,row,hook)&&!(row.status==="starting"&&item.tag===row.tag&&item.webhook_id===hook)))throw new Error("x_activity_subscription_owned_elsewhere");
            const current=matching.find(item=>ownership(item,row,hook));
            if(current&&Date.parse(current.expires_at??"")>Date.now()+40*60_000){
              await this.db.prepare("UPDATE x_activity_subscriptions SET status='active',last_error=NULL,expires_at=?,updated_at=? WHERE user_id=?").bind(Date.parse(current.expires_at!),Date.now(),userId).run();continue;
            }
            await this.db.prepare("UPDATE x_activity_subscriptions SET status='starting',webhook_id=?,last_error=NULL,updated_at=? WHERE user_id=?").bind(hook,Date.now(),userId).run();
            const expires=new Date(Date.now()+60*60_000).toISOString();
            const response=await this.provider<{data:{subscription:Subscription}}>("/activity/subscriptions","POST",{event_type:"post.create",filter:{user_id:userId},tag:row.tag,webhook_id:hook,expires_at:expires});
            const id=response.data?.subscription?.subscription_id;if(!id)throw new Error("x_activity_subscription_invalid");
            await this.db.prepare("UPDATE x_activity_subscriptions SET subscription_id=?,expires_at=? WHERE user_id=?").bind(id,Date.parse(expires),userId).run();
            const readback=(await this.subscriptions()).find(item=>item.subscription_id===id);
            if(!readback||!ownership(readback,{...row,subscription_id:id},hook)||!readback.expires_at||!Number.isFinite(Date.parse(readback.expires_at))||Math.abs(Date.parse(readback.expires_at)-Date.parse(expires))>60_000)throw new Error("x_activity_readback_failed");
            await this.db.prepare("UPDATE x_activity_subscriptions SET status='active',expires_at=?,last_error=NULL,updated_at=? WHERE user_id=?").bind(Date.parse(readback.expires_at),Date.now(),userId).run();
          }catch(error){await this.db.prepare("UPDATE x_activity_subscriptions SET status=CASE WHEN status='starting' THEN 'starting' ELSE 'error' END,last_error=?,updated_at=? WHERE user_id=?").bind(message(error),Date.now(),userId).run();}
        }
      }
      if((await new D1SharedXBudget(this.db).read()).remaining<30_000){
        await this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),Date.now()).run();
        const latest=await this.subscriptions();
        for(const row of (await this.db.prepare("SELECT * FROM x_activity_subscriptions WHERE subscription_id IS NOT NULL OR status!='stopped'").all<Owned>()).results){
          try{await this.removeOwned(row,latest);}catch(error){await this.db.prepare("UPDATE x_activity_subscriptions SET status='error',last_error=? WHERE user_id=?").bind(message(error),row.user_id).run();}
        }
        users=[];
      }
      if(!users.length)await this.removeUnusedHook();
      if(canProcess)await this.recoverDispatch();
      await this.db.prepare("UPDATE x_activity_coordinator SET last_error=NULL,updated_at=? WHERE id=1 AND lease_until=?").bind(Date.now(),lease).run();
    }catch(error){await this.db.prepare("UPDATE x_activity_coordinator SET last_error=?,updated_at=? WHERE id=1").bind(message(error),Date.now()).run();}
    finally{await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=0 WHERE id=1 AND lease_until=?").bind(lease).run();}
  }

  async accept(body:unknown){
    const event=parseXActivityEvent(body);if(!event)return false;
    const owned=await this.db.prepare("SELECT user_id FROM x_activity_subscriptions WHERE user_id=? AND tag=? AND webhook_id IS NOT NULL").bind(event.userId,event.tag).first();
    if(!owned)return false;
    const budget=await new D1SharedXBudget(this.db).ensureDay();if(!budget.seeded)throw new XActivityError("shared_budget_unavailable",503);
    const sites=(await this.db.prepare(`SELECT DISTINCT t.site FROM x_activity_targets t JOIN x_activity_sites s ON s.site=t.site
      WHERE t.user_id=? AND t.enabled=1 AND s.enabled=1 AND s.pause_reason IS NULL AND s.last_error IS NULL`).bind(event.userId).all<{site:SiteId}>()).results.map(row=>row.site);
    const fresh="EXISTS(SELECT 1 FROM x_activity_dispatch WHERE event_id=? AND charged=0)";
    await this.db.batch([
      this.db.prepare("INSERT OR IGNORE INTO x_activity_dispatch(event_id,post_id,user_id,payload,received_at,otw_status,luvdia_status) VALUES(?,?,?,?,?,?,?)")
        .bind(event.eventId,event.post.id,event.userId,sites.length?JSON.stringify(body):null,Date.now(),sites.includes("otw")?"pending":"not_target",sites.includes("luvdia")?"pending":"not_target"),
      this.db.prepare(`UPDATE x_shared_budgets SET used=used+5000,updated_at=? WHERE day=? AND ${fresh}`).bind(Date.now(),budget.day,event.eventId),
      this.db.prepare(`UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')
        AND EXISTS(SELECT 1 FROM x_shared_budgets WHERE day=? AND used+reserved+30000>limit_value)`).bind(nextDay(),Date.now(),budget.day),
      this.db.prepare("UPDATE x_activity_dispatch SET charged=1 WHERE event_id=? AND charged=0").bind(event.eventId),
    ]);
    if(sites.length)await this.options.dispatch(event.eventId);
    return true;
  }

  async deliver(eventId:string){
    const now=Date.now(),lease=now+5*60_000;
    const row=await this.db.prepare("UPDATE x_activity_dispatch SET lease_until=? WHERE event_id=? AND lease_until<=? AND next_attempt_at<=? AND (otw_status='pending' OR luvdia_status='pending') RETURNING *")
      .bind(lease,eventId,now,now).first<{payload:string|null;otw_status:string;luvdia_status:string}>();
    if(!row)return;
    try{
      for(const site of ["otw","luvdia"] as const){
        if(row[`${site}_status`]!=="pending")continue;
        try{
          const accepted=row.payload?await this.options.sites[site].accept(JSON.parse(row.payload)):false;
          await this.db.prepare(`UPDATE x_activity_dispatch SET ${site}_status=? WHERE event_id=? AND lease_until=? AND ${site}_status='pending'`).bind(accepted?"complete":"skipped",eventId,lease).run();
        }catch(error){await this.db.prepare("UPDATE x_activity_dispatch SET last_error=?,next_attempt_at=? WHERE event_id=? AND lease_until=?").bind(message(error),Date.now()+60_000,eventId,lease).run();}
      }
      await this.db.prepare("UPDATE x_activity_dispatch SET payload=NULL,last_error=NULL WHERE event_id=? AND lease_until=? AND otw_status!='pending' AND luvdia_status!='pending'").bind(eventId,lease).run();
    }finally{await this.db.prepare("UPDATE x_activity_dispatch SET lease_until=0 WHERE event_id=? AND lease_until=?").bind(eventId,lease).run();}
  }
  private async recoverDispatch(){
    const pending=await this.db.prepare("SELECT event_id FROM x_activity_dispatch WHERE (otw_status='pending' OR luvdia_status='pending') AND lease_until<=? AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 20").bind(Date.now(),Date.now()).all<{event_id:string}>();
    for(const row of pending.results)await this.options.dispatch(row.event_id);
    await this.db.prepare("DELETE FROM x_shared_requests WHERE id IN (SELECT id FROM x_shared_requests WHERE day<? AND status!='running' LIMIT 100)").bind(new Date(Date.now()-DAY).toISOString().slice(0,10)).run();
    await this.db.prepare("DELETE FROM x_activity_dispatch WHERE event_id IN (SELECT event_id FROM x_activity_dispatch WHERE received_at<? ORDER BY received_at LIMIT 100)").bind(Date.now()-30*DAY).run();
  }
}
