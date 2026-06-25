import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = resolve(extensionRoot, "dist");
const manifestPath = resolve(distDir, "manifest.json");

const getTarget = () => {
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const target = targetArg?.split("=")[1] ?? "store";

  if (target !== "dev" && target !== "store") {
    throw new Error(`Unknown extension validation target: ${target}`);
  }

  return target;
};

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const exists = async (file) => {
  try {
    const fileStat = await stat(file);
    return fileStat.isFile();
  } catch {
    return false;
  }
};

const walkFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? walkFiles(path) : path;
    }),
  );

  return files.flat();
};

const getContentScriptMatches = (manifest) =>
  (manifest.content_scripts ?? []).flatMap((script) => script.matches ?? []);

const getContentScriptFiles = (manifest) =>
  (manifest.content_scripts ?? []).flatMap((script) => script.js ?? []);

const extractHtmlAssetReferences = async (file) => {
  const html = await readFile(resolve(distDir, file), "utf8");
  const references = [];
  const patterns = [
    /<script\b[^>]*\bsrc="([^"]+)"/giu,
    /<link\b[^>]*\bhref="([^"]+)"/giu,
    /<img\b[^>]*\bsrc="([^"]+)"/giu,
  ];

  patterns.forEach((pattern) => {
    for (const match of html.matchAll(pattern)) {
      const reference = match[1];
      if (!reference || reference.startsWith("http")) continue;
      references.push(reference);
    }
  });

  return references;
};

const hasLocalhost = (pattern) =>
  pattern.includes("localhost") || pattern.includes("127.0.0.1");

const validateManifestFiles = async (manifest) => {
  const requiredFiles = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    ...getContentScriptFiles(manifest),
    ...Object.values(manifest.icons ?? {}),
  ].filter(Boolean);

  if (manifest.action?.default_popup) {
    requiredFiles.push(
      ...(await extractHtmlAssetReferences(manifest.action.default_popup)),
    );
  }

  await Promise.all(
    requiredFiles.map(async (file) => {
      const absolutePath = resolve(distDir, file);
      assert(
        await exists(absolutePath),
        `Manifest references missing file: ${file}`,
      );
      assert(
        !/^https?:\/\//u.test(file),
        `Manifest must not reference remote code or assets: ${file}`,
      );
    }),
  );
};

const validateStoreManifest = async (manifest) => {
  const hostPermissions = manifest.host_permissions ?? [];
  const optionalHostPermissions = manifest.optional_host_permissions ?? [];
  const matches = getContentScriptMatches(manifest);
  const permissions = manifest.permissions ?? [];
  const optionalPermissions = manifest.optional_permissions ?? [];
  const allHostPatterns = [
    ...hostPermissions,
    ...optionalHostPermissions,
    ...matches,
  ];
  const allPermissions = [...permissions, ...optionalPermissions];

  assert(
    !allHostPatterns.some(hasLocalhost),
    "Store manifest must not include localhost or 127.0.0.1 permissions",
  );
  assert(
    !allHostPatterns.includes("https://*.naver.com/*"),
    "Store manifest must narrow Naver access instead of using https://*.naver.com/*",
  );
  assert(
    !allPermissions.includes("declarativeNetRequestWithHostAccess"),
    "Store manifest must not include declarativeNetRequestWithHostAccess",
  );
  assert(
    permissions.includes("storage"),
    "Store manifest must include storage as a required permission",
  );
  assert(
    !permissions.includes("cookies"),
    "Store manifest must request cookies only as an optional permission",
  );
  assert(
    optionalPermissions.includes("cookies"),
    "Store manifest must include cookies as an optional permission",
  );
  assert(
    !manifest.externally_connectable,
    "Store manifest must not expose externally_connectable",
  );
  assert(
    !hostPermissions.includes("https://nid.naver.com/*"),
    "Store manifest must request the Naver login host only as an optional host permission",
  );
  assert(
    optionalHostPermissions.includes("https://nid.naver.com/*"),
    "Store manifest must include the narrow Naver login host as an optional host permission",
  );
  assert(
    hostPermissions.includes("https://chzzk.naver.com/*"),
    "Store manifest must include CHZZK host permission",
  );
  assert(
    hostPermissions.includes("https://otw-schedule.info/*"),
    "Store manifest must include OTW production host permission",
  );

  const files = await walkFiles(distDir);
  const sourceMaps = files.filter((file) => file.endsWith(".map"));
  assert(
    sourceMaps.length === 0,
    `Store build must not include source maps: ${sourceMaps
      .map((file) => relative(distDir, file))
      .join(", ")}`,
  );

  await Promise.all(
    files
      .filter((file) => file.endsWith(".js"))
      .map(async (file) => {
        const source = await readFile(file, "utf8");
        assert(
          !source.includes("sourceMappingURL="),
          `Store JS must not reference source maps: ${relative(distDir, file)}`,
        );
      }),
  );
};

const target = getTarget();
const manifest = await readJson(manifestPath);

assert(manifest.manifest_version === 3, "Extension must use Manifest V3");
assert(typeof manifest.name === "string" && manifest.name.length > 0, "Missing name");
assert(
  typeof manifest.description === "string" && manifest.description.length > 0,
  "Missing description",
);
assert(
  manifest.description.length <= 132,
  "Manifest description must be 132 characters or fewer",
);
assert(typeof manifest.version === "string", "Missing version");
assert(manifest.background?.service_worker, "Missing background service worker");
assert(manifest.icons?.["16"], "Missing 16px icon");
assert(manifest.icons?.["32"], "Missing 32px icon");
assert(manifest.icons?.["48"], "Missing 48px icon");
assert(manifest.icons?.["128"], "Missing 128px icon");

await validateManifestFiles(manifest);

if (target === "store") {
  await validateStoreManifest(manifest);
}

console.log(`Validated ${target} extension manifest ${manifest.version}`);
