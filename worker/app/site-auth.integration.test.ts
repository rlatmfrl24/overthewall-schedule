import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll, afterEach, expect, it, vi } from "vitest";
import { handleWorkerFetch } from "./fetch";
import { clearAuthCachesForTests } from "../platform/auth";
import type { Env } from "../platform/types";
import { siteEnv } from "../test-support/site-env";

const testEnv = env as unknown as Env & { SETTINGS_MIGRATIONS: D1Migration[] };
let keys: CryptoKeyPair;
let jwk: JsonWebKey;
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const jsonPart = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
const token = async (issuer: string, origin: string | undefined, user: string) => {
  const input = `${jsonPart({ alg: "RS256", kid: "test-site-key" })}.${jsonPart({ iss: issuer, azp: origin, sub: user, email: "same@operator.example", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
};
beforeAll(async () => {
  await applyD1Migrations(testEnv.otw_db, testEnv.SETTINGS_MIGRATIONS);
  keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
  jwk = await crypto.subtle.exportKey("jwk", keys.publicKey) as JsonWebKey;
});
afterEach(() => { vi.unstubAllGlobals(); clearAuthCachesForTests(); });
it.each(["otw", "luvdia"] as const)("enforces %s app/origin/admin identity through Worker fetch before D1 mutation", async site => {
  const issuer = `https://${site}.clerk.invalid`;
  const origin = site === "otw" ? "http://localhost:5173" : "http://localhost:5174";
  const runtime = { ...testEnv, ...siteEnv(site), SITE_PUBLIC_ORIGIN: origin,
    CLERK_ISSUER: issuer, CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`,
    CLERK_AUTHORIZED_PARTIES: origin, CLERK_ADMIN_IDS: `${site}-admin`, YOUTUBE_API_KEY: "",
  } as Env;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "test-site-key", alg: "RS256", use: "sig" }] })));
  const before = (await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results;
  for (const [claims, expected] of [
    [["https://other.clerk.invalid", origin, `${site}-admin`], 401],
    [[issuer, "http://localhost:9999", `${site}-admin`], 401],
    [[issuer, origin, "other-admin"], 403],
  ] as const) {
    const bearer = await token(claims[0], claims[1], claims[2]);
    const response = await handleWorkerFetch(new Request("http://localhost:9999/api/settings", { method: "PUT", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify({ youtube_api_daily_quota_units: "123" }) }), runtime);
    expect(response.status).toBe(expected);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results).toEqual(before);
  }
  const bearer = await token(issuer, origin, `${site}-admin`);
  const accepted = await handleWorkerFetch(new Request("http://localhost:9999/api/settings", { headers: { Authorization: `Bearer ${bearer}` } }), runtime);
  expect(accepted.status).toBe(200);
  expect(await accepted.json()).toMatchObject({ youtube_api_daily_quota_units: expect.any(String) });
  const mismatched = await handleWorkerFetch(new Request("http://localhost:9999/api/settings", { headers: { Authorization: `Bearer ${bearer}` } }), { ...runtime, CLERK_JWKS_URL: "https://other.clerk.invalid/.well-known/jwks.json" });
  expect(mismatched.status).toBe(500);
});

it("rejects invalid site/resources in the real Worker entry before D1, auth or assets", async () => {
  const before = (await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results;
  const prepare = vi.fn((sql: string) => testEnv.otw_db.prepare(sql));
  const database = new Proxy(testEnv.otw_db, { get(target, property) {
    if (property === "prepare") return prepare;
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const authConfig = vi.fn(), assets = vi.fn(async () => new Response("asset"));
  vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    for (const overrides of [{ SITE_ID: undefined }, { SITE_CONTROL_QUEUE_NAME: "otw-ops-control" }, { PLAY_ANALYTICS_DATASET: "otw_play_events" }]) {
      const runtime = { ...testEnv, ...siteEnv("luvdia"), ...overrides, otw_db: database, ASSETS: { fetch: assets },
        get CLERK_ISSUER() { authConfig(); return "https://selected.clerk.invalid"; },
      } as unknown as Env;
      for (const path of ["/api/settings", "/api/auth/status", "/favicon.ico", "/feed/"]) {
        const request = new Request(`http://localhost:9999${path}`, { headers: { Authorization: "Bearer invalid-token" } });
        if (path.startsWith("/api/")) expect((await handleWorkerFetch(request, runtime)).status).toBe(500);
        else await expect(handleWorkerFetch(request, runtime)).rejects.toThrow(/site|Queue|Analytics/);
      }
    }
    expect(prepare).not.toHaveBeenCalled();
    expect(authConfig).not.toHaveBeenCalled();
    expect(assets).not.toHaveBeenCalled();
    expect((await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results).toEqual(before);
  } finally { vi.restoreAllMocks(); }
});

it.each([undefined, "", " \t "])("does not authenticate without explicit runtime origins: %j", async parties => {
  const issuer = "https://otw.clerk.invalid";
  const fetcher = vi.fn(async () => Response.json({ keys: [{ ...jwk, kid: "test-site-key", alg: "RS256", use: "sig" }] }));
  vi.stubGlobal("fetch", fetcher);
  const runtime = { ...testEnv, ...siteEnv(), CLERK_ISSUER: issuer, CLERK_JWKS_URL: `${issuer}/.well-known/jwks.json`, CLERK_ADMIN_IDS: "otw-admin", CLERK_AUTHORIZED_PARTIES: parties } as Env;
  const before = (await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results;
  for (const origin of [undefined, "http://localhost:9999"]) {
    const bearer = await token(issuer, origin, "otw-admin");
    const response = await handleWorkerFetch(new Request("http://localhost:9999/api/settings", { method: "PUT", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify({ youtube_api_daily_quota_units: "123" }) }), runtime);
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Authentication is not configured");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  expect(fetcher).not.toHaveBeenCalled();
  expect((await testEnv.otw_db.prepare("SELECT key, value FROM settings ORDER BY key").all()).results).toEqual(before);
});
