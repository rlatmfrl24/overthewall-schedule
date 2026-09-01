import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getClerkPublishableKeyKind } from "./clerk-environment.mjs";

const CLERK_PUBLISHABLE_KEY_PATTERN = /pk_(?:test|live)_[A-Za-z0-9_-]{10,}/g;
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

  const clerkKeyKinds = new Set(
    entryScripts.flatMap((source) =>
      Array.from(source.matchAll(CLERK_PUBLISHABLE_KEY_PATTERN), (match) =>
        getClerkPublishableKeyKind(match[0]),
      ),
    ),
  );

  if (clerkKeyKinds.has("development")) {
    throw new Error(
      "Client build contains a Clerk development key. Production deploys require VITE_CLERK_PUBLISHABLE_KEY with a pk_live value.",
    );
  }

  if (!clerkKeyKinds.has("production")) {
    throw new Error(
      "Client build does not contain a Clerk production publishable key. Rebuild with VITE_CLERK_PUBLISHABLE_KEY before deploying.",
    );
  }

  return { entryScriptCount: entryScripts.length };
};
