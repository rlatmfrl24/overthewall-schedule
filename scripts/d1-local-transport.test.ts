import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const wrangler = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");

it("native local D1 avoids Fetch-blocked ports and preserves migration failure semantics", async () => {
  const directory = await mkdtemp(join(tmpdir(), "otw-d1-transport-"));
  try {
    const migrations = join(directory, "migrations");
    const config = join(directory, "wrangler.json");
    const preload = join(directory, "blocked-port.cjs");
    const ports = join(directory, "ports.jsonl");
    await mkdir(migrations);
    await writeFile(config, JSON.stringify({
      name: "d1-transport-regression",
      compatibility_date: "2025-11-25",
      d1_databases: [{
        binding: "DB", database_name: "transport-regression",
        database_id: "00000000-0000-0000-0000-000000000178",
        migrations_dir: migrations,
      }],
    }));
    // Inject a blocked OS allocation while executing native Wrangler/workerd D1.
    await writeFile(preload, `
const Module = require('node:module');
const { appendFileSync } = require('node:fs');
const originalLoad = Module._load;
if (process.env.OTW_TEST_BLOCKED_ALLOCATION === '1') {
  const { Server } = require('node:net');
  const address = Server.prototype.address;
  let forced = false;
  Server.prototype.address = function (...args) {
    const result = address.apply(this, args);
    if (!forced && result?.address === '127.0.0.1') {
      forced = true;
      return { ...result, port: 10080 };
    }
    return result;
  };
}
Module._load = function (id, ...args) {
  const exports = originalLoad.call(this, id, ...args);
  if (id !== 'miniflare') return exports;
  return new Proxy(exports, { get(target, property) {
    if (property !== 'Miniflare') return Reflect.get(target, property);
    return new Proxy(target.Miniflare, { construct(Target, [options]) {
      appendFileSync(${JSON.stringify(ports)}, JSON.stringify(options.port ?? null) + '\\n');
      return new Target({ ...options, port: options.port || 10080 });
    }});
  }});
};
`);
    await writeFile(join(migrations, "0001_create.sql"), "CREATE TABLE entries (id INTEGER PRIMARY KEY);");
    await writeFile(join(migrations, "0002_insert.sql"), "INSERT INTO entries VALUES (1);");

    const run = (args: string[], persistTo = join(directory, "state"), forceBlockedAllocation = false) => new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, ["--require", preload, wrangler, "d1", ...args,
        "--config", config, "--local", "--persist-to", persistTo], {
        env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", OTW_TEST_BLOCKED_ALLOCATION: forceBlockedAllocation ? "1" : "0" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", chunk => { stdout += chunk; });
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", code => resolve({ code: code ?? 1, stdout, stderr }));
    });
    const apply = () => run(["migrations", "apply", "DB"]);
    const first = await run(["migrations", "apply", "DB"], undefined, true);
    expect(first.code, first.stderr).toBe(0);
    expect((await apply()).code).toBe(0);
    const query = "SELECT (SELECT COUNT(*) FROM d1_migrations) AS migrations, COUNT(*) AS entries FROM entries;";
    const read = (persistTo?: string) => run(["execute", "DB", "--json", "--command", query], persistTo);
    const secondState = join(directory, "second-state");
    await cp(join(directory, "state"), secondState, { recursive: true });
    for (const readback of await Promise.all([read(), read(secondState)])) {
      expect(readback.code, `${readback.stdout}\n${readback.stderr}`).toBe(0);
      expect(JSON.parse(readback.stdout)[0].results).toEqual([{ migrations: 2, entries: 1 }]);
    }

    await writeFile(join(migrations, "0003_invalid.sql"), "INSERT INTO entries VALUES (2); INSERT INTO missing_table VALUES (1);");
    const failed = await apply();
    expect(failed.code).not.toBe(0);
    expect(failed.stderr).toContain("missing_table");
    const afterFailure = await read();
    expect(afterFailure.code, afterFailure.stderr).toBe(0);
    expect(JSON.parse(afterFailure.stdout)[0].results).toEqual([{ migrations: 2, entries: 1 }]);
    const assignedPorts: number[] = (await readFile(ports, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    expect(assignedPorts.length).toBeGreaterThan(0);
    expect(assignedPorts.every(port => Number.isInteger(port) && port > 0 && port !== 10080)).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
