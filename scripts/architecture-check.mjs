import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repositoryRoot = process.cwd();
const sourceRoots = ["src", "worker", "contracts", "db"]
  .map((directory) => path.join(repositoryRoot, directory))
  .filter((directory) => fs.existsSync(directory));
const errors = [];

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });

const relativePath = (file) =>
  path.relative(repositoryRoot, file).replaceAll("\\", "/");

const sourceFiles = sourceRoots.flatMap(walk);
const sourceFileSet = new Set(sourceFiles.map((file) => path.resolve(file)));
const productionFiles = sourceFiles.filter(
  (file) =>
    !/\.test\.[cm]?[jt]sx?$/.test(file) &&
    !/\.integration\.test\.[cm]?[jt]sx?$/.test(file) &&
    relativePath(file) !== "src/routeTree.gen.ts",
);
const productionFileSet = new Set(
  productionFiles.map((file) => path.resolve(file)),
);

const resolveLocalImport = (file, specifier) => {
  let basePath;
  if (specifier.startsWith("@/")) {
    basePath = path.join(repositoryRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith("@contracts/")) {
    basePath = path.join(repositoryRoot, "contracts", specifier.slice(11));
  } else if (specifier.startsWith("@db/")) {
    basePath = path.join(repositoryRoot, "db", specifier.slice(4));
  } else if (specifier.startsWith(".")) {
    basePath = path.resolve(path.dirname(file), specifier);
  } else {
    return null;
  }

  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    path.join(basePath, "index.ts"),
    path.join(basePath, "index.tsx"),
  ];
  return (
    candidates
      .map((candidate) => path.resolve(candidate))
      .find((candidate) => sourceFileSet.has(candidate)) ?? null
  );
};

const getFrontendCapability = (file) => {
  const match = relativePath(file).match(/^src\/features\/([^/]+)\//);
  return match?.[1] ?? null;
};

const getFrontendFeature = (file) => {
  const match = relativePath(file).match(
    /^src\/features\/([^/]+)\/(.+)$/,
  );
  if (!match) return null;

  const [, capability, featurePath] = match;
  return {
    capability,
    featurePath,
    isPublicIndex: /^index\.tsx?$/.test(featurePath),
  };
};

const getWorkerFeature = (file) => {
  const match = relativePath(file).match(
    /^worker\/features\/([^/]+)\/(.+)$/,
  );
  if (!match) return null;

  const [, capability, featurePath] = match;
  const layer = featurePath.split("/")[0];
  return {
    capability,
    featurePath,
    layer,
    isPublicIndex: /^index\.tsx?$/.test(featurePath),
  };
};

const isWorkerPlatformHttpModule = (target) =>
  /^worker\/platform\/(?:auth|types|http-helpers)\.tsx?$/.test(target) ||
  /^worker\/platform\/http\/.+\.tsx?$/.test(target);

const getImportedNames = (node) => {
  if (!ts.isImportDeclaration(node) || !node.importClause) return [];

  const names = [];
  if (node.importClause.name) names.push(node.importClause.name.text);
  const bindings = node.importClause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      names.push((element.propertyName ?? element.name).text);
    }
  }
  return names;
};

const addError = (file, node, message, sourceFile) => {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  errors.push(
    `${relativePath(file)}:${line + 1}:${character + 1} ${message}`,
  );
};

const dependencyGraph = new Map();

for (const file of sourceFiles) {
  if (file.endsWith(".d.ts")) continue;
  const content = fs.readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const normalized = relativePath(file);
  const capability = getFrontendCapability(file);
  const workerFeature = getWorkerFeature(file);
  const isProduction = productionFileSet.has(path.resolve(file));
  const isWorkerInnerLayer =
    isProduction &&
    workerFeature &&
    ["domain", "application", "ports"].includes(workerFeature.layer);
  const isWorkerDomainLayer =
    isProduction && workerFeature?.layer === "domain";
  const isWorkerApplicationLayer =
    isProduction &&
    workerFeature &&
    ["application", "ports"].includes(workerFeature.layer);
  const isWorkerHttpLayer =
    isProduction && workerFeature?.layer === "http";
  const isWorkerInfrastructureLayer =
    workerFeature?.layer === "infrastructure";
  const isWorkerApp =
    isProduction && normalized.startsWith("worker/app/");
  const isFrontendComposition =
    isProduction &&
    (normalized.startsWith("src/routes/") ||
      normalized.startsWith("src/app/"));

  const registerDependency = (node, specifier) => {
    const resolvedImport = resolveLocalImport(file, specifier);
    if (
      !isProduction ||
      !resolvedImport ||
      !productionFileSet.has(path.resolve(resolvedImport))
    ) {
      return resolvedImport;
    }

    const dependencies = dependencyGraph.get(path.resolve(file)) ?? [];
    dependencies.push(resolvedImport);
    dependencyGraph.set(path.resolve(file), dependencies);
    return resolvedImport;
  };

  const checkModuleBoundary = (node, specifier, resolvedImport) => {
    const targetNormalized = resolvedImport
      ? relativePath(resolvedImport)
      : null;
    const targetFrontendFeature = resolvedImport
      ? getFrontendFeature(resolvedImport)
      : null;
    const targetWorkerFeature = resolvedImport
      ? getWorkerFeature(resolvedImport)
      : null;

    if (
      isFrontendComposition &&
      targetFrontendFeature &&
      !targetFrontendFeature.isPublicIndex
    ) {
      addError(
        file,
        node,
        `Frontend route/app은 feature 공개 index만 import해야 합니다: ${specifier}`,
        sourceFile,
      );
    }

    if (
      isProduction &&
      workerFeature &&
      targetWorkerFeature &&
      targetWorkerFeature.capability !== workerFeature.capability &&
      !targetWorkerFeature.isPublicIndex
    ) {
      addError(
        file,
        node,
        `Worker capability 간 참조는 공개 index만 사용해야 합니다: ${specifier}`,
        sourceFile,
      );
    }

    if (isWorkerDomainLayer && targetWorkerFeature) {
      const importsAnotherCapability =
        targetWorkerFeature.capability !== workerFeature.capability;
      const importsOuterOwnLayer =
        !importsAnotherCapability &&
        (targetWorkerFeature.isPublicIndex ||
          ["application", "http", "infrastructure", "ports"].includes(
            targetWorkerFeature.layer,
          ));

      if (importsAnotherCapability || importsOuterOwnLayer) {
        addError(
          file,
          node,
          `Worker domain은 같은 capability의 domain만 import할 수 있습니다: ${specifier}`,
          sourceFile,
        );
      }
    }

    if (isWorkerApplicationLayer && targetWorkerFeature) {
      const importsAnotherCapability =
        targetWorkerFeature.capability !== workerFeature.capability;
      const importsDisallowedOwnLayer =
        !importsAnotherCapability &&
        (targetWorkerFeature.isPublicIndex ||
          !["application", "domain", "ports"].includes(
            targetWorkerFeature.layer,
          ));

      if (importsAnotherCapability || importsDisallowedOwnLayer) {
        addError(
          file,
          node,
          `Worker application/ports는 같은 capability의 application/domain만 import할 수 있습니다: ${specifier}`,
          sourceFile,
        );
      }
    }

    if (
      isProduction &&
      workerFeature?.layer === "infrastructure" &&
      targetWorkerFeature?.capability === workerFeature.capability &&
      (targetWorkerFeature.isPublicIndex ||
        targetWorkerFeature.layer === "http")
    ) {
      addError(
        file,
        node,
        `Worker infrastructure는 같은 capability의 http/index를 import할 수 없습니다: ${specifier}`,
        sourceFile,
      );
    }

    if (
      isWorkerApp &&
      targetWorkerFeature &&
      !targetWorkerFeature.isPublicIndex
    ) {
      addError(
        file,
        node,
        `Worker app은 feature 공개 index만 import해야 합니다: ${specifier}`,
        sourceFile,
      );
    }

    if (isWorkerHttpLayer) {
      if (
        targetWorkerFeature?.capability === workerFeature.capability &&
        (targetWorkerFeature.isPublicIndex ||
          targetWorkerFeature.layer === "infrastructure")
      ) {
        addError(
          file,
          node,
          `Worker http 계층은 같은 capability의 infrastructure/index를 import할 수 없습니다: ${specifier}`,
          sourceFile,
        );
      }

      if (
        targetNormalized?.startsWith("worker/platform/") &&
        !isWorkerPlatformHttpModule(targetNormalized)
      ) {
        addError(
          file,
          node,
          `Worker http 계층은 platform HTTP/auth/types만 import할 수 있습니다: ${specifier}`,
          sourceFile,
        );
      }

      if (
        specifier === "@db" ||
        specifier.startsWith("@db/") ||
        specifier === "drizzle-orm" ||
        specifier.startsWith("drizzle-orm/") ||
        getImportedNames(node).includes("getDb")
      ) {
        addError(
          file,
          node,
          `Worker http 계층은 DB/Drizzle/getDb를 import할 수 없습니다: ${specifier}`,
          sourceFile,
        );
      }
    }

    if (isWorkerInnerLayer) {
      const importsRuntimeAdapter =
        specifier === "@db" ||
        specifier.startsWith("@db/") ||
        specifier === "drizzle-orm" ||
        specifier.startsWith("drizzle-orm/") ||
        targetNormalized?.startsWith("worker/platform/") ||
        (targetWorkerFeature &&
          ["infrastructure", "http"].includes(targetWorkerFeature.layer));

      if (importsRuntimeAdapter) {
        addError(
          file,
          node,
          `Worker 내부 계층에서 runtime adapter import를 사용할 수 없습니다: ${specifier}`,
          sourceFile,
        );
      }
    }
  };

  const checkImport = (node, specifier) => {
    const resolvedImport = registerDependency(node, specifier);

    if (
      normalized.startsWith("src/") &&
      (specifier.includes("/db/") ||
        specifier.startsWith("db/") ||
        specifier.startsWith("@db/") ||
        specifier.includes("worker/") ||
        specifier.includes("drizzle-orm"))
    ) {
      addError(
        file,
        node,
        `frontend에서 persistence/Worker import를 사용할 수 없습니다: ${specifier}`,
        sourceFile,
      );
    }

    if (capability && specifier.startsWith("@/features/")) {
      const [, targetCapability, nested] =
        specifier.match(/^@\/features\/([^/]+)(\/.*)?$/) ?? [];
      if (
        targetCapability &&
        targetCapability !== capability &&
        nested
      ) {
        addError(
          file,
          node,
          `feature 간 참조는 공개 index만 사용해야 합니다: ${specifier}`,
          sourceFile,
        );
      }
    }

    if (capability && specifier.startsWith(".") && resolvedImport) {
      const targetCapability = getFrontendCapability(resolvedImport);
      if (targetCapability && targetCapability !== capability) {
        addError(
          file,
          node,
          `feature 간 상대 경로 참조를 사용할 수 없습니다: ${specifier}`,
          sourceFile,
        );
      }
    }

    checkModuleBoundary(node, specifier, resolvedImport);
  };

  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const specifier = node.moduleSpecifier.text;
      checkImport(node, specifier);
    }

    if (
      isProduction &&
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const specifierNode = node.arguments[0];
      if (!specifierNode || !ts.isStringLiteralLike(specifierNode)) {
        addError(
          file,
          node,
          "dynamic import: statically analyzable specifier required",
          sourceFile,
        );
      } else {
        checkImport(node, specifierNode.text);
      }
    }

    if (
      isWorkerInnerLayer &&
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      (["Request", "Response", "Env"].includes(node.typeName.text) ||
        node.typeName.text.startsWith("D1"))
    ) {
      addError(
        file,
        node,
        `Worker 내부 계층에 runtime 타입 ${node.typeName.text}을 둘 수 없습니다`,
        sourceFile,
      );
    }

    if (
      isProduction &&
      workerFeature &&
      !isWorkerInfrastructureLayer &&
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "prepare"
    ) {
      addError(
        file,
        node,
        "raw D1 SQL은 infrastructure 계층에만 둘 수 있습니다",
        sourceFile,
      );
    }

    if (
      isProduction &&
      workerFeature &&
      !isWorkerInfrastructureLayer &&
      ts.isCallExpression(node) &&
      ((ts.isIdentifier(node.expression) && node.expression.text === "fetch") ||
        (ts.isPropertyAccessExpression(node.expression) &&
          ["globalThis", "self"].includes(
            node.expression.expression.getText(sourceFile),
          ) &&
          node.expression.name.text === "fetch"))
    ) {
      addError(
        file,
        node,
        "직접 external fetch 호출은 infrastructure 계층에만 둘 수 있습니다",
        sourceFile,
      );
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

const forbiddenLegacyDirectories = [
  "src/components",
  "src/hooks",
  "src/lib/api",
  "src/db",
  "worker/routes",
  "worker/services",
  "worker/repositories",
  "worker/use-cases",
];
for (const directory of forbiddenLegacyDirectories) {
  const absolute = path.join(repositoryRoot, directory);
  if (fs.existsSync(absolute) && walk(absolute).length > 0) {
    errors.push(`${directory}: legacy 수평 계층이 남아 있습니다`);
  }
}

const visited = new Set();
const active = new Set();
const stack = [];
const reportedCycles = new Set();

const findCycles = (file) => {
  const resolvedFile = path.resolve(file);
  if (active.has(resolvedFile)) {
    const cycleStart = stack.indexOf(resolvedFile);
    const cycle = [...stack.slice(cycleStart), resolvedFile].map(relativePath);
    const key = [...new Set(cycle)].sort().join("|");
    if (!reportedCycles.has(key)) {
      errors.push(`production import cycle: ${cycle.join(" -> ")}`);
      reportedCycles.add(key);
    }
    return;
  }
  if (visited.has(resolvedFile)) return;

  visited.add(resolvedFile);
  active.add(resolvedFile);
  stack.push(resolvedFile);
  for (const dependency of dependencyGraph.get(resolvedFile) ?? []) {
    findCycles(dependency);
  }
  stack.pop();
  active.delete(resolvedFile);
};

for (const file of productionFiles) findCycles(file);

if (errors.length > 0) {
  console.error("Architecture check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Architecture check passed.");
