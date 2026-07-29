import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const architectureCheckPath = fileURLToPath(
  new URL("./architecture-check.mjs", import.meta.url),
);
const fixtureRoots: string[] = [];

const createFilesFixture = (files: ReadonlyMap<string, string>) => {
  const root = mkdtempSync(path.join(tmpdir(), "otw-architecture-check-"));
  fixtureRoots.push(root);

  for (const [relativePath, content] of files) {
    const target = path.join(root, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  }

  return root;
};

const createFixture = ({
  importer,
  specifier,
}: {
  importer: string;
  specifier: string;
}) =>
  createFilesFixture(
    new Map([
      [
        "src/features/members/index.ts",
        'export { MemberPage } from "./ui/member-page";\n',
      ],
      [
        "src/features/members/ui/member-page.ts",
        "export const MemberPage = {};\n",
      ],
      [
        importer,
        `import { MemberPage } from "${specifier}";\nvoid MemberPage;\n`,
      ],
    ]),
  );

const runArchitectureCheck = (root: string) =>
  spawnSync(process.execPath, [architectureCheckPath], {
    cwd: root,
    encoding: "utf8",
  });

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("architecture-check frontend composition boundaries", () => {
  it.each(["src/routes/profile.ts", "src/app/layout/navigation.ts"])(
    "rejects a feature deep import from %s",
    (importer) => {
      const root = createFixture({
        importer,
        specifier: "@/features/members/ui/member-page",
      });

      const result = runArchitectureCheck(root);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Frontend route/app은 feature 공개 index만 import해야 합니다",
      );
      expect(result.stderr).toContain(importer);
    },
  );

  it("allows a feature public index import", () => {
    const root = createFixture({
      importer: "src/routes/profile.ts",
      specifier: "@/features/members",
    });

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Architecture check passed.");
  });

  it("rejects a dynamic cross-feature private import", () => {
    const root = createFilesFixture(
      new Map([
        [
          "src/features/members/ui/member-page.ts",
          "export const MemberPage = {};\n",
        ],
        [
          "src/features/schedule-board/ui/lazy-member.ts",
          'void import("@/features/members/ui/member-page");\n',
        ],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "feature 간 참조는 공개 index만 사용해야 합니다",
    );
    expect(result.stderr).toContain(
      "src/features/schedule-board/ui/lazy-member.ts",
    );
  });

  it("rejects a template literal dynamic cross-feature private import", () => {
    const root = createFilesFixture(
      new Map([
        [
          "src/features/members/ui/member-page.ts",
          "export const MemberPage = {};\n",
        ],
        [
          "src/features/schedule-board/ui/lazy-member.ts",
          "void import(`@/features/members/ui/member-page`);\n",
        ],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "feature 간 참조는 공개 index만 사용해야 합니다",
    );
    expect(result.stderr).toContain(
      "src/features/schedule-board/ui/lazy-member.ts",
    );
  });

  it("rejects a dynamic relative cross-feature import", () => {
    const root = createFilesFixture(
      new Map([
        [
          "src/features/members/ui/member-page.ts",
          "export const MemberPage = {};\n",
        ],
        [
          "src/features/schedule-board/ui/lazy-member.ts",
          'void import("../../members/ui/member-page");\n',
        ],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "feature 간 상대 경로 참조를 사용할 수 없습니다",
    );
    expect(result.stderr).toContain(
      "src/features/schedule-board/ui/lazy-member.ts",
    );
  });

  it("rejects a dynamic frontend persistence import", () => {
    const root = createFilesFixture(
      new Map([
        ["db/schema/index.ts", "export const schema = {};\n"],
        ["src/routes/lazy-db.ts", 'void import("@db/schema");\n'],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "frontend에서 persistence/Worker import를 사용할 수 없습니다",
    );
    expect(result.stderr).toContain("src/routes/lazy-db.ts");
  });

  it("rejects a computed production dynamic import specifier", () => {
    const root = createFilesFixture(
      new Map([
        [
          "src/shared/lib/lazy.ts",
          'const segment = "module";\nvoid import(`./${segment}`);\n',
        ],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "dynamic import: statically analyzable specifier required",
    );
    expect(result.stderr).toContain("src/shared/lib/lazy.ts");
  });
});

describe("architecture-check production cycle detection", () => {
  it("rejects a cycle composed of dynamic imports", () => {
    const root = createFilesFixture(
      new Map([
        ["src/shared/lib/a.ts", 'void import("./b");\n'],
        ["src/shared/lib/b.ts", 'void import("./a");\n'],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production import cycle:");
    expect(result.stderr).toContain("src/shared/lib/a.ts");
    expect(result.stderr).toContain("src/shared/lib/b.ts");
  });

  it("rejects a cycle composed of template literal dynamic imports", () => {
    const root = createFilesFixture(
      new Map([
        ["src/shared/lib/a.ts", "void import(`./b`);\n"],
        ["src/shared/lib/b.ts", "void import(`./a`);\n"],
      ]),
    );

    const result = runArchitectureCheck(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("production import cycle:");
    expect(result.stderr).toContain("src/shared/lib/a.ts");
    expect(result.stderr).toContain("src/shared/lib/b.ts");
  });
});
