import { readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("reads every canonical migration within the existing test time budget", async () => {
  const directory = path.resolve(import.meta.dirname, "../drizzle");
  const started = performance.now();
  const migrations = await readD1Migrations(directory);
  const elapsed = performance.now() - started;

  expect(migrations).toHaveLength(readdirSync(directory).filter(name => name.endsWith(".sql")).length);
  expect(migrations.every(migration => migration.queries.length > 0)).toBe(true);
  // A blocked event loop can prevent Vitest's five-second timer from firing.
  expect(elapsed).toBeLessThan(5_000);
});

it.each([
  ["BEGIN", "CASE", "END", " "],
  ["begin", "case", "end", "\n"],
  ["BeGiN", "CaSe", "EnD", "\t"],
  ["BEGIN", "CASE", "END", "\u00a0"],
])("preserves compound SQL, quoted markers and following statements (%s / %s / %s / %j)", async (begin, caseToken, end, space) => {
  const directory = mkdtempSync(path.join(tmpdir(), "otw-d1-splitter-"));
  temporaryDirectories.push(directory);
  const trigger = `CREATE TRIGGER audit AFTER INSERT ON sample${space}${begin}${space}
  INSERT INTO log(value) VALUES ( ${caseToken} WHEN new.value > 0 THEN 'BEGIN; END;' ELSE 'CASE' ${end} );
${end}`;
  const arithmetic = "SELECT 8 / 2 - 1 AS value";
  const body = "SELECT $body$BEGIN; CASE; END;$body$ AS body";
  const quoted = 'SELECT "BEGIN; END;", `CASE; END;` FROM sample';
  writeFileSync(path.join(directory, "0001_trigger.sql"), `${arithmetic};
-- BEGIN CASE END;
/* BEGIN CASE END; */
${trigger}; ${body}; ${quoted}; SELECT 'END; BEGIN;' AS value; SELECT 42;`);

  expect(await readD1Migrations(directory)).toEqual([{
    name: "0001_trigger.sql",
    queries: [arithmetic, trigger, body, quoted, "SELECT 'END; BEGIN;' AS value", "SELECT 42"],
  }]);
});

it("preserves long quoted bodies and multi-character dollar delimiters", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "otw-d1-quoted-"));
  temporaryDirectories.push(directory);
  const value = "value BEGIN; CASE; END; 한글😀 ".repeat(20_000);
  const queries = [`SELECT '${value}' AS quoted`, `SELECT $body$${value}$body$ AS dollar`, "SELECT 42"];
  writeFileSync(path.join(directory, "0001_long.sql"), queries.join("; ") + ";");
  expect(await readD1Migrations(directory)).toEqual([{name:"0001_long.sql",queries}]);
});
