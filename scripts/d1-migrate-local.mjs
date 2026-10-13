import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { resolveLocalD1Options, buildD1LocationArgs } from "./d1-local-options.mjs";

const target = resolveLocalD1Options(process.argv.slice(2));
const result = spawnSync(process.execPath, [resolve("node_modules/wrangler/bin/wrangler.js"), "d1", "migrations", "apply", "otw_db", "--config", target.configPath, ...buildD1LocationArgs("local", target.persistTo)], { stdio: "inherit" });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
