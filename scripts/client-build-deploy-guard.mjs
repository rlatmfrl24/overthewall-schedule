import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const CLERK_PUBLISHABLE_KEY_PATTERN = /pk_(?:test|live)_[A-Za-z0-9_-]{10,}/;
const ENTRY_SCRIPT_PATTERN = /<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/g;

export const verifyClientBuildForDeploy = (
  clientDirectory = path.resolve("dist/client"),
) => {
  const indexPath = path.join(clientDirectory, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(
      `Client build is missing ${indexPath}. Run the production build before deploying.`,
    );
  }

  const indexHtml = readFileSync(indexPath, "utf8");
  const entryScriptUrls = Array.from(
    indexHtml.matchAll(ENTRY_SCRIPT_PATTERN),
    (match) => match[1],
  );
  if (entryScriptUrls.length === 0) {
    throw new Error("Client build index.html does not reference an entry script.");
  }

  const clientRoot = path.resolve(clientDirectory);
  const entryScripts = entryScriptUrls.map((scriptUrl) => {
    const relativePath = scriptUrl.split("?", 1)[0].replace(/^\/+/, "");
    const scriptPath = path.resolve(clientRoot, relativePath);
    if (
      scriptPath !== clientRoot &&
      !scriptPath.startsWith(`${clientRoot}${path.sep}`)
    ) {
      throw new Error(`Client entry script escapes the build root: ${scriptUrl}`);
    }
    if (!existsSync(scriptPath)) {
      throw new Error(`Client entry script is missing: ${scriptPath}`);
    }
    return readFileSync(scriptPath, "utf8");
  });

  if (!entryScripts.some((source) => CLERK_PUBLISHABLE_KEY_PATTERN.test(source))) {
    throw new Error(
      "Client build does not contain a Clerk publishable key. Rebuild with VITE_CLERK_PUBLISHABLE_KEY before deploying.",
    );
  }

  return { entryScriptCount: entryScripts.length };
};
