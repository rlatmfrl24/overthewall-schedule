import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { workerRouteRegistry } from "../../../app/routes";
import { clearAuthCachesForTests } from "../../../platform/auth";
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";
import { FlashLiteScheduleImageReader } from "../infrastructure/flash-lite-schedule-image-reader";

const db = env.otw_db, origin = "http://localhost:5173", issuer = "https://image-test.clerk.invalid";
let pair: CryptoKeyPair, jwk: JsonWebKey;
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=/g, "").replace(/\+/g,"-").replace(/\//g,"_");
const part = (v: unknown) => encode(new TextEncoder().encode(JSON.stringify(v)));
async function request(path: string, user?: string, body?: unknown, site: "otw" | "luvdia" = "otw", overrides:Partial<Env>={}) {
  const runtime = { ...env, ...siteEnv(site), CLERK_ISSUER:issuer, CLERK_JWKS_URL:issuer+"/.well-known/jwks.json", CLERK_AUTHORIZED_PARTIES:origin,...overrides } as unknown as Env;
  const headers = new Headers({ Origin:origin });
  if (user) {
    const payload = `${part({alg:"RS256",kid:"image-key"})}.${part({iss:issuer,azp:origin,sub:user,exp:Math.floor(Date.now()/1000)+3600})}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(payload));
    headers.set("Authorization",`Bearer ${payload}.${encode(new Uint8Array(signature))}`);
  }
  if (body && !(body instanceof FormData)) headers.set("Content-Type","application/json");
  return (await workerRouteRegistry.dispatch(new Request(origin+path,{method:body?"POST":"GET",headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined}),runtime))!;
}
beforeAll(async () => {
  await applyD1Migrations(db,(env as unknown as {IMAGE_IMPORT_WRITE_MIGRATIONS:D1Migration[]}).IMAGE_IMPORT_WRITE_MIGRATIONS);
  pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  jwk=await crypto.subtle.exportKey("jwk",pair.publicKey) as JsonWebKey;
});
beforeEach(async () => {
  clearAuthCachesForTests();
  vi.stubGlobal("fetch",vi.fn(async (url:RequestInfo|URL) => {
    if (String(url)===issuer+"/.well-known/jwks.json") return Response.json({keys:[{...jwk,kid:"image-key",alg:"RS256",use:"sig"}]});
    throw new Error("Unexpected paid provider call");
  }));
  await db.batch(["schedule_image_reads","schedule_image_results","update_logs","schedules","members"].map(t=>db.prepare(`DELETE FROM ${t}`)));
  await db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(1,'on_haru','온하루',0)").run();
});
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each(["bing_hayu","u_lili","yang_mei"])("blocks hidden %s reads and edits through authenticated image routes",async code=>{
  await db.prepare("UPDATE members SET code=? WHERE uid=1").bind(code).run();
  const original=await db.prepare("INSERT INTO schedules(member_uid,date,status,title) VALUES(1,'2026-11-12','방송','숨김 원본') RETURNING id").first<{id:number}>();
  for(const user of ["user","admin"]){
    const overrides={CLERK_ADMIN_IDS:"admin"};
    expect((await request("/api/schedules/image-import/context?memberUid=1&date=2026-11-12",user,undefined,"otw",overrides)).status).toBe(403);
    for(const id of [original!.id,null]){
      const input={operationId:`${Date.now()}_${crypto.randomUUID()}`,memberUid:1,date:"2026-11-12",expected:JSON.stringify([[original!.id,"방송",null,"숨김 원본","normal"]]),
        changes:[{clientId:"a",id,startTime:"22:00",title:"차단할 변경",status:"방송"}],confirmedDeletedIds:[]};
      expect((await request("/api/schedules/image-import/apply",user,input,"otw",overrides)).status).toBe(403);
    }
  }
  expect((await db.prepare("SELECT title FROM schedules").all()).results).toEqual([{title:"숨김 원본"}]);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM update_logs").first("n")).toBe(0);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedule_image_results").first("n")).toBe(0);
});
it.each(["otw","luvdia"] as const)("uses the site's public member roster during real analyze orchestration on %s",async site=>{
  await db.prepare("INSERT INTO members(uid,code,name,is_deprecated,content_access) VALUES(2,'bing_hayu','숨김 멤버',0,'normal'),(3,'old','비활동 멤버',1,'normal'),(4,'archived','보관 멤버',0,'admin_archive')").run();
  const count=vi.spyOn(FlashLiteScheduleImageReader.prototype,"count").mockResolvedValue(1);
  const read=vi.spyOn(FlashLiteScheduleImageReader.prototype,"read").mockResolvedValue({draft:{model:"gemini-3.5-flash-lite",rows:[],warnings:[],usage:{inputTokens:1,outputTokens:1}},usage:{inputTokens:1,outputTokens:1}});
  const body=new FormData();body.append("image",new File([new Uint8Array([137,80,78,71,13,10,26,10])],"image.png",{type:"image/png"}));
  const result=await request("/api/schedules/image-import/analyze","user",body,site,{SCHEDULE_IMAGE_OPENROUTER_API_KEY:"test-only",SCHEDULE_IMAGE_GEMINI_API_KEY:"test-only"});
  expect(result.status).toBe(200);expect(read).toHaveBeenCalledOnce();
  const expected=site==="otw"?[1]:[1,2];
  expect(count.mock.calls[0][0].members.map(m=>m.uid)).toEqual(expected);
  expect(read.mock.calls[0][0].members.map(m=>m.uid)).toEqual(expected);
});
it("reports missing image-model configuration before any cost reservation or provider call",async()=>{
  const body=new FormData();body.append("image",new File([new Uint8Array([137,80,78,71,13,10,26,10])],"image.png",{type:"image/png"}));
  const result=await request("/api/schedules/image-import/analyze","user",body);
  expect(result.status).toBe(503);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedule_image_reads").first("n")).toBe(0);
});
it.each(["otw","luvdia"] as const)("real JWT context/apply/result route on %s preserves manual anonymous entry",async site=>{
  expect((await request("/api/schedules/image-import/context?memberUid=1&date=2026-11-12",undefined,undefined,site)).status).toBe(401);
  const context=await request("/api/schedules/image-import/context?memberUid=1&date=2026-11-12","user",undefined,site);
  expect(context.status).toBe(200);
  const input={operationId:`${Date.now()}_${crypto.randomUUID()}`,memberUid:1,date:"2026-11-12",expected:(await context.json() as {expected:string}).expected,
    changes:[{clientId:"a",id:null,startTime:null,title:"직접 확인한 방송",status:"방송"}],confirmedDeletedIds:[]};
  expect((await request("/api/schedules/image-import/apply","user",input,site)).status).toBe(200);
  const result=await request(`/api/schedules/image-import/result?operationId=${input.operationId}`,"other",undefined,site);
  expect(await result.json()).toBeNull();
  expect((await request("/api/schedules/image-import/apply","user",input,site)).status).toBe(200);
  expect(await db.prepare("SELECT COUNT(*) AS n FROM schedules").first("n")).toBe(1);
  const normal=await request("/api/schedules/save",undefined,{member_uid:1,date:"2026-11-13",start_time:"21:00",title:"직접 입력",status:"방송"},site);
  expect(normal.status).toBe(200);
  const read=await request("/api/schedules?date=2026-11-12",undefined,undefined,site);
  expect(await read.json()).toMatchObject([{title:"직접 확인한 방송",start_time:null,status:"방송"}]);
});
