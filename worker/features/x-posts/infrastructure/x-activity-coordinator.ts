import type { XCollectionProvider } from "@contracts/x-collection";
import type { SiteId } from "@contracts/site-definition";
import type { XActivitySitePort, XActivitySiteSnapshot, XActivityStatusDto, XApiGateway, XActivityControlFence, XActivitySiteControlPort, XActivityDeliveryRequest } from "@contracts/x-activity";
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
  controlSite(site:SiteId,fence:XActivityControlFence,disabledRevision:number|null):XActivitySiteControlPort;
  acceptDelivery(site:SiteId,request:XActivityDeliveryRequest):Promise<boolean>;
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
    const rows=await this.db.prepare(`SELECT t.site,t.handle,t.user_id,t.enabled AS target_enabled,t.status AS target_status,t.last_error AS target_error,s.status,s.subscription_id,s.expires_at,s.last_error
      FROM x_activity_targets t LEFT JOIN x_activity_subscriptions s ON s.user_id=t.user_id ORDER BY t.site,t.handle`).all<Target & {target_enabled:number;target_status:string;target_error:string|null;subscription_id:string|null;expires_at:number|null}>();
    const sites=controls.results.map(control=>{
      const targets=rows.results.filter(row=>row.site===control.site);
      return {site:control.site,enabled:!!control.enabled,targetCount:targets.filter(row=>row.target_enabled).length,
        activeCount:new Set(targets.filter(row=>row.subscription_id&&row.status!=="stopped"&&(row.expires_at??0)>Date.now()&&((control.enabled&&row.target_enabled)||!rows.results.some(peer=>peer.target_enabled&&peer.site!==control.site&&peer.user_id===row.user_id&&controls.results.some(other=>other.site===peer.site&&other.enabled&&!other.pause_reason&&!other.last_error)))).map(row=>row.subscription_id)).size,
        failedCount:targets.filter(row=>(row.target_enabled&&row.target_error)||row.last_error).length,pauseReason:control.pause_reason,resumeAt:control.resume_at,lastError:control.last_error};
    });
    const providerActiveCount=await this.db.prepare("SELECT COUNT(*) AS count FROM x_activity_subscriptions WHERE subscription_id IS NOT NULL AND status!='stopped' AND expires_at>?").bind(Date.now()).first<number>("count");
    const current=sites.find(row=>row.site===site);
    let snapshot:XActivitySiteSnapshot|null=null;
    let events:XActivityStatusDto["events"]=[];
    try{snapshot=await this.options.sites[site].snapshot();events=await this.options.sites[site].events();}
    catch{throw new XActivityError("x_activity_connection_unavailable",503);}
    const connected=await this.options.peerReady().catch(()=>false);
    const estimate=snapshot?.recovery.estimate;
    const siteRemainingMicros=estimate&&snapshot?Math.max(0,estimate.siteLimitMicros-snapshot.budget.used-snapshot.budget.reserved):0;
    const recoveryBudget=estimate&&snapshot?.budget.day===budget.day&&budget.seeded?{...estimate,day:budget.day,
      sharedRemainingMicros:budget.remaining,siteRemainingMicros,availableMicros:Math.min(budget.remaining,siteRemainingMicros)}:undefined;
    const mode:XActivityStatusDto["mode"]=!connected||!budget.seeded||!snapshot?"unavailable":current?.pauseReason==="budget"?"budget_paused":current?.pauseReason==="site"?"site_paused":!current?.enabled?(current?.lastError||current?.failedCount?"partial":"user_paused"):current.lastError||current.failedCount||coordinatorError||events.some(event=>event.error)?"partial":current.activeCount!==current.targetCount?"registering":"normal";
    return {primarySource:snapshot?.primarySource??"x_api",hybridPolicy:snapshot?.hybridPolicy,configured:!!(connected&&this.options.bearerToken&&this.options.clientSecret),callbackUrl:this.callback,subscription:null,
      budget:{limitMicros:budget.limit,usedMicros:budget.used,reservedMicros:budget.reserved,strictDailyCap:false},events,site,mode,
      pauseReason:current?.pauseReason??null,resumeAt:current?.resumeAt??null,budgetDay:budget.day,budgetReady:budget.seeded,sites,
      providerActiveCount:Number(providerActiveCount??0),
      cachePurgePending:snapshot?.cachePurgePending??0,coordinatorError,
      subscriptions:rows.results.filter(row=>row.site===site&&(row.target_enabled||row.subscription_id||row.last_error)).map(row=>({userId:row.user_id,handle:row.handle,site:row.site,state:row.target_error?"error":row.status??row.target_status,
        subscriptionId:row.subscription_id,expiresAt:row.expires_at,error:row.target_error??row.last_error})),
      recovery:snapshot?{intervalHours:snapshot.recovery.intervalHours,lastSuccessAt:snapshot.recovery.lastSuccessAt,pendingSources:snapshot.recovery.pendingSources,budget:recoveryBudget}:undefined};
  }

  async initializeBudget(){
    if(!await this.options.peerReady())throw new XActivityError("x_activity_connection_unavailable",503);
    if(!await this.options.admitD1())throw new XActivityError("d1_budget_unavailable",503);
    const money=new D1SharedXBudget(this.db),budget=await money.ensureDay();
    if(!budget.seeded&&await this.db.prepare("SELECT ready FROM x_activity_coordinator WHERE id=1").first<number>("ready")===1)throw new XActivityError("shared_budget_unavailable",503);
    const snapshots=await Promise.all([this.options.sites.otw.snapshot(),this.options.sites.luvdia.snapshot()]);
    if(snapshots[0].site!=="otw"||snapshots[1].site!=="luvdia")throw new XActivityError("x_activity_site_identity_mismatch",503);
    return new D1SharedXBudget(this.db).initialize(snapshots.map(item=>item.budget));
  }

  private async owned(token:string){
    return !!await this.db.prepare("SELECT 1 FROM x_activity_coordinator WHERE id=1 AND lease_token=? AND lease_until>?").bind(token,Date.now()).first();
  }
  private async assertOwner(token:string){
    if(!await this.owned(token))throw new XActivityError("x_activity_lease_lost",409);
  }
  private async write(token:string,...statements:D1PreparedStatement[]){
    // D1 batches are transactions: a denied lease aborts all writes, including otherwise idempotent ones.
    await this.db.batch([
      this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM x_activity_coordinator WHERE id=1 AND lease_token=? AND lease_until>max(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))) THEN 1 ELSE json('x_activity_lease_lost') END").bind(token,Date.now()),
      ...statements,
    ]);
  }
  private async control<T>(action:(token:string,fence:XActivityControlFence)=>Promise<T>):Promise<T>{
    const now=Date.now(),lease=now+10*60_000,token=crypto.randomUUID();
    const claimed=await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=?,lease_token=?,control_revision=control_revision+1 WHERE id=1 AND lease_until<=? RETURNING control_revision").bind(lease,token,now).first<{control_revision:number}>();
    if(!claimed)throw new XActivityError("x_activity_control_busy",409);
    try{return await action(token,{token,revision:claimed.control_revision,expiresAt:lease});}finally{await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=0,lease_token=NULL WHERE id=1 AND lease_token=?").bind(token).run();}
  }

  private async siteControl(site:SiteId,fence:XActivityControlFence){
    const value=await this.db.prepare("SELECT value FROM settings WHERE key=?").bind(`x_activity_disabled_revision:${site}`).first<string>("value");
    const revision=value===null?null:Number(value);
    if(revision!==null&&(!Number.isSafeInteger(revision)||revision<0))throw new XActivityError("x_activity_disable_barrier_invalid",503);
    return this.options.controlSite(site,fence,revision);
  }
  private disableDispatch(site:SiteId,revision:number){
    const other=site==="otw"?"luvdia":"otw";
    return [
      this.db.prepare("INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
        .bind(`x_activity_disabled_revision:${site}`,String(revision),Date.now()),
      this.db.prepare(`UPDATE x_activity_dispatch SET ${site}_status='skipped_disabled',payload=CASE WHEN ${other}_status='pending' THEN payload ELSE NULL END WHERE ${site}_status='pending'`),
    ];
  }

  async setPrimarySource(site:SiteId,source:XCollectionProvider){
    if(!["fxembed","x_api"].includes(source))throw new XActivityError("invalid_x_collection_provider",400);
    if(source==="x_api"){
      await this.control(async(token,fence)=>{
        const siteControl=await this.siteControl(site,fence);
        await siteControl.setPrimarySource(source);
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason='hybrid_rollback',last_error=NULL,updated_at=? WHERE site=? AND enabled=0 AND pause_reason IN ('hybrid','hybrid_transition')").bind(Date.now(),site));
      });
      return this.status(site);
    }
    await this.initializeBudget();
    if(!(await this.options.sites[site].snapshot()).collectionEnabled)throw new XActivityError("x_collection_disabled");
    await this.control(async(token,fence)=>{
      const siteControl=await this.siteControl(site,fence);
      if((await this.options.sites[site].snapshot()).primarySource==="fxembed"){
        await this.assertOwner(token);
        await siteControl.setPrimarySource(source);
        const applied=await this.options.sites[site].snapshot();
        await this.assertOwner(token);
        if(applied.site!==site||applied.primarySource!==source||applied.hybridPolicy!=="rss_v1")throw new XActivityError("x_activity_policy_readback_failed",503);
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason=CASE WHEN enabled=0 AND pause_reason='hybrid_transition' THEN 'hybrid' ELSE pause_reason END,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site));
        return;
      }
      await this.write(token,this.db.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason='hybrid_transition',resume_at=NULL,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site),...this.disableDispatch(site,fence.revision));
      try{
      await siteControl.setWebhookDisabled(true);
      await this.syncSite(site,token);
      const needed=(await this.db.prepare(`SELECT DISTINCT t.user_id FROM x_activity_targets t JOIN x_activity_sites s ON s.site=t.site
        WHERE t.site<>? AND t.enabled=1 AND s.enabled=1 AND s.pause_reason IS NULL AND s.last_error IS NULL AND t.user_id IS NOT NULL`).bind(site).all<{user_id:string}>()).results.map(row=>row.user_id);
      const inventory=await this.subscriptions();
      const owned=(await this.db.prepare("SELECT * FROM x_activity_subscriptions").all<Owned>()).results.filter(row=>!needed.includes(row.user_id));
      for(const row of owned)await this.removeOwned(row,inventory,token);
      const remaining=await this.subscriptions();
      if(owned.some(row=>remaining.some(remote=>remote.tag===row.tag||Boolean(row.subscription_id&&remote.subscription_id===row.subscription_id))))throw new XActivityError("x_activity_stop_readback_failed",502);
      await this.assertOwner(token);
      await siteControl.setPrimarySource(source);
      const applied=await this.options.sites[site].snapshot();
      if(applied.site!==site||applied.primarySource!==source||applied.hybridPolicy!=="rss_v1")throw new XActivityError("x_activity_policy_readback_failed",503);
      await this.write(token,this.db.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason='hybrid',last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site));
    }catch(error){
      await this.write(token,this.db.prepare("UPDATE x_activity_sites SET last_error=?,updated_at=? WHERE site=?").bind(message(error),Date.now(),site));
      throw error;
      }
    });
    return this.status(site);
  }

  async start(site:SiteId){
    await this.control(async(token,fence)=>{
      const siteControl=await this.siteControl(site,fence);
      const snapshot=await this.options.sites[site].snapshot();
      const pause=await this.db.prepare("SELECT pause_reason FROM x_activity_sites WHERE site=?").bind(site).first<string>("pause_reason");
      if(pause==="hybrid_transition")throw new XActivityError("x_activity_hybrid_disabled",409);
      if(!this.options.clientSecret||!this.options.bearerToken)throw new XActivityError("x_activity_connection_unavailable",503);
      if(!snapshot.collectionEnabled)throw new XActivityError("x_collection_disabled");
      await this.initializeBudget();
      await siteControl.setRecoveryInterval();
      await siteControl.setWebhookDisabled(false);
      await this.write(token,this.db.prepare("UPDATE x_activity_sites SET enabled=1,pause_reason=NULL,resume_at=NULL,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site));
    });
    await this.reconcile(true);
    return this.status(site);
  }

  async stop(site:SiteId){
    await this.control(async(token,fence)=>{
      const siteControl=await this.siteControl(site,fence);
      await this.write(token,this.db.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason=CASE WHEN pause_reason IN ('hybrid','hybrid_transition','hybrid_rollback') THEN pause_reason ELSE 'user' END,resume_at=NULL,last_error=NULL,updated_at=? WHERE site=?").bind(Date.now(),site),...this.disableDispatch(site,fence.revision));
      try{await siteControl.setWebhookDisabled(true);}
      catch(error){
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET last_error=?,updated_at=? WHERE site=?").bind(message(error),Date.now(),site));
        throw error;
      }
    });
    await this.reconcile(await this.options.admitD1());
    return this.status(site);
  }

  private async syncSite(site:SiteId,token:string){
    try{
      const snapshot=await this.options.sites[site].snapshot();
      if(snapshot.site!==site)throw new Error("x_activity_site_identity_mismatch");
      const now=Date.now();
      await this.write(token,
        this.db.prepare("UPDATE x_activity_targets SET enabled=0,updated_at=? WHERE site=?").bind(now,site),
        ...snapshot.targets.map(target=>this.db.prepare(`INSERT INTO x_activity_targets(site,handle,user_id,enabled,status,updated_at) VALUES(?,?,?,1,'pending',?)
          ON CONFLICT(site,handle) DO UPDATE SET user_id=excluded.user_id,enabled=1,
          last_error=CASE WHEN excluded.user_id IS NOT NULL THEN NULL ELSE x_activity_targets.last_error END,updated_at=excluded.updated_at`)
          .bind(site,target.handle,target.userId,now)),
        this.db.prepare(`UPDATE x_activity_sites SET synced_at=?,last_error=CASE WHEN pause_reason='hybrid_transition' OR enabled=0 THEN last_error ELSE NULL END,enabled=CASE WHEN ?=0 THEN 0 ELSE enabled END,
          pause_reason=CASE WHEN ?=0 AND COALESCE(pause_reason,'') NOT IN ('user','hybrid','hybrid_transition','hybrid_rollback') THEN 'site' ELSE pause_reason END,updated_at=? WHERE site=?`)
          .bind(now,snapshot.collectionEnabled?1:0,snapshot.collectionEnabled?1:0,now,site),
      );
    }catch(error){await this.write(token,this.db.prepare("UPDATE x_activity_sites SET last_error=?,updated_at=? WHERE site=?").bind(message(error),Date.now(),site));}
  }

  private async ensureHook(token:string){
    const state=await this.db.prepare("SELECT webhook_id,webhook_url FROM x_activity_coordinator WHERE id=1").first<{webhook_id:string|null;webhook_url:string|null}>();
    const hooks=await this.hooks();
    let hook=hooks.find(item=>item.id===state?.webhook_id&&item.url===this.callback);
    if(!hook&&state?.webhook_url===this.callback)hook=hooks.find(item=>item.url===this.callback);
    if(!hook){
      await this.write(token,this.db.prepare("UPDATE x_activity_coordinator SET webhook_url=? WHERE id=1").bind(this.callback));
      hook=(await this.provider<{data:{id:string;url:string;valid:boolean}}>("/webhooks","POST",{url:this.callback})).data;
    }
    if(!hook?.id||hook.url!==this.callback||!hook.valid)throw new XActivityError("x_activity_webhook_invalid",502);
    await this.write(token,this.db.prepare("UPDATE x_activity_coordinator SET webhook_id=?,last_error=NULL WHERE id=1").bind(hook.id));
    return hook.id;
  }

  private async removeOwned(row:Owned,inventory:Subscription[],token:string){
    const remote=inventory.find(item=>item.subscription_id===row.subscription_id);
    if(remote&&!ownership(remote,row,row.webhook_id??""))throw new Error("x_activity_ownership_mismatch");
    // A lost create response is recovered only from its persisted random tag and owned webhook.
    const recovering=!row.subscription_id?inventory.find(item=>item.tag===row.tag&&item.webhook_id===row.webhook_id&&item.event_type==="post.create"&&item.filter?.user_id===row.user_id):undefined;
    const id=remote?.subscription_id??recovering?.subscription_id;
    if(recovering)await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET subscription_id=?,expires_at=?,status='stopping',updated_at=? WHERE user_id=?")
      .bind(recovering.subscription_id,Number.isFinite(Date.parse(recovering.expires_at??""))?Date.parse(recovering.expires_at!):null,Date.now(),row.user_id));
    await this.assertOwner(token);
    if(id)await this.provider(`/activity/subscriptions/${encodeURIComponent(id)}`,"DELETE");
    if((await this.subscriptions()).some(item=>item.subscription_id===id||item.tag===row.tag))throw new Error("x_activity_stop_readback_failed");
    await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='stopped',subscription_id=NULL,expires_at=NULL,last_error=NULL,updated_at=? WHERE user_id=?").bind(Date.now(),row.user_id));
  }

  private async removeUnusedHook(token:string){
    for(const site of ["otw","luvdia"] as const)if((await this.options.sites[site].snapshot()).primarySource==="fxembed")return;
    if(await this.db.prepare("SELECT 1 FROM x_activity_sites WHERE pause_reason IN ('hybrid','hybrid_transition','hybrid_rollback') LIMIT 1").first())return;
    const state=await this.db.prepare("SELECT webhook_id,webhook_url FROM x_activity_coordinator WHERE id=1").first<{webhook_id:string|null;webhook_url:string|null}>();
    if(!state?.webhook_id&&state?.webhook_url!==this.callback)return;
    const hook=(await this.hooks()).find(item=>(item.id===state.webhook_id||!state.webhook_id)&&item.url===this.callback);
    if(hook&&!(await this.subscriptions()).some(item=>item.webhook_id===hook.id)){
      await this.assertOwner(token);
      await this.provider(`/webhooks/${encodeURIComponent(hook.id)}`,"DELETE");
      if((await this.hooks()).some(item=>item.id===hook.id))throw new Error("x_activity_webhook_delete_readback_failed");
    }else if(hook)return;
    await this.write(token,this.db.prepare("UPDATE x_activity_coordinator SET webhook_id=NULL,webhook_url=NULL WHERE id=1"));
  }

  async reconcile(canProcess=true){
    const now=Date.now(),lease=now+10*60_000,token=crypto.randomUUID();
    const claimed=await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=?,lease_token=? WHERE id=1 AND lease_until<=? RETURNING ready").bind(lease,token,now).first<{ready:number}>();
    if(!claimed)return;
    try{
      const budget=await new D1SharedXBudget(this.db).ensureDay();
      if(!claimed.ready)return;
      if(!canProcess||budget.remaining<30_000){
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),now));
      }else{
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason=NULL,resume_at=NULL,updated_at=? WHERE enabled=1 AND pause_reason='budget'").bind(now));
        await this.syncSite("otw",token);await this.syncSite("luvdia",token);
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
            await this.write(token,this.db.prepare("UPDATE x_activity_targets SET user_id=?,status='pending',last_error=NULL,updated_at=? WHERE site=? AND handle=?").bind(user.id,Date.now(),target.site,target.handle));
          }catch(error){await this.write(token,this.db.prepare("UPDATE x_activity_targets SET status='error',last_error=?,updated_at=? WHERE site=? AND handle=?").bind(message(error),Date.now(),target.site,target.handle));}
        }
      }
      let users=[...new Set(targets.flatMap(item=>item.user_id?[item.user_id]:[]))];
      if((await new D1SharedXBudget(this.db).read()).remaining<30_000){
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),Date.now()));
        users=[];
      }
      const inventory=await this.subscriptions();
      const owned=(await this.db.prepare("SELECT * FROM x_activity_subscriptions").all<Owned>()).results;
      for(const row of owned.filter(item=>!users.includes(item.user_id)&&(item.subscription_id||item.status!=="stopped"||inventory.some(remote=>remote.tag===item.tag))))try{await this.removeOwned(row,inventory,token);}catch(error){await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='error',last_error=?,updated_at=? WHERE user_id=?").bind(message(error),Date.now(),row.user_id));}
      if(canProcess&&users.length){
        const hook=await this.ensureHook(token);
        for(const userId of users){
          try{
            if((await new D1SharedXBudget(this.db).read()).remaining<30_000)break;
            await this.write(token,this.db.prepare("INSERT OR IGNORE INTO x_activity_subscriptions(user_id,tag,status,updated_at) VALUES(?,?,'pending',?)").bind(userId,`otw:xaa:${crypto.randomUUID()}`,Date.now()));
            const row=(await this.db.prepare("SELECT * FROM x_activity_subscriptions WHERE user_id=?").bind(userId).first<Owned>())!;
            const matching=inventory.filter(item=>item.event_type==="post.create"&&item.filter?.user_id===userId);
            if(matching.some(item=>!ownership(item,row,hook)&&!(row.status==="starting"&&item.tag===row.tag&&item.webhook_id===hook)))throw new Error("x_activity_subscription_owned_elsewhere");
            const current=matching.find(item=>ownership(item,row,hook));
            if(current&&Date.parse(current.expires_at??"")>Date.now()+40*60_000){
              await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='active',last_error=NULL,expires_at=?,updated_at=? WHERE user_id=?").bind(Date.parse(current.expires_at!),Date.now(),userId));continue;
            }
            await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='starting',webhook_id=?,last_error=NULL,updated_at=? WHERE user_id=?").bind(hook,Date.now(),userId));
            const expires=new Date(Date.now()+60*60_000).toISOString();
            const response=await this.provider<{data:{subscription:Subscription}}>("/activity/subscriptions","POST",{event_type:"post.create",filter:{user_id:userId},tag:row.tag,webhook_id:hook,expires_at:expires});
            const id=response.data?.subscription?.subscription_id;if(!id)throw new Error("x_activity_subscription_invalid");
            await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET subscription_id=?,expires_at=? WHERE user_id=?").bind(id,Date.parse(expires),userId));
            const readback=(await this.subscriptions()).find(item=>item.subscription_id===id);
            if(!readback||!ownership(readback,{...row,subscription_id:id},hook)||!readback.expires_at||!Number.isFinite(Date.parse(readback.expires_at))||Math.abs(Date.parse(readback.expires_at)-Date.parse(expires))>60_000)throw new Error("x_activity_readback_failed");
            await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='active',expires_at=?,last_error=NULL,updated_at=? WHERE user_id=?").bind(Date.parse(readback.expires_at),Date.now(),userId));
          }catch(error){await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status=CASE WHEN status='starting' THEN 'starting' ELSE 'error' END,last_error=?,updated_at=? WHERE user_id=?").bind(message(error),Date.now(),userId));}
        }
      }
      if((await new D1SharedXBudget(this.db).read()).remaining<30_000){
        await this.write(token,this.db.prepare("UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')").bind(nextDay(),Date.now()));
        const latest=await this.subscriptions();
        for(const row of (await this.db.prepare("SELECT * FROM x_activity_subscriptions").all<Owned>()).results){
          try{await this.removeOwned(row,latest,token);}catch(error){await this.write(token,this.db.prepare("UPDATE x_activity_subscriptions SET status='error',last_error=? WHERE user_id=?").bind(message(error),row.user_id));}
        }
        users=[];
      }
      if(!users.length)await this.removeUnusedHook(token);
      if(canProcess)await this.recoverDispatch(token);
      await this.write(token,this.db.prepare("UPDATE x_activity_coordinator SET last_error=NULL,updated_at=? WHERE id=1 AND lease_until=?").bind(Date.now(),lease));
    }catch(error){if(await this.owned(token))await this.write(token,this.db.prepare("UPDATE x_activity_coordinator SET last_error=?,updated_at=? WHERE id=1").bind(message(error),Date.now()));}
    finally{await this.db.prepare("UPDATE x_activity_coordinator SET lease_until=0,lease_token=NULL WHERE id=1 AND lease_token=?").bind(token).run();}
  }

  async accept(body:unknown){
    const event=parseXActivityEvent(body);if(!event)return false;
    const owned=await this.db.prepare("SELECT user_id FROM x_activity_subscriptions WHERE user_id=? AND tag=? AND webhook_id IS NOT NULL").bind(event.userId,event.tag).first();
    if(!owned)return false;
    const budget=await new D1SharedXBudget(this.db).ensureDay();if(!budget.seeded)throw new XActivityError("shared_budget_unavailable",503);
    const needed=(site:SiteId)=>`EXISTS(SELECT 1 FROM x_activity_targets t JOIN x_activity_sites s ON s.site=t.site
      WHERE t.user_id=? AND t.site='${site}' AND t.enabled=1 AND s.enabled=1 AND s.pause_reason IS NULL AND s.last_error IS NULL)`;
    const fresh="EXISTS(SELECT 1 FROM x_activity_dispatch WHERE event_id=? AND charged=0)";
    await this.db.batch([
      this.db.prepare(`INSERT OR IGNORE INTO x_activity_dispatch(event_id,post_id,user_id,payload,received_at,otw_status,luvdia_status)
        SELECT ?,?,?,CASE WHEN ${needed("otw")} OR ${needed("luvdia")} THEN json_object('event',json(?),'admittedRevision',(SELECT control_revision FROM x_activity_coordinator WHERE id=1)) ELSE NULL END,?,
          CASE WHEN ${needed("otw")} THEN 'pending' ELSE 'not_target' END,CASE WHEN ${needed("luvdia")} THEN 'pending' ELSE 'not_target' END`)
        .bind(event.eventId,event.post.id,event.userId,event.userId,event.userId,JSON.stringify(body),Date.now(),event.userId,event.userId),
      this.db.prepare(`UPDATE x_shared_budgets SET used=used+5000,updated_at=? WHERE day=? AND ${fresh}`).bind(Date.now(),budget.day,event.eventId),
      this.db.prepare(`UPDATE x_activity_sites SET pause_reason='budget',resume_at=?,updated_at=? WHERE enabled=1 AND (pause_reason IS NULL OR pause_reason='budget')
        AND EXISTS(SELECT 1 FROM x_shared_budgets WHERE day=? AND used+reserved+30000>limit_value)`).bind(nextDay(),Date.now(),budget.day),
      this.db.prepare("UPDATE x_activity_dispatch SET charged=1 WHERE event_id=? AND charged=0").bind(event.eventId),
    ]);
    if(await this.db.prepare("SELECT 1 FROM x_activity_dispatch WHERE event_id=? AND (otw_status='pending' OR luvdia_status='pending')").bind(event.eventId).first())await this.options.dispatch(event.eventId);
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
          const payload:unknown=row.payload?JSON.parse(row.payload):null;
          const envelope=payload&&typeof payload==="object"&&!("data" in payload)&&"event" in payload&&"admittedRevision" in payload?payload as {event:unknown;admittedRevision:number|null}:null;
          const accepted=payload?await this.options.acceptDelivery(site,{body:envelope?envelope.event:payload,admittedRevision:envelope?envelope.admittedRevision:null}):false;
          await this.db.prepare(`UPDATE x_activity_dispatch SET ${site}_status=? WHERE event_id=? AND lease_until=? AND ${site}_status='pending'`).bind(accepted?"complete":"skipped",eventId,lease).run();
        }catch(error){await this.db.prepare("UPDATE x_activity_dispatch SET last_error=?,next_attempt_at=? WHERE event_id=? AND lease_until=?").bind(message(error),Date.now()+60_000,eventId,lease).run();}
      }
      await this.db.prepare("UPDATE x_activity_dispatch SET payload=NULL,last_error=NULL WHERE event_id=? AND lease_until=? AND otw_status!='pending' AND luvdia_status!='pending'").bind(eventId,lease).run();
    }finally{await this.db.prepare("UPDATE x_activity_dispatch SET lease_until=0 WHERE event_id=? AND lease_until=?").bind(eventId,lease).run();}
  }
  private async recoverDispatch(token:string){
    const pending=await this.db.prepare("SELECT event_id FROM x_activity_dispatch WHERE (otw_status='pending' OR luvdia_status='pending') AND lease_until<=? AND next_attempt_at<=? ORDER BY next_attempt_at LIMIT 20").bind(Date.now(),Date.now()).all<{event_id:string}>();
    for(const row of pending.results){await this.assertOwner(token);await this.options.dispatch(row.event_id);}
    await this.write(token,
      this.db.prepare("DELETE FROM x_shared_requests WHERE id IN (SELECT id FROM x_shared_requests WHERE day<? AND status!='running' LIMIT 100)").bind(new Date(Date.now()-DAY).toISOString().slice(0,10)),
      this.db.prepare("DELETE FROM x_activity_dispatch WHERE event_id IN (SELECT event_id FROM x_activity_dispatch WHERE received_at<? ORDER BY received_at LIMIT 100)").bind(Date.now()-30*DAY),
    );
  }
}
