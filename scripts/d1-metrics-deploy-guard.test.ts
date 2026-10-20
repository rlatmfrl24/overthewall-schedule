import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyD1MetricsForDeploy } from "./d1-metrics-deploy-guard.mjs";

const { run, publish } = vi.hoisted(() => ({ run: vi.fn(), publish: vi.fn() }));
vi.mock("node:child_process", () => ({ execFileSync: run, spawnSync: publish }));
vi.mock("./site-build-manifest.mjs", () => ({ verifySiteBuildManifest: vi.fn() }));
vi.mock("./client-build-deploy-guard.mjs", () => ({ verifyClientBuildForDeploy: vi.fn(() => ({ entryScriptCount: 1 })) }));

const account = "46e1801b290196fbec7cfae87710ffcf";
const fixtureRoot = mkdtempSync(join(tmpdir(), "d1-metrics-guard-"));
afterAll(() => { vi.unstubAllEnvs(); rmSync(fixtureRoot, { recursive: true, force: true }); });
const required = ["CLOUDFLARE_D1_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID"];
const configFor = (site: string) => ts.parseConfigFileTextToJson("config", readFileSync(site === "otw" ? "wrangler.jsonc" : "wrangler.luvdia.jsonc", "utf8")).config;
const bindingsFor = (site: string, encryptedIds = false) => [
  { name: "otw_db", type: "d1", id: configFor(site).d1_databases[0].database_id },
  { name: required[0], type: "secret_text" },
  ...required.slice(1).map((name, i) => encryptedIds ? { name, type: "secret_text" } : { name, type: "plain_text", text: i === 0 ? account : configFor(site).d1_databases[0].database_id }),
];
let active: ReturnType<typeof bindingsFor>;
let latest: ReturnType<typeof bindingsFor>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", account);
  active = bindingsFor("otw");
  latest = active;
  run.mockImplementation((_command, args: string[]) => {
    if (args[0] === "rev-parse") return "a".repeat(40);
    if (args.includes("whoami")) return JSON.stringify({ loggedIn: true, accounts: [{ id: account }] });
    if (args.includes("status")) return JSON.stringify({ versions: [{ version_id: "active", percentage: 100 }] });
    if (args.includes("list")) return JSON.stringify([{ id: "latest", number: 2 }, { id: "active", number: 1 }]);
    if (args.includes("view")) return JSON.stringify({ resources: { bindings: args.includes("active") ? active : latest } });
    throw new Error("Unexpected command");
  });
});

describe("D1 metrics deployment guard", () => {
  it.each(["otw", "luvdia"])("accepts %s's existing plaintext or encrypted IDs without reading secrets", site => {
    active = bindingsFor(site, site === "luvdia");
    latest = active;
    expect(verifyD1MetricsForDeploy(configFor(site))).toMatchObject({ workerName: configFor(site).name, versions: ["active", "latest"] });
    expect(run.mock.calls.every(([, args]) => !args.includes("deploy") && !args.includes("d1"))).toBe(true);
  });
  it.each(required)("blocks a missing %s in the active or inherited version", name => {
    active = active.filter(binding => binding.name !== name);
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(name);
    active = bindingsFor("otw");
    latest = active.filter(binding => binding.name !== name);
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(name);
  });
  it.each(required)("rejects empty or incompatible %s bindings", name => {
    latest = active.map(binding => binding.name === name ? { name, type: "plain_text", text: " " } : binding);
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(name);
  });
  it.each(["otw_db", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_D1_DATABASE_ID"])("rejects a different target for %s", name => {
    latest = active.map(binding => binding.name === name ? { ...binding, id: "wrong", text: "wrong" } : binding);
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(/identity|match/i);
  });
  it("requires variable preservation and prevents config vars from overwriting remote metrics bindings", () => {
    expect(() => verifyD1MetricsForDeploy({ ...configFor("otw"), keep_vars: false })).toThrow(/keep_vars/);
    for (const name of required) {
      expect(() => verifyD1MetricsForDeploy({ ...configFor("otw"), vars: { ...configFor("otw").vars, [name]: " " } })).toThrow(name);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("fails closed without leaking command output when authentication or JSON fails", () => {
    for (const result of ["invalid-json-sensitive-value", null]) {
      run.mockImplementation(() => { if (result === null) throw new Error("private-token"); return result; });
      try { verifyD1MetricsForDeploy(configFor("otw")); expect.unreachable(); }
      catch (error) { expect(String(error)).toMatch(/D1 metrics/); expect(String(error)).not.toMatch(/sensitive-value|private-token/); }
    }
  });
  it("uses CI's explicit account without requiring extra account-list permissions", () => {
    expect(verifyD1MetricsForDeploy(configFor("otw"))).toBeDefined();
    expect(run.mock.calls.some(([, args]) => args.includes("whoami"))).toBe(false);
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "b".repeat(32));
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(/ACCOUNT_ID.*identity/);
  });
  it("supports a single interactive account but rejects an ambiguous account", () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    expect(verifyD1MetricsForDeploy(configFor("otw"))).toBeDefined();
    run.mockReturnValue(JSON.stringify({ loggedIn: true, accounts: [{ id: account }, { id: "b".repeat(32) }] }));
    expect(() => verifyD1MetricsForDeploy(configFor("otw"))).toThrow(/unambiguous/);
  });
  it.each(["otw", "luvdia"])("stops %s's real deploy entry point before any D1 doctor or upload when metrics are missing", async site => {
    const { verifySiteBuildManifest } = await import("./site-build-manifest.mjs");
    const workerConfigPath = join(fixtureRoot, `${site}.json`);
    writeFileSync(workerConfigPath, JSON.stringify(configFor(site)));
    vi.mocked(verifySiteBuildManifest).mockReturnValue({ gitCommit: "a".repeat(40), workerConfigPath, artifactHashes: {} } as never);
    active = bindingsFor(site).filter(binding => binding.name !== required[0]);
    latest = active;
    const argv = process.argv;
    process.argv = [argv[0], "scripts/deploy-workers.mjs", `--site=${site}`];
    try { await expect(import("./deploy-workers.mjs")).rejects.toThrow(required[0]); }
    finally { process.argv = argv; }
    expect(publish).not.toHaveBeenCalled();
  });
  it.each(["otw", "luvdia"])("allows %s's deploy entry point to reach its existing doctor and upload after verification", async site => {
    const { verifySiteBuildManifest } = await import("./site-build-manifest.mjs");
    const workerConfigPath = join(fixtureRoot, `${site}.json`);
    writeFileSync(workerConfigPath, JSON.stringify(configFor(site)));
    vi.mocked(verifySiteBuildManifest).mockReturnValue({ gitCommit: "a".repeat(40), workerConfigPath, artifactHashes: {} } as never);
    active = bindingsFor(site, site === "luvdia"); latest = active;
    publish.mockReturnValue({ status: 0 });
    const argv = process.argv;
    process.argv = [argv[0], "scripts/deploy-workers.mjs", `--site=${site}`];
    try { await import("./deploy-workers.mjs"); }
    finally { process.argv = argv; }
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0][1][0]).toBe("scripts/d1-doctor.mjs");
    expect(JSON.stringify(publish.mock.calls[1][1])).toContain("deploy");
  });
});
