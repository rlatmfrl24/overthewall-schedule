import {applyD1Migrations,env,type D1Migration} from "cloudflare:test";
import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {D1XActivityCoordinator} from "./x-activity-coordinator";
import {D1XActivitySite} from "./x-activity-site";
import {D1SharedXBudget,D1SharedXApiGateway,readSiteXBudget} from "./x-shared-budget";
import {parseXActivityEvent} from "../domain/x-activity";
import {redactStoredXPosts,clearXServiceCachesForTests} from "./x-api";
import {runXCollectionForHandles} from "./x-collection";

const bindings=env as unknown as {otw_db:D1Database;transition_target_db:D1Database;X_REFERENCE_MIGRATIONS:D1Migration[]};
const db=bindings.otw_db,peer=bindings.transition_target_db;
const userId="1607408138545950721",peerUserId="1607408138545950722",postId="2114516278392348991",baseId="2114000000000000000";
const queued:Array<{site:string;id:string}>=[];
let remote:Array<Record<string,unknown>>=[],hooks:Array<{id:string;url:string;valid:boolean}>=[];
let failUser:string|null=null;
let timelinePage=0;
const json=(value:unknown)=>Response.json(value);
const gateway=(site:"otw"|"luvdia")=>new D1SharedXApiGateway({db,site,token:"test",admitD1:async()=>true});
const local=(site:"otw"|"luvdia")=>new D1XActivitySite({db:site==="otw"?db:peer,siteId:site,gateway:gateway(site),publicationOpen:()=>true,dispatch:async id=>{queued.push({site,id});}});
const coordinator=(overrides:Partial<ConstructorParameters<typeof D1XActivityCoordinator>[0]>={})=>new D1XActivityCoordinator({db,origin:"https://otw.example",bearerToken:"test",clientSecret:"secret",gateway:gateway("otw"),
  controlSite:(site,fence)=>local(site).withControlFence(fence),sites:{otw:local("otw"),luvdia:local("luvdia")},peerReady:async()=>true,admitD1:async()=>true,dispatch:async id=>{queued.push({site:"dispatch",id});},...overrides});
const body=(tag:string,extra:Record<string,unknown>={},id=postId)=>({data:{event_uuid:id,event_type:"post.create",filter:{user_id:userId},tag,
  payload:{id,author_id:userId,text:"short",created_at:new Date(Date.now()).toISOString(),...extra},includes:{media:[{media_key:"photo",type:"photo",url:"https://pbs.twimg.com/media/photo.jpg"}]}}});
const photo=(tag:string)=>body(tag,{attachments:{media_keys:["photo"]},note_tweet:{text:"complete long note",entities:{urls:[]}}});
const tag=async()=>String(await db.prepare("SELECT tag FROM x_activity_subscriptions WHERE user_id=?").bind(userId).first("tag"));
const provider=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(String(input)),method=init?.method??"GET",value=init?.body?JSON.parse(String(init.body)):null;
  if(url.pathname==="/2/webhooks"&&method==="GET")return json(hooks.length?{data:hooks,meta:{result_count:hooks.length}}:{meta:{result_count:0}});
  if(url.pathname==="/2/webhooks"&&method==="POST"){hooks=[{id:"hook",url:value.url,valid:true}];return json({data:hooks[0]});}
  if(url.pathname==="/2/webhooks/hook"&&method==="DELETE"){hooks=[];return json({data:{deleted:true}});}
  if(url.pathname==="/2/activity/subscriptions"&&method==="GET")return json({data:remote});
  if(url.pathname==="/2/activity/subscriptions"&&method==="POST"){
    if(value.filter.user_id===failUser)return new Response(null,{status:500});
    const existing=remote.find(item=>(item.filter as {user_id:string}).user_id===value.filter.user_id);
    const item={...value,subscription_id:existing?.subscription_id??"sub-"+value.filter.user_id};
    remote=remote.filter(row=>row!==existing);remote.push(item);return json({data:{subscription:item}});
  }
  if(url.pathname.startsWith("/2/activity/subscriptions/")&&method==="DELETE"){remote=remote.filter(row=>row.subscription_id!==url.pathname.split("/").at(-1));return json({data:{deleted:true}});}
  if(url.pathname==="/2/users/by"){
    const handle=url.searchParams.get("usernames");return json({data:[{id:handle==="peer"?peerUserId:userId,username:handle,protected:false}]});
  }
  if(url.pathname==="/2/tweets")return json({data:[{id:postId,author_id:userId,attachments:{media_keys:["video"]}}],includes:{media:[{media_key:"video",type:"video",preview_image_url:"https://pbs.twimg.com/video_thumb/1.jpg"}]}});
  if(url.pathname==="/2/users/"+userId+"/tweets"){
    timelinePage++;
    return json({data:[{id:timelinePage===1?postId:"2114100000000000000",text:"REST recovery",created_at:new Date(Date.now()-60000).toISOString()}],...(timelinePage===1?{meta:{next_token:"page-two"}}:{})});
  }
  throw new Error("Unexpected external request "+method+" "+url.pathname);
};

beforeEach(async()=>{
  clearXServiceCachesForTests();
  remote=[];hooks=[];queued.length=0;failUser=null;timelinePage=0;
  for(const database of [db,peer]){
    await applyD1Migrations(database,bindings.X_REFERENCE_MIGRATIONS);
    await database.batch(["x_activity_inbox","x_activity_dispatch","x_activity_targets","x_activity_subscriptions","x_shared_requests","x_shared_budgets","x_activity_cache_redactions","x_post_references","x_post_facts","x_posts","x_post_sources","x_api_usage_events","x_api_usage_daily","x_api_resource_daily","x_api_cache","scheduled_usage_daily","members"].map(table=>database.prepare("DELETE FROM "+table)));
    await database.prepare("DELETE FROM settings WHERE key IN ('x_collection_primary_source','x_webhook_disabled','x_collection_hybrid_policy','x_collection_hybrid_activated_at','x_activity_control_fence')").run();
    await database.prepare("INSERT INTO settings(key,value,updated_at) VALUES('x_collection_enabled','true',0),('x_collection_daily_budget_cents','100',0),('x_cost_optimizer_enabled','false',0) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run();
    await database.prepare("UPDATE x_activity_sites SET enabled=0,pause_reason='user',resume_at=NULL,last_error=NULL").run();
    await database.prepare("UPDATE x_activity_coordinator SET ready=0,lease_until=0,webhook_id=NULL,webhook_url=NULL,bootstrap_extra_micros=0,last_error=NULL").run();
  }
  await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'member','OTW member','https://x.com/member')").run();
  await peer.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(1,'peer','LuvDia member','https://x.com/peer')").run();
  await db.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_seen_post_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at) VALUES('member',?,'member',?,0,0,1,1)").bind(userId,baseId).run();
  await peer.prepare("INSERT INTO x_post_sources(handle,user_id,username,last_checked_at,updated_at) VALUES('peer',?,'peer',0,0)").bind(peerUserId).run();
  await new D1SharedXBudget(db).initialize([await readSiteXBudget(db),await readSiteXBudget(peer)]);
  vi.stubGlobal("fetch",vi.fn(provider));
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});

describe("XAA multi-site collection and common money boundary",()=>{
  it("switches to Fx only after owned remote subscriptions stop, preserving peer subscriptions, hook and history",async()=>{
    const control=coordinator();await control.start("otw");await control.start("luvdia");
    const pending=body(await tag(),{attachments:{media_keys:["missing"]}});
    const eventId=parseXActivityEvent(pending)!.eventId;
    await control.accept(pending);
    await control.deliver(eventId);
    const before=await db.prepare("SELECT COUNT(*) AS n FROM x_activity_inbox").first("n");
    const savedHooks=structuredClone(hooks);
    vi.mocked(fetch).mockClear();
    await db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('x_collection_interval_hours','2')").run();
    await control.setPrimarySource("otw","fxembed");
    expect((await local("otw").snapshot()).recovery.intervalHours).toBe(12);
    await control.reconcile(true);
    await local("otw").process(eventId);
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_primary_source'").first("value")).toBe("fxembed");
    expect((await control.status("otw")).sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,activeCount:0,pauseReason:"hybrid"});
    expect(remote.map(item=>(item.filter as {user_id:string}).user_id)).toEqual([peerUserId]);
    expect(hooks).toEqual(savedHooks);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM x_activity_inbox").first("n")).toBe(before);
    expect(await db.prepare("SELECT status,last_error FROM x_activity_inbox WHERE event_id=?").bind(eventId).first()).toEqual({status:"skipped",last_error:"webhook_hybrid_disabled"});
    expect(vi.mocked(fetch).mock.calls.some(([input,init])=>String(input).includes("/activity/subscriptions")&&init?.method==="POST")).toBe(false);
    expect(vi.mocked(fetch).mock.calls.some(([input])=>String(input).includes("/tweets"))).toBe(false);
  });
  it("leaves an explicit disabled failure when remote stop fails and never reports Fx as applied",async()=>{
    const control=coordinator();await control.start("otw");
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==="DELETE"?new Response(null,{status:500}):provider(input,init)));
    await expect(control.setPrimarySource("otw","fxembed")).rejects.toThrow();
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_primary_source'").first("value")).not.toBe("fxembed");
    expect(await db.prepare("SELECT enabled,last_error FROM x_activity_sites WHERE site='otw'").first()).toMatchObject({enabled:0,last_error:expect.stringContaining("500")});
    expect(remote).toHaveLength(1);
    await control.reconcile(true);
    expect((await control.status("otw")).sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,activeCount:1,lastError:expect.stringContaining("500")});
  });
  it("keeps Disabled through rollback and requires explicit webhook reactivation",async()=>{
    const control=coordinator();await control.start("otw");await control.setPrimarySource("otw","fxembed");
    const budget=await new D1SharedXBudget(db).read();
    await control.setPrimarySource("otw","x_api");
    expect(remote).toHaveLength(0);expect(hooks).toHaveLength(1);
    expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(0);
    await control.start("otw");expect(remote).toHaveLength(1);
    expect((await new D1SharedXBudget(db).read()).used).toBe(budget.used);
  });
  it("allows_manual_webhook_with_fx_primary and idempotent_policy_apply_preserves_explicit_enable",async()=>{
    const control=coordinator();await control.setPrimarySource("otw","fxembed");
    expect(await local("otw").snapshot()).toMatchObject({hybridPolicy:"rss_v1",recovery:{intervalHours:12}});
    await control.start("otw");
    expect(remote).toHaveLength(1);
    const activation=await db.prepare("SELECT value FROM settings WHERE key='x_collection_hybrid_activated_at'").first("value");
    await control.setPrimarySource("otw","fxembed");
    expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(1);
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_webhook_disabled'").first("value")).toBe("false");
    expect(await db.prepare("SELECT value FROM settings WHERE key='x_collection_hybrid_activated_at'").first("value")).toBe(activation);
    const event=photo(await tag()),id=parseXActivityEvent(event)!.eventId;
    await control.accept(event);await control.deliver(id);await local("otw").process(id);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(id).first("status")).toBe("complete");
    const saved=structuredClone(hooks);await control.stop("otw");expect(hooks).toEqual(saved);
  });
  it("disabled_never_resubscribes_after_utc_reset",async()=>{
    const control=coordinator();await control.setPrimarySource("otw","fxembed");
    const saved=structuredClone(hooks);vi.mocked(fetch).mockClear();
    const now=Date.now();vi.spyOn(Date,"now").mockReturnValue(now+86400000);
    await control.reconcile(true);
    expect(remote).toHaveLength(0);expect(hooks).toEqual(saved);
    expect(vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(0);
  });
  it("old_peer_cannot_report_policy_applied",async()=>{
    const old=local("luvdia");vi.spyOn(old,"setPrimarySource").mockResolvedValue();
    const control=new D1XActivityCoordinator({db,origin:"https://otw.example",bearerToken:"test",clientSecret:"secret",gateway:gateway("otw"),controlSite:(site,fence)=>({...local(site).withControlFence(fence),setPrimarySource:()=>old.setPrimarySource("fxembed"),setWebhookDisabled:disabled=>local(site).withControlFence(fence).setWebhookDisabled(disabled),setRecoveryInterval:()=>local(site).withControlFence(fence).setRecoveryInterval()}),sites:{otw:local("otw"),luvdia:old},peerReady:async()=>true,admitD1:async()=>true,dispatch:async()=>{}});
    await expect(control.setPrimarySource("luvdia","fxembed")).rejects.toThrow("x_activity_policy_readback_failed");
    expect(await db.prepare("SELECT pause_reason FROM x_activity_sites WHERE site='luvdia'").first("pause_reason")).toBe("hybrid_transition");
  });
  it.each([false,true])("stale_reconcile_cannot_override_disable and latest reconcile recovers a stopped NULL late create (delete fails=%s)",async(failDelete)=>{
    let rejectDelete=false;
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),paused=new Promise<void>(r=>{release=r;});
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(input)).pathname==="/2/activity/subscriptions"&&init?.method==="POST"){entered();await paused;}
      if(rejectDelete&&init?.method==="DELETE")return new Response(null,{status:500});
      return provider(input,init);
    }));
    const control=coordinator(),starting=control.start("otw");await started;
    await db.prepare("UPDATE x_activity_coordinator SET lease_until=0").run();
    await control.stop("otw");
    const stopped=await db.prepare("SELECT * FROM x_activity_subscriptions").first();
    release();await starting;
    expect(await db.prepare("SELECT * FROM x_activity_subscriptions").first()).toEqual(stopped);
    expect(remote).toHaveLength(1);
    rejectDelete=failDelete;
    await control.reconcile(true);
    if(failDelete){
      expect(remote).toHaveLength(1);
      expect((await control.status("otw")).sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,activeCount:1});
      rejectDelete=false;await control.reconcile(true);
    }
    expect(remote).toHaveLength(0);
    expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(0);
  });
  it("does not activate policy or delete a subscription whose ownership tag changed",async()=>{
    const control=coordinator();await control.start("otw");
    remote[0].tag="foreign-owner";const foreign=structuredClone(remote);vi.mocked(fetch).mockClear();
    await expect(control.setPrimarySource("otw","fxembed")).rejects.toThrow("x_activity_ownership_mismatch");
    expect(remote).toEqual(foreign);
    expect((await local("otw").snapshot()).hybridPolicy).not.toBe("rss_v1");
    expect(vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==="DELETE")).toHaveLength(0);
  });
  it("applies the policy to legacy Fx while preserving explicit Enabled and its endpoint",async()=>{
    await db.prepare("INSERT INTO settings(key,value) VALUES('x_collection_primary_source','fxembed')").run();
    const control=coordinator();await control.start("otw");const saved=structuredClone(remote);
    expect((await local("otw").snapshot()).recovery.intervalHours).toBe(24);
    await control.setPrimarySource("otw","fxembed");
    expect(await local("otw").snapshot()).toMatchObject({hybridPolicy:"rss_v1",recovery:{intervalHours:12}});
    expect(remote).toEqual(saved);
    expect(await db.prepare("SELECT enabled FROM x_activity_sites WHERE site='otw'").first("enabled")).toBe(1);
  });
  it("never replays an event accepted while Disabled after a later manual enable",async()=>{
    const control=coordinator();await control.setPrimarySource("otw","fxembed");
    const event=photo("unused"),id=parseXActivityEvent(event)!.eventId;
    expect(await local("otw").accept(event)).toBe(false);
    await control.start("otw");await local("otw").process(id);
    expect(await db.prepare("SELECT status,payload FROM x_activity_inbox WHERE event_id=?").bind(id).first()).toEqual({status:"skipped",payload:null});
    expect(await db.prepare("SELECT id FROM x_posts WHERE id=?").bind(postId).first()).toBeNull();
  });
  it("fences delayed site controls by durable revision, token and expiry across instances",async()=>{
    const old={revision:1,token:crypto.randomUUID(),expiresAt:Date.now()+60000};
    const newer={revision:2,token:crypto.randomUUID(),expiresAt:Date.now()+60000};
    await local("luvdia").withControlFence(old).setWebhookDisabled(false);
    await local("luvdia").withControlFence(newer).setWebhookDisabled(true);
    await expect(local("luvdia").withControlFence(old).setWebhookDisabled(false)).rejects.toThrow();
    await expect(local("luvdia").withControlFence({...newer,token:crypto.randomUUID()}).setPrimarySource("fxembed")).rejects.toThrow();
    await expect(local("luvdia").withControlFence({...newer,revision:3,expiresAt:Date.now()-1}).setWebhookDisabled(false)).rejects.toThrow();
    expect(await peer.prepare("SELECT value FROM settings WHERE key='x_webhook_disabled'").first("value")).toBe("true");
    expect((await local("luvdia").snapshot()).hybridPolicy).not.toBe("rss_v1");
  });
  it("denies a stale no-op state write before dispatching another remote create",async()=>{
    const control=coordinator();await control.start("otw");
    remote[0].expires_at=new Date(Date.now()+10000).toISOString();
    const before=await db.prepare("SELECT * FROM x_activity_subscriptions").first();
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(input)).pathname==="/2/webhooks"&&(init?.method??"GET")==="GET")await db.prepare("UPDATE x_activity_coordinator SET lease_token='replacement'").run();
      return provider(input,init);
    });vi.stubGlobal("fetch",calls);
    await control.reconcile(true);
    expect(calls.mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(0);
    expect(await db.prepare("SELECT * FROM x_activity_subscriptions").first()).toEqual(before);
    expect(await db.prepare("SELECT lease_token FROM x_activity_coordinator").first("lease_token")).toBe("replacement");
  });
  it.each(["site","coordinator"])("checks Disabled atomically at the %s event admission boundary",async(boundary)=>{
    const control=coordinator();await control.start("otw");
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(r=>{entered=r;}),paused=new Promise<void>(r=>{release=r;});
    const delayed=new Proxy(db,{get(target,key){
      if(key==="batch")return async(statements:D1PreparedStatement[])=>{entered();await paused;return target.batch(statements);};
      const value=Reflect.get(target,key,target);return typeof value==="function"?value.bind(target):value;
    }});
    const receiver=boundary==="site"?new D1XActivitySite({db:delayed,siteId:"otw",gateway:gateway("otw"),publicationOpen:()=>true,dispatch:async()=>{}}):
      new D1XActivityCoordinator({db:delayed,origin:"https://otw.example",bearerToken:"test",clientSecret:"secret",gateway:gateway("otw"),controlSite:(site,fence)=>local(site).withControlFence(fence),sites:{otw:local("otw"),luvdia:local("luvdia")},peerReady:async()=>true,admitD1:async()=>true,dispatch:async()=>{}});
    const event=photo(await tag()),id=parseXActivityEvent(event)!.eventId;
    const pending=receiver.accept(event);await started;await control.stop("otw");release();await pending;
    await control.start("otw");await control.deliver(id);await local("otw").process(id);
    expect(await db.prepare("SELECT id FROM x_posts WHERE id=?").bind(postId).first()).toBeNull();
    if(boundary==="site")expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(id).first("status")).toBe("skipped");
    else expect(await db.prepare("SELECT otw_status FROM x_activity_dispatch WHERE event_id=?").bind(id).first("otw_status")).toBe("not_target");
  });
  it("finishes a policy retry whose site write succeeded before the RPC response was lost",async()=>{
    let lost=true;
    const control=coordinator({controlSite:(site,fence)=>{
      const bound=local(site).withControlFence(fence);
      return {setWebhookDisabled:value=>bound.setWebhookDisabled(value),setRecoveryInterval:()=>bound.setRecoveryInterval(),setPrimarySource:async source=>{
        await bound.setPrimarySource(source);if(lost){lost=false;throw new Error("response_lost");}
      }};
    }});
    await expect(control.setPrimarySource("luvdia","fxembed")).rejects.toThrow("response_lost");
    await control.setPrimarySource("luvdia","fxembed");
    expect((await control.status("luvdia")).sites?.find(site=>site.site==="luvdia")).toMatchObject({enabled:false,pauseReason:"hybrid",lastError:null});
    await control.start("luvdia");expect(remote).toHaveLength(1);
  });
  it("retains a failed site-disable error until a successful administrator retry",async()=>{
    const control=coordinator({controlSite:(site,fence)=>{
      const bound=local(site).withControlFence(fence);
      return {setRecoveryInterval:()=>bound.setRecoveryInterval(),setPrimarySource:source=>bound.setPrimarySource(source),setWebhookDisabled:async disabled=>{
        if(disabled)throw new Error("site_disable_unavailable");await bound.setWebhookDisabled(disabled);
      }};
    }});
    await control.start("otw");await expect(control.stop("otw")).rejects.toThrow("site_disable_unavailable");
    await control.reconcile(true);
    expect((await control.status("otw")).sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,lastError:"site_disable_unavailable"});
    await coordinator().stop("otw");
    expect((await control.status("otw")).sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,lastError:null});
  });
  it("reports a known lingering remote subscription when collection removes its active target",async()=>{
    const control=coordinator();await control.start("otw");
    await db.prepare("UPDATE settings SET value='false' WHERE key='x_collection_enabled'").run();
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>init?.method==="DELETE"?new Response(null,{status:500}):provider(input,init)));
    await control.reconcile(true);
    const status=await control.status("otw");
    expect(status.sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,targetCount:0,activeCount:1,failedCount:1});
    expect(status.providerActiveCount).toBe(1);expect(remote).toHaveLength(1);
  });
  it("initializes REST budget independently of starting a webhook",async()=>{
    await db.prepare("DELETE FROM x_shared_budgets").run();await db.prepare("UPDATE x_activity_coordinator SET ready=0").run();
    await coordinator().initializeBudget();
    expect((await new D1SharedXBudget(db).read()).seeded).toBe(true);
    const application={...env,SITE_ID:"otw",otw_db:db,X_BEARER_TOKEN:"test",X_API_GATEWAY:gateway("otw")} as Env;
    await runXCollectionForHandles(application,["member"],"manual");
    const completed=await runXCollectionForHandles(application,["member"],"manual");
    expect(completed.status).toBe("success");expect(completed.pendingSources).toBe(0);
    expect(remote).toHaveLength(0);expect(hooks).toHaveLength(0);
    expect(await db.prepare("SELECT SUM(enabled) AS count FROM x_activity_sites").first("count")).toBe(0);
  });
  it("does not reconstruct a previously initialized missing money ledger automatically",async()=>{
    await db.prepare("DELETE FROM x_shared_budgets").run();
    const bootstrap=vi.fn(async()=>{await new D1SharedXBudget(db).initialize([await readSiteXBudget(db),await readSiteXBudget(peer)]);});
    const guarded=new D1SharedXApiGateway({db,site:"otw",token:"test",admitD1:async()=>true,bootstrapBudget:bootstrap});
    const result=await guarded.execute({id:"lost-ledger",operation:"user_lookup",path:"/users/by?usernames=member"});
    expect(result.ok).toBe(false);expect(bootstrap).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
    await expect(coordinator().setPrimarySource("otw","fxembed")).rejects.toMatchObject({code:"shared_budget_unavailable"});
    expect(await db.prepare("SELECT COUNT(*) AS n FROM x_shared_budgets").first("n")).toBe(0);
  });
  it("preserves a common subscription needed by the other active site",async()=>{
    await peer.prepare("UPDATE members SET url_twitter='https://x.com/member'").run();
    await peer.prepare("UPDATE x_post_sources SET handle='member',user_id=?,username='member'").bind(userId).run();
    const control=coordinator();await control.start("otw");await control.start("luvdia");
    expect(remote).toHaveLength(1);
    await control.setPrimarySource("otw","fxembed");
    expect(remote).toHaveLength(1);
    const status=await control.status("otw");
    expect(status.sites?.find(site=>site.site==="otw")).toMatchObject({enabled:false,activeCount:0});
    expect(status.sites?.find(site=>site.site==="luvdia")).toMatchObject({enabled:true,activeCount:1});
  });
  it("settles a hydration already in flight when switching to Disabled without starting another",async()=>{
    const control=coordinator();await control.start("otw");
    const pending=body(await tag(),{attachments:{media_keys:["missing"]}}),eventId=parseXActivityEvent(pending)!.eventId;
    await control.accept(pending);await control.deliver(eventId);
    let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;}),response=new Promise<void>(resolve=>{release=resolve;});
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(input)).pathname==="/2/tweets"){entered();await response;}
      return provider(input,init);
    });
    vi.stubGlobal("fetch",calls);
    const processing=local("otw").process(eventId);await started;
    expect((await new D1SharedXBudget(db).read()).reserved).toBeGreaterThan(0);
    await control.setPrimarySource("otw","fxembed");release();await processing;
    const request=await db.prepare("SELECT status,cost FROM x_shared_requests WHERE operation='tweet_lookup'").first<{status:string;cost:number}>();
    expect(request?.status).toBe("complete");expect(request?.cost).toBeGreaterThan(0);
    expect((await new D1SharedXBudget(db).read()).reserved).toBe(0);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(eventId).first("status")).toBe("skipped");
    await control.start("otw");await local("otw").process(eventId);
    expect(await db.prepare("SELECT count(*) n FROM x_shared_requests WHERE operation='tweet_lookup'").first("n")).toBe(1);
    expect(await db.prepare("SELECT cost FROM x_shared_requests WHERE operation='tweet_lookup'").first("cost")).toBe(request?.cost);
    expect(calls.mock.calls.filter(([input])=>new URL(String(input)).pathname==="/2/tweets")).toHaveLength(1);
  });
  it("treats explicit Disabled as authoritative for late dispatch across primary sources",async()=>{
    const control=coordinator();await control.start("otw");const pending=body(await tag(),{attachments:{media_keys:["missing"]}}),eventId=parseXActivityEvent(pending)!.eventId;
    await control.setPrimarySource("otw","fxembed");
    await control.setPrimarySource("otw","x_api");
    vi.mocked(fetch).mockClear();
    await local("otw").accept(pending);await local("otw").process(eventId);
    expect(await db.prepare("SELECT status,last_error FROM x_activity_inbox WHERE event_id=?").bind(eventId).first()).toEqual({status:"skipped",last_error:"webhook_hybrid_disabled"});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("settles each background timeline before reserving the next account",async()=>{
    await db.prepare("UPDATE x_shared_budgets SET used=250000").run();
    await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(2,'second','Second','https://x.com/second')").run();
    await db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at,collection_started_at,initialization_completed_at) VALUES('second',?,0,0,1,1)").bind(peerUserId).run();
    for(const [handle,id] of [["member",userId],["second",peerUserId]])await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES(?,'user',?,?,?)")
      .bind(`x:user:v1:${handle}`,JSON.stringify({user:{id,username:handle}}),Date.now(),Date.now()+86400000).run();
    let active=0,peak=0;
    const calls=vi.fn(async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;return json({data:[]});});
    vi.stubGlobal("fetch",calls);
    const result=await runXCollectionForHandles({...env,SITE_ID:"otw",X_BEARER_TOKEN:"test",X_API_GATEWAY:gateway("otw")} as never,["member","second"],"manual");
    expect(result).toMatchObject({success:true,refreshedHandles:2});
    expect(calls).toHaveBeenCalledTimes(2);expect(peak).toBe(1);
    expect(await new D1SharedXBudget(db).read()).toMatchObject({used:250000,reserved:0});
  });

  it.each(["shared","site"])("fits an existing cursor to the available %s budget without changing its range",async limit=>{
    await db.prepare("UPDATE x_shared_budgets SET used=?").bind(limit==="shared"?850000:0).run();
    if(limit==="site")await db.prepare("UPDATE settings SET value='10' WHERE key='x_collection_daily_budget_cents'").run();
    await db.prepare("UPDATE x_post_sources SET sync_pagination_token='existing-page',sync_base_post_id=?,sync_newest_post_id=? WHERE handle='member'").bind(baseId,postId).run();
    await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:user:v1:member','user',?,?,?)")
      .bind(JSON.stringify({user:{id:userId,username:"member"}}),Date.now(),Date.now()+86400000).run();
    const calls=vi.fn(async(input:RequestInfo|URL)=>{
      const url=new URL(String(input));expect(url.searchParams.get("max_results")).toBe(limit==="shared"?"6":"10");
      expect(url.searchParams.get("pagination_token")).toBe("existing-page");expect(url.searchParams.get("since_id")).toBe(baseId);
      return json({data:[]});
    });vi.stubGlobal("fetch",calls);
    const result=await runXCollectionForHandles({...env,SITE_ID:"otw",X_BEARER_TOKEN:"test",X_API_GATEWAY:gateway("otw")} as never,["member"],"manual");
    expect(result).toMatchObject({success:true,pendingSources:0});expect(calls).toHaveBeenCalledTimes(1);
    expect(await db.prepare("SELECT last_seen_post_id,sync_pagination_token FROM x_post_sources WHERE handle='member'").first()).toMatchObject({last_seen_post_id:postId,sync_pagination_token:null});
    expect(await new D1SharedXBudget(db).read()).toMatchObject({used:limit==="shared"?850000:0,reserved:0});
  });

  it("returns only the current site's member subscriptions while keeping common totals",async()=>{
    await coordinator().start("otw");await coordinator().start("luvdia");
    for(const [site,handle] of [["otw","member"],["luvdia","peer"]] as const){
      const status=await coordinator().status(site);
      expect(status.subscriptions?.map(row=>({site:row.site,handle:row.handle}))).toEqual([{site,handle}]);
      expect(status.providerActiveCount).toBe(2);
      expect(status.sites).toHaveLength(2);
    }
  });
  it.each(["snapshot","events"] as const)("does not return an empty normal receipt list when the site %s read fails",async(method)=>{
    vi.spyOn(D1XActivitySite.prototype,method).mockRejectedValue(new Error("site read failed"));
    await expect(coordinator().status("otw")).rejects.toMatchObject({code:"x_activity_connection_unavailable",status:503});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("previews the media headroom actually reserved by the shared gateway",async()=>{
    await db.prepare("UPDATE settings SET value='true' WHERE key='x_cost_optimizer_enabled'").run();
    const preview=(await coordinator().status("otw")).recovery?.budget;
    let release!:(response:Response)=>void;
    const calls=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal("fetch",calls);
    const pending=gateway("otw").execute({id:"preview-reservation",operation:"timeline",path:`/users/${userId}/tweets?max_results=5&expansions=attachments.media_keys`,estimatedCostMicros:50000});
    await vi.waitFor(()=>expect(calls).toHaveBeenCalledTimes(1));
    const reserved=await db.prepare("SELECT estimate FROM x_shared_requests WHERE id='preview-reservation'").first<number>("estimate");
    release(json({data:[]}));await pending;
    expect(reserved).toBe(125000);
    expect(preview?.perPageMicros).toBe(reserved);
    expect(preview?.firstPagesMicros).toBe(135000);
    expect(preview?.siteFirstPagesMicros).toBe(60000);
  });
  it("includes the real continuation page for pending cursors alongside new optimized scans",async()=>{
    await db.prepare("UPDATE settings SET value='true' WHERE key='x_cost_optimizer_enabled'").run();
    await db.prepare("UPDATE x_post_sources SET sync_pagination_token='next-page'").run();
    await db.prepare("INSERT INTO members(uid,code,name,url_twitter) VALUES(2,'second','Second','https://x.com/second')").run();
    await db.prepare("INSERT INTO x_post_sources(handle,user_id,last_checked_at,updated_at) VALUES('second',?,0,0)").bind(peerUserId).run();
    expect((await coordinator().status("otw")).recovery).toMatchObject({pendingSources:1,budget:{targetCount:2,pageSize:5,continuationPageSize:25,identityMicros:20000,firstPagesMicros:770000,siteFirstPagesMicros:320000}});
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["cold","expired"])("includes identity refresh headroom for a known source with a %s user cache",async(cache)=>{
    await db.prepare("DELETE FROM x_api_cache WHERE key='x:user:v1:member'").run();
    if(cache==="expired")await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:user:v1:member','user',?,?,?)")
      .bind(JSON.stringify({user:{id:userId,username:"member"}}),Date.now()-86400000,Date.now()-1).run();
    expect((await local("otw").snapshot()).targets[0]?.userId).toBe(userId);
    expect((await coordinator().status("otw")).recovery?.budget).toMatchObject({identityMicros:10000,firstPagesMicros:635000,siteFirstPagesMicros:260000});
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true,false])("previews REST first-page reservations from the real policy without spending or writing (optimizer=%s)",async(optimized)=>{
    await db.prepare("UPDATE settings SET value=? WHERE key='x_cost_optimizer_enabled'").bind(String(optimized)).run();
    await db.prepare("UPDATE x_shared_budgets SET used=360000,reserved=20000").run();
    await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',600000,50000,1000000,0)").bind(new Date().toISOString().slice(0,10)).run();
    const before=await db.prepare("SELECT * FROM x_shared_budgets").all();
    const siteBefore=await db.prepare("SELECT * FROM scheduled_usage_daily").all();
    const result=await coordinator().status("otw");
    expect(result.recovery).toMatchObject({budget:{day:new Date().toISOString().slice(0,10),targetCount:1,pageSize:optimized?5:24,
      perPageMicros:optimized?125000:600000,firstPagesMicros:optimized?135000:610000,siteFirstPagesMicros:optimized?60000:250000,identityMicros:10000,
      siteLimitMicros:1000000,sharedRemainingMicros:620000,siteRemainingMicros:350000,availableMicros:350000}});
    expect((await db.prepare("SELECT * FROM x_shared_budgets").all()).results).toEqual(before.results);
    expect((await db.prepare("SELECT * FROM scheduled_usage_daily").all()).results).toEqual(siteBefore.results);
    expect(await db.prepare("SELECT id FROM x_shared_requests").first()).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("includes missing identity lookups and honors a lower site protection limit",async()=>{
    await db.prepare("UPDATE x_post_sources SET user_id=NULL").run();
    await db.prepare("UPDATE settings SET value='10' WHERE key='x_collection_daily_budget_cents'").run();
    await db.prepare("INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at) VALUES(?,'all','x_api_cost_micros',80000,10000,100000,0)").bind(new Date().toISOString().slice(0,10)).run();
    expect((await coordinator().status("otw")).recovery).toMatchObject({budget:{identityMicros:10000,firstPagesMicros:135000,siteFirstPagesMicros:60000,siteLimitMicros:100000,availableMicros:10000}});
    expect(fetch).not.toHaveBeenCalled();
  });
  it("leaves REST preview unavailable when the common ledger is not prepared",async()=>{
    await db.prepare("DELETE FROM x_shared_budgets").run();
    const result=await coordinator().status("otw");
    expect(result.budgetReady).toBe(false);
    expect(result.recovery?.budget).toBeUndefined();
  });
  it("does not present an old peer or a different UTC day as an available REST budget",async()=>{
    const snapshot=await local("otw").snapshot();
    vi.spyOn(D1XActivitySite.prototype,"snapshot").mockResolvedValue({...snapshot,recovery:{intervalHours:24,lastSuccessAt:null,pendingSources:0}});
    expect((await coordinator().status("otw")).recovery?.budget).toBeUndefined();
    vi.mocked(D1XActivitySite.prototype.snapshot).mockResolvedValue({...snapshot,budget:{...snapshot.budget,day:"2000-01-01"}});
    expect((await coordinator().status("otw")).recovery?.budget).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([{}, {meta:{result_count:1}}, {data:null,meta:{result_count:0}}, {meta:{result_count:0,next_token:"more"}}, {data:[],meta:{result_count:1}}, {meta:{result_count:0},errors:[{detail:"unavailable"}]}])("keeps supplier mutations blocked for an unconfirmed inventory %j",async(response)=>{
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>new URL(String(input)).pathname==="/2/activity/subscriptions"?json(response):provider(input,init));
    vi.stubGlobal("fetch",calls);
    await coordinator().start("otw");
    expect((await coordinator().status("otw")).coordinatorError).toBe("x_activity_inventory_incomplete");
    expect(calls.mock.calls.every(([,init])=>(init?.method??"GET")==="GET")).toBe(true);
    expect(remote).toHaveLength(0);expect(hooks).toHaveLength(0);
  });

  it("recovers an uncertain webhook creation for cleanup and leaves foreign subscriptions untouched",async()=>{
    let lost=true;
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const response=await provider(input,init);
      if(lost&&new URL(String(input)).pathname==="/2/webhooks"&&init?.method==="POST"){lost=false;throw new Error("response lost");}
      return response;
    }));
    await coordinator().start("otw");expect(hooks).toHaveLength(1);
    await coordinator().stop("otw");expect(hooks).toHaveLength(0);
    const foreign={subscription_id:"foreign",event_type:"post.create",filter:{user_id:userId},tag:"foreign",webhook_id:"elsewhere"};
    remote=[foreign];await coordinator().start("otw");
    expect((await coordinator().status("otw")).mode).toBe("partial");
    await coordinator().stop("otw");expect(remote).toEqual([foreign]);
  });

  it("subscribes a shared user once, fans out once per allowed site and charges one event",async()=>{
    await peer.prepare("UPDATE members SET url_twitter='https://x.com/member'").run();
    await peer.prepare("UPDATE x_post_sources SET handle='member',username='member',user_id=?").bind(userId).run();
    await coordinator().start("otw");await coordinator().start("luvdia");
    expect(remote).toHaveLength(1);
    const event=photo(await tag()),id=parseXActivityEvent(event)!.eventId;
    await Promise.all([coordinator().accept(event),coordinator().accept(event)]);
    await Promise.all([coordinator().deliver(id),coordinator().deliver(id)]);
    await Promise.all([local("otw").process(id),local("luvdia").process(id)]);
    for(const database of [db,peer])expect(JSON.parse((await database.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first<string>("value"))!)).toMatchObject({text:"complete long note",media:[{mediaKey:"photo"}]});
    expect((await new D1SharedXBudget(db).read()).used).toBe(5000);
    expect(await db.prepare("SELECT COUNT(*) FROM x_activity_dispatch").first("COUNT(*)")).toBe(1);
    expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member'").first("last_seen_post_id")).toBe(baseId);
  });

  it("resolves a missing cache identity and keeps registration failures separate",async()=>{
    await db.prepare("UPDATE x_post_sources SET user_id=NULL,collection_started_at=NULL,last_seen_post_id=NULL,initialization_completed_at=NULL").run();
    failUser=peerUserId;
    await coordinator().start("otw");await coordinator().start("luvdia");
    const status=await coordinator().status("luvdia");
    expect(status.mode).toBe("partial");expect(remote).toHaveLength(1);
    expect(await db.prepare("SELECT user_id FROM x_post_sources WHERE handle='member'").first("user_id")).toBe(userId);
    expect(Number(await db.prepare("SELECT collection_started_at FROM x_post_sources WHERE handle='member'").first("collection_started_at"))).toBeGreaterThan(0);
    expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member'").first("last_seen_post_id")).toBeNull();
    expect(status.sites?.find(site=>site.site==="otw")?.activeCount).toBe(1);
  });

  it("rechecks each site's publication policy at fanout and never stores the other site's excluded member",async()=>{
    await peer.prepare("UPDATE members SET url_twitter='https://x.com/member'").run();
    await peer.prepare("UPDATE x_post_sources SET handle='member',username='member',user_id=?").bind(userId).run();
    await coordinator().start("otw");await coordinator().start("luvdia");
    const event=photo(await tag()),id=parseXActivityEvent(event)!.eventId;
    await coordinator().accept(event);
    await db.prepare("UPDATE members SET is_deprecated=1").run();
    await coordinator().deliver(id);await local("luvdia").process(id);
    expect(await db.prepare("SELECT id FROM x_posts WHERE id=?").bind(postId).first()).toBeNull();
    expect(await db.prepare("SELECT event_id FROM x_activity_inbox").first()).toBeNull();
    expect(await peer.prepare("SELECT id FROM x_posts WHERE id=?").bind(postId).first()).not.toBeNull();
  });

  it("reuses a confirmed media response for the same post delivered as distinct events on one UTC day",async()=>{
    await coordinator().start("otw");
    const first=body(await tag());
    const second={data:{...first.data,event_uuid:"second-delivery"}};
    const calls=vi.fn(provider);vi.stubGlobal("fetch",calls);
    for(const event of [first,second]){
      const id=parseXActivityEvent(event)!.eventId;
      await coordinator().accept(event);await coordinator().deliver(id);await local("otw").process(id);
    }
    expect(calls.mock.calls.filter(([input])=>new URL(String(input)).pathname==="/2/tweets")).toHaveLength(1);
    expect((await db.prepare("SELECT status FROM x_activity_inbox").all()).results).toEqual([{status:"complete"},{status:"complete"}]);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM x_shared_requests WHERE operation='tweet_lookup'").first("n")).toBe(1);
    expect(JSON.parse((await db.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first<string>("value"))!).media).toHaveLength(1);
  });

  it.each(["budget","provider"])("does not share a failed %s media claim with a later delivery of the same post",async reason=>{
    await coordinator().start("otw");
    const first=body(await tag()),second={data:{...first.data,event_uuid:"retry-delivery"}};
    let fail=reason==="provider";
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(fail&&new URL(String(input)).pathname==="/2/tweets")return new Response(null,{status:503});
      return provider(input,init);
    });vi.stubGlobal("fetch",calls);
    const firstId=parseXActivityEvent(first)!.eventId,secondId=parseXActivityEvent(second)!.eventId;
    await coordinator().accept(first);await coordinator().deliver(firstId);
    if(reason==="budget")await db.prepare("UPDATE x_shared_budgets SET reserved=990000").run();
    await local("otw").process(firstId);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(firstId).first("status")).toBe("pending");
    fail=false;await db.prepare("UPDATE x_shared_budgets SET reserved=0").run();
    await coordinator().accept(second);await coordinator().deliver(secondId);await local("otw").process(secondId);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(secondId).first("status")).toBe("complete");
    expect(calls.mock.calls.filter(([input])=>new URL(String(input)).pathname==="/2/tweets")).toHaveLength(reason==="budget"?1:2);
  });

  it.each(["empty", "missing_media", "wrong_author", "wrong_post", "partial_error"])("does not reuse a 200 response with %s media data for a later event",async reason=>{
    await coordinator().start("otw");
    const first=body(await tag()),second={data:{...first.data,event_uuid:"later-media-delivery"}};
    let incomplete=true;
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(incomplete&&new URL(String(input)).pathname==="/2/tweets")return json(reason==="empty"?{data:[]}:
        {data:[{id:reason==="wrong_post"?baseId:postId,author_id:reason==="wrong_author"?peerUserId:userId,attachments:{media_keys:["video"]}}],
          ...(reason==="partial_error"?{includes:{media:[{media_key:"video",type:"video",preview_image_url:"https://pbs.twimg.com/video_thumb/1.jpg"}]},errors:[{resource_id:"video"}]}:{})});
      return provider(input,init);
    });vi.stubGlobal("fetch",calls);
    const firstId=parseXActivityEvent(first)!.eventId,secondId=parseXActivityEvent(second)!.eventId;
    await coordinator().accept(first);await coordinator().deliver(firstId);await local("otw").process(firstId);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(firstId).first("status")).toBe(reason==="partial_error"?"complete":"unavailable");
    incomplete=false;
    await coordinator().accept(second);await coordinator().deliver(secondId);await local("otw").process(secondId);
    expect(await db.prepare("SELECT status FROM x_activity_inbox WHERE event_id=?").bind(secondId).first("status")).toBe("complete");
    expect(calls.mock.calls.filter(([input])=>new URL(String(input)).pathname==="/2/tweets")).toHaveLength(2);
  });

  it("uses one paid hydration for duplicate site requests and revokes an in-flight result on redaction",async()=>{
    await coordinator().start("otw");
    const event=body(await tag()),id=parseXActivityEvent(event)!.eventId;
    await coordinator().accept(event);await coordinator().deliver(id);
    let release!:(response:Response)=>void,requested!:()=>void;
    const started=new Promise<void>(resolve=>{requested=resolve;});
    const calls=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(input)).pathname==="/2/tweets"){requested();return new Promise<Response>(resolve=>{release=resolve;});}
      return provider(input,init);
    });vi.stubGlobal("fetch",calls);
    const processing=local("otw").process(id);await started;
    await redactStoredXPosts(db,[postId]);await gateway("otw").redactPost(postId);
    release(json({data:[{id:postId,author_id:userId,text:"must stay erased"}]}));await processing;
    expect(await db.prepare("SELECT status,payload,hydrated_payload,lease_until FROM x_activity_inbox").first()).toMatchObject({status:"skipped",payload:null,hydrated_payload:null,lease_until:0});
    expect(await db.prepare("SELECT result FROM x_shared_requests WHERE operation='tweet_lookup'").first("result")).toBeNull();
    expect(JSON.parse((await db.prepare("SELECT value FROM x_posts WHERE id=?").bind(postId).first<string>("value"))!)).toEqual({});
  });

  it("reuses one completed media response when both sites request it concurrently",async()=>{
    await peer.prepare("UPDATE members SET url_twitter='https://x.com/member'").run();
    await peer.prepare("UPDATE x_post_sources SET handle='member',username='member',user_id=?").bind(userId).run();
    await coordinator().start("otw");await coordinator().start("luvdia");
    const event=body(await tag()),id=parseXActivityEvent(event)!.eventId;
    await coordinator().accept(event);await coordinator().deliver(id);
    let release!:(response:Response)=>void,requested!:()=>void;
    const started=new Promise<void>(resolve=>{requested=resolve;});
    const fetches=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(new URL(String(input)).pathname==="/2/tweets"){requested();return new Promise<Response>(resolve=>{release=resolve;});}
      return provider(input,init);
    });vi.stubGlobal("fetch",fetches);
    const first=local("otw").process(id);await started;
    await local("luvdia").process(id);
    expect(await peer.prepare("SELECT lookup_attempts FROM x_activity_inbox").first("lookup_attempts")).toBe(0);
    release(await provider("https://api.x.com/2/tweets"));await first;
    vi.spyOn(Date,"now").mockReturnValue(Date.now()+60_001);
    await local("luvdia").process(id);
    expect(fetches).toHaveBeenCalledTimes(1);
    for(const database of [db,peer])expect(await database.prepare("SELECT status FROM x_activity_inbox").first("status")).toBe("complete");
  });

  it("atomically reserves the combined budget and keeps both sites' pre-rollout spend and holds",async()=>{
    await db.prepare("DELETE FROM x_shared_budgets").run();
    await db.prepare("UPDATE x_activity_coordinator SET bootstrap_extra_day=?,bootstrap_extra_micros=15000").bind(new Date(Date.now()).toISOString().slice(0,10)).run();
    const day=new Date(Date.now()).toISOString().slice(0,10);
    await new D1SharedXBudget(db).initialize([{day,used:450000,reserved:10000},{day,used:450000,reserved:0}]);
    expect(await new D1SharedXBudget(db).read()).toMatchObject({used:915000,reserved:10000});
    let release!:(response:Response)=>void;
    const calls=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal("fetch",calls);
    const path="/users/"+userId+"/tweets?max_results=5";
    const first=gateway("otw").execute({id:"request-one",operation:"timeline",path});
    await vi.waitFor(()=>expect(calls).toHaveBeenCalledTimes(1));
    const second=await gateway("luvdia").execute({id:"request-two",operation:"timeline",path});
    expect(second).toMatchObject({ok:false,error:"budget_exceeded",dispatched:false});
    release(json({data:[{id:postId,text:"first"}]}));expect((await first).ok).toBe(true);
    const repeated=await gateway("luvdia").execute({id:"request-one",operation:"timeline",path});
    expect(repeated).toMatchObject({ok:true,cached:true,costMicros:0,dispatched:false});
    expect(calls).toHaveBeenCalledTimes(1);
    expect(await new D1SharedXBudget(db).read()).toMatchObject({used:920000,reserved:10000});
  });

  it("resumes budget-paused webhooks when temporary REST reservations settle, preserving user stops",async()=>{
    await coordinator().start("otw");await coordinator().start("luvdia");await coordinator().stop("luvdia");
    await db.prepare("UPDATE x_shared_budgets SET used=50000,reserved=925000").run();
    await coordinator().reconcile(true);
    expect((await coordinator().status("otw")).mode).toBe("budget_paused");expect(remote).toHaveLength(0);
    await db.prepare("UPDATE x_shared_budgets SET reserved=0").run();
    await coordinator().reconcile(true);
    expect((await coordinator().status("otw")).mode).toBe("normal");expect(remote).toHaveLength(1);
    expect((await coordinator().status("luvdia")).mode).toBe("user_paused");
  });

  it("records an already charged event past the goal, then resumes only budget-paused sites after UTC rollover",async()=>{
    await coordinator().start("otw");await coordinator().start("luvdia");await coordinator().stop("luvdia");
    const event=photo(await tag());
    await db.prepare("UPDATE x_shared_budgets SET used=1000000").run();
    await coordinator().accept(event);await coordinator().reconcile(true);
    expect((await new D1SharedXBudget(db).read()).used).toBe(1005000);expect(remote).toHaveLength(0);
    expect((await coordinator().status("otw")).mode).toBe("budget_paused");
    vi.spyOn(Date,"now").mockReturnValue((Math.floor(Date.now()/86400000)+1)*86400000+180000);
    await coordinator().reconcile(true);
    expect((await coordinator().status("otw")).mode).toBe("normal");
    expect((await coordinator().status("luvdia")).mode).toBe("user_paused");
    expect(remote).toHaveLength(1);
  });

  it("settles an in-flight paid response into its UTC response day without losing or duplicating the old reservation",async()=>{
    const oldDay=new Date(Date.now()).toISOString().slice(0,10);
    let release!:(response:Response)=>void;
    const calls=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;}));vi.stubGlobal("fetch",calls);
    const pending=gateway("otw").execute({id:"midnight-read",operation:"tweet_lookup",path:"/tweets?ids="+postId});
    await vi.waitFor(()=>expect(calls).toHaveBeenCalledTimes(1));
    vi.spyOn(Date,"now").mockReturnValue((Math.floor(Date.now()/86400000)+1)*86400000+1000);
    release(json({data:[{id:postId,text:"crossed midnight"}]}));await pending;
    expect(await db.prepare("SELECT used,reserved FROM x_shared_budgets WHERE day=?").bind(oldDay).first()).toMatchObject({used:0,reserved:0});
    expect(await new D1SharedXBudget(db).read()).toMatchObject({used:5000,reserved:0});
  });

  it("continues REST from its old cursor after budget interruption, while webhooks do not mark the scan complete",async()=>{
    const day=new Date(Date.now()).toISOString().slice(0,10);
    await db.prepare("UPDATE x_shared_budgets SET used=375000,reserved=0 WHERE day=?").bind(day).run();
    const runtime={...env,SITE_ID:"otw",X_BEARER_TOKEN:"test",X_API_GATEWAY:gateway("otw")} as unknown as import("../../../platform/types").Env;
    await db.prepare("INSERT INTO x_api_cache(key,type,value,fetched_at,expires_at) VALUES('x:user:v1:member','user',?, ?,?)").bind(JSON.stringify({user:{id:userId,username:"member"}}),Date.now(),Date.now()+86400000).run();
    const first=await runXCollectionForHandles(runtime,["member"],"manual");
    expect(first.success).toBe(false);
    expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member'").first("last_seen_post_id")).toBe(baseId);
    expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member'").first("sync_pagination_token")).toBe("page-two");
    expect(first.pendingSources).toBe(1);
    await db.prepare("UPDATE x_shared_budgets SET used=990000 WHERE day=?").bind(day).run();
    const blocked=await runXCollectionForHandles(runtime,["member"],"manual");
    expect(blocked.success).toBe(false);
    expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member'").first("sync_pagination_token")).toBe("page-two");
    vi.spyOn(Date,"now").mockReturnValue(Date.now()+86401000);
    const second=await runXCollectionForHandles(runtime,["member"],"manual");
    expect(second.success).toBe(true);
    expect(await db.prepare("SELECT last_seen_post_id FROM x_post_sources WHERE handle='member'").first("last_seen_post_id")).toBe(postId);
    expect(await db.prepare("SELECT sync_pagination_token FROM x_post_sources WHERE handle='member'").first("sync_pagination_token")).toBeNull();
  });
});
