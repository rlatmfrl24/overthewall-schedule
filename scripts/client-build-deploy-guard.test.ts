import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyClientBuildForDeploy } from "./client-build-deploy-guard.mjs";

const temporaryDirectories: string[] = [];

const createClientBuild = (
  entrySource: string | null,
  entryPath = "/assets/index.js",
) => {
  const directory = mkdtempSync(path.join(tmpdir(), "otw-client-build-"));
  temporaryDirectories.push(directory);
  mkdirSync(path.join(directory, "assets"));
  writeFileSync(
    path.join(directory, "index.html"),
    `<script type="module" src="${entryPath}"></script>`,
  );
  if (entrySource !== null) {
    writeFileSync(path.join(directory, "assets", "index.js"), entrySource);
  }
  return directory;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("verifyClientBuildForDeploy", () => {
  it("accepts an entry bundle containing a Clerk publishable key", () => {
    const directory = createClientBuild(
      'const publishableKey = "pk_test_example_publishable_key_123";',
    );

    expect(verifyClientBuildForDeploy(directory)).toEqual({ entryScriptCount: 1 });
  });

  it("blocks a client build that omitted the Clerk publishable key", () => {
    const directory = createClientBuild("const publishableKey = undefined;");

    expect(() => verifyClientBuildForDeploy(directory)).toThrow(
      /does not contain a Clerk publishable key/,
    );
  });

  it("blocks an index that references a missing entry bundle", () => {
    const directory = createClientBuild(null);

    expect(() => verifyClientBuildForDeploy(directory)).toThrow(
      /entry script is missing/,
    );
  });
});
