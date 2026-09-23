import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";

// Run from the repository root with the pinned Node version. Never touches the
// development/remote D1 database: Vitest creates an isolated workerd database.
const baseline = process.argv[2] ?? "4e8daa61492a6ea42e82da3d7ca7885038314e1d";
const root = resolve("worker/features/otw-play");
const sources = ["infrastructure/d1-admin-catalog-repository.ts", "infrastructure/d1-ingestion-repository.ts",
  "infrastructure/d1-catalog-projection.ts", "application/ingestion-service.ts", "application/admin-catalog-service.ts"];
const testFile = "worker/features/otw-play/infrastructure/d1-read-cost.integration.test.ts";
const generated = [];
const output = resolve(".tmp/sul31-read-benchmark");
mkdirSync(output, { recursive: true });
const remap = text => sources.reduce((current, name) => {
  const stem = basename(name, ".ts");
  return current.replaceAll(`/${stem}"`, `/.sul31-baseline-${stem}"`);
}, text);
function create(file, content) {
  if (existsSync(file)) throw new Error(`Refusing to overwrite ${file}`);
  writeFileSync(file, content); generated.push(file);
}
function run(label, file) {
  const log = execFileSync(process.execPath, ["node_modules/vitest/vitest.mjs", "run", "--config", "vitest.worker.config.ts", file],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  writeFileSync(resolve(output, `${label}.log`), log);
  const lines = log.split(/\r?\n/);
  const costs = lines.filter(line => line.startsWith("PLAY_READ_COST ")).map(line => JSON.parse(line.slice(15)));
  const plans = lines.find(line => line.startsWith("PLAY_READ_PLANS "));
  writeFileSync(resolve(output, `${label}-plans.json`), JSON.stringify(JSON.parse(plans.slice(16)), null, 2) + "\n");
  return costs;
}
try {
  const optimized = run("optimized", testFile);
  for (const source of sources) {
    const original = execFileSync("git", ["show", `${baseline}:worker/features/otw-play/${source}`], { encoding: "utf8" });
    create(resolve(root, dirname(source), `.sul31-baseline-${basename(source)}`), remap(original));
  }
  const baselineTest = resolve(root, "infrastructure/.sul31-baseline-cost.integration.test.ts");
  create(baselineTest, remap(readFileSync(testFile, "utf8")).replace(/  expect\(single(?:Save|Update)Reads\[2\]\)\.toBeLessThan\(single(?:Save|Update)Reads\[0\] \* 2\);/g, ""));
  const previous = run("baseline", baselineTest);
  const results = { baselineCommit: baseline, environment: "Local workerd D1; identical index migration 0097 in both runs; synthetic external observations; reads from writes included; seeds/EXPLAIN excluded", optimized, baseline: previous };
  writeFileSync(resolve(output, "read-costs.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify(results, null, 2));
  const reduction = 1 - optimized.find(row => row.size === 500).total.rowsRead / previous.find(row => row.size === 500).total.rowsRead;
  if (reduction < 0.8) throw new Error(`500-item read reduction ${(reduction * 100).toFixed(2)}% is below 80%`);
  console.log(`500-item read reduction: ${(reduction * 100).toFixed(2)}%. Evidence: ${output}`);
} finally {
  for (const file of generated) unlinkSync(file);
}
