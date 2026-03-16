#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";

const isCheckMode = process.argv.includes("--check");
const repoRoot = process.cwd();

const mappings = [
  {
    source: ".agent/rules/project-standards.md",
    target: ".cursor/rules/project-standards.mdc",
  },
  {
    source: ".agent/rules/drizzle-workflow.md",
    target: ".cursor/rules/drizzle-workflow.mdc",
  },
  {
    source: ".agent/skills/code-review/SKILL.md",
    target: ".cursor/skills/code-review-otw/SKILL.md",
  },
  {
    source: ".agent/skills/code-review/agents/openai.yaml",
    target: ".cursor/skills/code-review-otw/agents/openai.yaml",
  },
  {
    source: ".agent/skills/db-migration/SKILL.md",
    target: ".cursor/skills/db-migration/SKILL.md",
  },
  {
    source: ".agent/skills/db-migration/references/checklist.md",
    target: ".cursor/skills/db-migration/references/checklist.md",
  },
  {
    source: ".agent/skills/db-migration/agents/openai.yaml",
    target: ".cursor/skills/db-migration/agents/openai.yaml",
  },
  {
    source: ".agent/skills/worker-api-change/SKILL.md",
    target: ".cursor/skills/worker-api-change/SKILL.md",
  },
  {
    source: ".agent/skills/worker-api-change/references/touchpoints.md",
    target: ".cursor/skills/worker-api-change/references/touchpoints.md",
  },
  {
    source: ".agent/skills/worker-api-change/agents/openai.yaml",
    target: ".cursor/skills/worker-api-change/agents/openai.yaml",
  },
  {
    source: ".agent/skills/release-ops/SKILL.md",
    target: ".cursor/skills/release-ops/SKILL.md",
  },
  {
    source: ".agent/skills/release-ops/references/preflight-checklist.md",
    target: ".cursor/skills/release-ops/references/preflight-checklist.md",
  },
  {
    source: ".agent/skills/release-ops/agents/openai.yaml",
    target: ".cursor/skills/release-ops/agents/openai.yaml",
  },
];

const readTextFile = async (filePath) => {
  return fs.readFile(filePath, "utf8");
};

const tryReadTextFile = async (filePath) => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const ensureDirectory = async (filePath) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
};

const relativePath = (absolutePath) => {
  return path.relative(repoRoot, absolutePath).replace(/\\/g, "/");
};

const run = async () => {
  let syncedCount = 0;
  let unchangedCount = 0;
  const driftPaths = [];
  const missingSources = [];

  for (const mapping of mappings) {
    const sourcePath = path.resolve(repoRoot, mapping.source);
    const targetPath = path.resolve(repoRoot, mapping.target);

    let sourceContent;
    try {
      sourceContent = await readTextFile(sourcePath);
    } catch {
      missingSources.push(relativePath(sourcePath));
      continue;
    }

    const targetContent = await tryReadTextFile(targetPath);
    if (targetContent === sourceContent) {
      unchangedCount += 1;
      continue;
    }

    if (isCheckMode) {
      driftPaths.push(relativePath(targetPath));
      continue;
    }

    await ensureDirectory(targetPath);
    await fs.writeFile(targetPath, sourceContent, "utf8");
    syncedCount += 1;
    console.log(
      `[sync] ${relativePath(sourcePath)} -> ${relativePath(targetPath)}`,
    );
  }

  if (missingSources.length > 0) {
    console.error("[error] Missing source files:");
    for (const source of missingSources) {
      console.error(`  - ${source}`);
    }
  }

  if (isCheckMode) {
    if (driftPaths.length > 0) {
      console.error("[drift] Cursor mirror is out of date:");
      for (const driftPath of driftPaths) {
        console.error(`  - ${driftPath}`);
      }
    }

    if (driftPaths.length === 0 && missingSources.length === 0) {
      console.log(
        `[ok] Mirror check passed (${unchangedCount} files in sync, 0 drift)`,
      );
      return;
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `[done] Synced ${syncedCount} files, ${unchangedCount} already up to date`,
  );

  if (missingSources.length > 0) {
    process.exitCode = 1;
  }
};

run().catch((error) => {
  console.error("[error] Sync failed:", error);
  process.exitCode = 1;
});
