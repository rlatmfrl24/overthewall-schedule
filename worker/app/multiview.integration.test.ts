import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, afterEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import type { Env } from "../platform/types";
import { clearAuthCachesForTests } from "../platform/auth";
import { clearChzzkServiceCachesForTests } from "../features/chzzk/infrastructure/chzzk-api";
import { siteEnv } from "../test-support/site-env";

const bindings = env as unknown as Env & { MULTIVIEW_MIGRATIONS: D1Migration[]; transition_target_db: D1Database };
const id = "a".repeat(32), origin = "http://localhost:5173", issuer = "https://multiview.clerk.invalid";
let keys: CryptoKeyPair, jwk: JsonWebKey;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const part = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
async function request(path: string, user?: string, init: RequestInit = {}, site: "otw" | "luvdia" = "otw", tokenIssuer = issuer) {
  const headers = new Headers(init.headers);
  if (user) {
    const input = `${part({ alg: "RS256", kid: "multiview-key" })}.${part({ iss: tokenIssuer, azp: origin, sub: user, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
    headers.set("Authorization", `Bearer ${input}.${encode(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input))))}`);
  }
  return handleWorkerFetch(new Request(`${origin}${path}`, { ...init, headers }), {
    ...bindings, ...siteEnv(site), otw_db: site === "otw" ? bindings.otw_db : bindings.transition_target_db,
    CLERK_ISSUER: issuer, CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`, CLERK_AUTHORIZED_PARTIES: origin,
    MULTIVIEW_RATE_LIMITER: { limit: async () => ({ success: true }) },
  } as unknown as Env);
}
beforeAll(async () => {
  for (const db of [bindings.otw_db, bindings.transition_target_db]) await applyD1Migrations(db, bindings.MULTIVIEW_MIGRATIONS);
  keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
});
beforeEach(async () => {
  clearAuthCachesForTests(); clearChzzkServiceCachesForTests();
  for (const db of [bindings.otw_db, bindings.transition_target_db]) await db.prepare("DELETE FROM multiview_channels").run();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${issuer}/.well-known/jwks.json`) return Response.json({ keys: [{ ...jwk, kid: "multiview-key", alg: "RS256", use: "sig" }] });
    if (url === `https://api.chzzk.naver.com/service/v1/channels/${id}`) return Response.json({ code: 200, content: { channelId: id, channelName: "Public external channel", channelImageUrl: null, openLive: false } });
    if (url === `https://api.chzzk.naver.com/polling/v2/channels/${id}/live-status`) return Response.json({ code: 200, content: { status: "CLOSE", channelId: id, channelName: "Public external channel", channelImageUrl: "", liveTitle: "", concurrentUserCount: 0, liveImageUrl: "", defaultThumbnailImageUrl: "" } });
    throw new Error(`Unexpected external access: ${url}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

it("persists through authenticated Worker entry, restores and deletes without crossing owner/site boundaries", async () => {
  const path = "/api/multiview/me/channels";
  expect((await request(path)).status).toBe(401);
  const saved = await request(path, "alice", { method: "POST", body: JSON.stringify({ input: `https://chzzk.naver.com/${id}` }) });
  expect(saved.status).toBe(200);
  expect(saved.headers.get("Cache-Control")).toBe("no-store");
  expect(saved.headers.get("Vary")).toContain("Authorization");
  expect(await (await request(path, "alice")).json()).toMatchObject({ limit: 30, items: [{ channelId: id, channelName: "Public external channel" }] });
  expect(await (await request(path, "bob")).json()).toEqual({ limit: 30, items: [] });
  expect(await (await request(path, "alice", {}, "luvdia")).json()).toEqual({ limit: 30, items: [] });
  expect((await request(`${path}/${id}`, "bob", { method: "DELETE" })).status).toBe(200);
  expect(await (await request("/api/multiview/me/live-status", "alice")).json()).toMatchObject({ items: [{ channelId: id, content: { status: "CLOSE" } }] });
  expect(await (await request("/api/multiview/me/live-status", "bob")).json()).toMatchObject({ items: [] });
  expect((await request(`${path}/${id}`, "alice", { method: "DELETE" })).status).toBe(200);
  expect(await (await request(path, "alice")).json()).toEqual({ limit: 30, items: [] });
});
it("rejects a foreign issuer and unsaved target/query injection", async () => {
  expect((await request("/api/multiview/me/channels", "alice", {}, "otw", "https://other.clerk.invalid")).status).toBe(401);
  expect((await request(`/api/multiview/me/live-status?channelIds=${id}`, "alice")).status).toBe(400);
  expect((await request("/api/multiview/me/channels", "alice", { method: "POST", body: JSON.stringify({ input: id, ownerUserId: "bob" }) })).status).toBe(400);
});
