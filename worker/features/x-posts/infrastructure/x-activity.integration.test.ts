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
const coordinator=()=>new D1XActivityCoordinator({db,origin:"https://otw.example",bearerToken:"test",clientSecret:"secret",gateway:gateway("otw"),
  sites:{otw:local("otw"),luvdia:local("luvdia")},peerReady:async()=>true,admitD1:async()=>true,dispatch:async id=>{queued.push({site:"dispatch",id});}});
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
    expect(result.recovery).toMatchObject({budget:{day:new Date().toISOString().slice(0,10),targetCount:1,pageSize:optimized?5:25,
      perPageMicros:optimized?125000:625000,firstPagesMicros:optimized?135000:635000,siteFirstPagesMicros:optimized?60000:260000,identityMicros:10000,
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
    expect((await coordinator().status("otw")).recovery).toMatchObject({budget:{identityMicros:10000,firstPagesMicros:635000,siteFirstPagesMicros:260000,siteLimitMicros:100000,availableMicros:10000}});
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
