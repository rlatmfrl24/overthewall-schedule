import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { workerRouteRegistry } from "../../../app/routes";
import { clearAuthCachesForTests } from "../../../platform/auth";
import { siteEnv } from "../../../test-support/site-env";
import type { Env } from "../../../platform/types";

const db = env.otw_db, origin = "http://localhost:5173", issuer = "https://image-test.clerk.invalid";
let pair: CryptoKeyPair, jwk: JsonWebKey;
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/=/g, "").replace(/\+/g,"-").replace(/\//g,"_");
const part = (v: unknown) => encode(new TextEncoder().encode(JSON.stringify(v)));
async function request(path: string, user?: string, body?: unknown, site: "otw" | "luvdia" = "otw") {
  const runtime = { ...env, ...siteEnv(site), CLERK_ISSUER:issuer, CLERK_JWKS_URL:issuer+"/.well-known/jwks.json", CLERK_AUTHORIZED_PARTIES:origin } as unknown as Env;
  const headers = new Headers({ Origin:origin });
  if (user) {
    const payload = `${part({alg:"RS256",kid:"image-key"})}.${part({iss:issuer,azp:origin,sub:user,exp:Math.floor(Date.now()/1000)+3600})}`;
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5",pair.privateKey,new TextEncoder().encode(payload));
    headers.set("Authorization",`Bearer ${payload}.${encode(new Uint8Array(signature))}`);
  }
  if (body) headers.set("Content-Type","application/json");
  return (await workerRouteRegistry.dispatch(new Request(origin+path,{method:body?"POST":"GET",headers,body:body?JSON.stringify(body):undefined}),runtime))!;
}
beforeAll(async () => {
  await applyD1Migrations(db,(env as unknown as {IMAGE_IMPORT_WRITE_MIGRATIONS:D1Migration[]}).IMAGE_IMPORT_WRITE_MIGRATIONS);
  pair=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]) as CryptoKeyPair;
  jwk=await crypto.subtle.exportKey("jwk",pair.publicKey);
});
beforeEach(async () => {
  clearAuthCachesForTests();
  vi.stubGlobal("fetch",vi.fn(async (url:RequestInfo|URL) => {
    if (String(url)===issuer+"/.well-known/jwks.json") return Response.json({keys:[{...jwk,kid:"image-key",alg:"RS256",use:"sig"}]});
    throw new Error("Unexpected paid provider call");
  }));
  await db.batch(["schedule_image_results","update_logs","schedules","members"].map(t=>db.prepare(`DELETE FROM ${t}`)));
  await db.prepare("INSERT INTO members(uid,code,name,is_deprecated) VALUES(1,'on_haru','온하루',0)").run();
});
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks();});
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
