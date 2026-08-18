import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import {
  getLocalDevServerConfig,
  resolveLocalD1PersistState,
  rewriteLocalSpaRequest,
} from "./scripts/local-dev-config.mjs";

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
export default defineConfig({
  server: getLocalDevServerConfig(),
  plugins: [
    spaDevRewrite(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    cloudflare({
      configPath: "./wrangler.jsonc",
      persistState: resolveLocalD1PersistState(),
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
        },
      },
    },
  },
});
