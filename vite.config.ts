import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import {
  getLocalDevServerConfig,
  getLocalDevOrigin,
  resolveLocalD1PersistState,
  rewriteLocalSpaRequest,
} from "./scripts/local-dev-config.mjs";
import {
  assertClerkSiteIdentity,
  resolveClerkEnvironmentTarget,
} from "./scripts/clerk-environment.mjs";
import { getSiteDefinition, parseSiteId } from "./contracts/site-definition";
import { resolveSiteSeo } from "./contracts/site-seo";
import { renderRobots, renderSeoDocument } from "./scripts/generate-seo-assets";
import { getSiteTarget, getSiteEnvDirectory, loadSiteEnvironment, resolveSiteOrigin } from "./scripts/site-target.mjs";
import { writeLocalSiteConfig } from "./scripts/local-site-config.mjs";

const spaDevRewrite = () => ({
  name: "otw-spa-dev-rewrite",
  enforce: "pre" as const,
  apply: "serve" as const,
  configureServer(server: { middlewares: { use: (handler: (request: { method?: string; originalUrl?: string; url?: string; headers: { accept?: string } }, _response: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((request, _response, next) => {
      rewriteLocalSpaRequest(request);
      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ command, mode, isPreview }) => {
  const siteId = parseSiteId(process.env.SITE_ID);
  const target = getSiteTarget(siteId);
  const environment = loadSiteEnvironment(siteId, mode);
  const clerkTarget = resolveClerkEnvironmentTarget({
    command,
    mode,
    isPreview,
  });
  if (clerkTarget) {
    const issuer = assertClerkSiteIdentity({
      publishableKey: environment.VITE_CLERK_PUBLISHABLE_KEY,
      issuer: environment.CLERK_ISSUER,
      target: clerkTarget,
    });
    const other = loadSiteEnvironment(siteId === "otw" ? "luvdia" : "otw", mode);
    if ((other.CLERK_ISSUER && new URL(other.CLERK_ISSUER).origin === issuer) || other.VITE_CLERK_PUBLISHABLE_KEY === environment.VITE_CLERK_PUBLISHABLE_KEY) throw new Error("Sites must use separate Clerk app identities.");
  }
  const local = command === "serve" && !isPreview;
  const publicOrigin = local ? getLocalDevOrigin(process.env, siteId) : resolveSiteOrigin(siteId, environment);
  const site = { ...getSiteDefinition(siteId), publicOrigin };
  const configPath = local ? writeLocalSiteConfig(siteId, environment) : target.configPath;

  return {
    envDir: getSiteEnvDirectory(siteId),
    // Expose only the approved public inputs; ambient VITE_* values cannot replace them.
    envPrefix: "__SITE_PUBLIC_INPUTS_ONLY__",
    define: {
      "import.meta.env.VITE_SITE_ID": JSON.stringify(siteId),
      "import.meta.env.VITE_PUBLIC_ORIGIN": JSON.stringify(publicOrigin),
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(environment.VITE_CLERK_PUBLISHABLE_KEY),
      "import.meta.env.VITE_CLERK_ISSUER": JSON.stringify(environment.CLERK_ISSUER),
    },
    server: {
      ...getLocalDevServerConfig(process.env, siteId),
      // Reports and local tool downloads must not trigger application reloads.
      watch: { ignored: ["**/coverage/**", "**/.tmp/**"] },
    },
    plugins: [
      {
        name: "site-seo-shell",
        transformIndexHtml: (html: string) => renderSeoDocument(html, resolveSiteSeo("/", site), site),
        configureServer(server) {
          server.middlewares.use((request, response, next) => {
            if (request.url?.split("?")[0] !== "/robots.txt") return next();
            response.setHeader("Content-Type", "text/plain; charset=utf-8");
            response.end(renderRobots(site));
          });
        },
      },
      spaDevRewrite(),
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
      }),
      react(),
      cloudflare({
        configPath,
        persistState: resolveLocalD1PersistState(process.env, siteId),
        remoteBindings: false,
        inspectorPort: siteId === "otw" ? 9229 : 9230,
      }),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@contracts": path.resolve(__dirname, "./contracts"),
        "@db": path.resolve(__dirname, "./db"),
      },
    },
    build: {
      outDir: target.outputRoot,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, "/");
            if (!normalizedId.includes("/node_modules/")) return;
            if (normalizedId.includes("/node_modules/@clerk/")) return "clerk";
            if (normalizedId.includes("/node_modules/@tanstack/")) return "tanstack";
            if (normalizedId.includes("/node_modules/@radix-ui/")) return "radix";
            if (normalizedId.includes("/node_modules/motion/")) return "motion";
            if (
              normalizedId.includes("/node_modules/react/") ||
              normalizedId.includes("/node_modules/react-dom/") ||
              normalizedId.includes("/node_modules/scheduler/")
            ) {
              return "react";
            }
          }
        },
      },
    },
  };
});
