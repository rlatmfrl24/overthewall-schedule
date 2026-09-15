import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { syncAgentFiles } from "./sync-agent-to-cursor.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "otw-agent-sync-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(path.join(repo, ".agent"), path.join(root, ".agent"), { recursive: true });
  // Copy actual linked files; no stubs that could hide malformed canonical links.
  const visit = async (directory) => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await visit(file); continue; }
      if (!file.endsWith(".md")) continue;
      const content = await fs.readFile(file, "utf8");
      for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)\)/g)) {
        if (/^(?:[a-z]+:|#)/i.test(match[1])) continue;
        const target = path.resolve(path.dirname(file), decodeURIComponent(match[1].split("#")[0]));
        const relative = path.relative(root, target);
        assert.ok(!relative.startsWith(".."), `Link outside fixture: ${relative}`);
        try { await fs.access(target); }
        catch {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await fs.copyFile(path.join(repo, relative), target);
        }
      }
    }
  };
  await visit(path.join(root, ".agent"));
  assert.deepEqual((await syncAgentFiles({ root })).errors, []);
  return root;
}

test("generates portable entries and an idempotent mirror", async (t) => {
  const root = await fixture(t);
  const check = await syncAgentFiles({ root, check: true });
  assert.deepEqual(check.errors, []);
  assert.equal(check.expected, 26);
  assert.equal((await syncAgentFiles({ root })).written, 0);
  const entry = await fs.readFile(path.join(root, ".agents/skills/code-review-otw/SKILL.md"), "utf8");
  assert.ok(entry.includes("../../../.agent/skills/code-review/SKILL.md"));
});
test("missing source blocks generation without rewriting other files", async (t) => {
  const root = await fixture(t);
  const mirror = path.join(root, ".cursor/skills/release-ops/SKILL.md");
  await fs.writeFile(mirror, "keep until sources repaired");
  await fs.unlink(path.join(root, ".agent/skills/release-ops/SKILL.md"));
  const result = await syncAgentFiles({ root });
  assert.ok(result.errors.some((error) => error.includes("Missing source")));
  assert.equal(await fs.readFile(mirror, "utf8"), "keep until sources repaired");
});
test("stale mirrors and missing discovery entries fail check", async (t) => {
  const root = await fixture(t);
  await fs.appendFile(path.join(root, ".cursor/skills/release-ops/SKILL.md"), "\nstale\n");
  await fs.unlink(path.join(root, ".agents/skills/db-migration/SKILL.md"));
  const result = await syncAgentFiles({ root, check: true });
  assert.ok(result.errors.some((error) => error.includes(".cursor/skills/release-ops/SKILL.md")));
  assert.ok(result.errors.some((error) => error.includes(".agents/skills/db-migration/SKILL.md")));
});
test("identical canonical and mirror content cannot hide broken references", async (t) => {
  const root = await fixture(t);
  for (const directory of [".agent", ".cursor"]) {
    await fs.appendFile(path.join(root, directory, "skills/release-ops/SKILL.md"), "\n[Missing](references/no-such-file.md)\n");
  }
  assert.ok((await syncAgentFiles({ root, check: true })).errors.some((error) => error.includes("Broken link")));
});
test("unregistered skill files are reported, not removed", async (t) => {
  const root = await fixture(t);
  const extra = path.join(root, ".agents/skills/extra/SKILL.md");
  await fs.mkdir(path.dirname(extra), { recursive: true });
  await fs.writeFile(extra, "user content");
  assert.ok((await syncAgentFiles({ root, check: true })).errors.some((error) => error.includes("Unmanaged generated file")));
  assert.equal(await fs.readFile(extra, "utf8"), "user content");
});
