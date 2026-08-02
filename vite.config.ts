import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const SPA_DEV_ROUTE = /^\/(?:weekly|notice|vods(?:\/.*)?|multiview|feed|snapshot|cafe|profile\/[^/]+|admin(?:\/.*)?)\/?$/;

const spaDevRewrite = () => ({
  name: "otw-spa-dev-rewrite",
  apply: "serve" as const,
  configureServer(server: { middlewares: { use: (handler: (request: { method?: string; url?: string; headers: { accept?: string } }, _response: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((request, _response, next) => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (
        request.method === "GET" &&
        request.headers.accept?.includes("text/html") &&
        SPA_DEV_ROUTE.test(url.pathname)
      ) {
        request.url = `/${url.search}`;
      }
      next();
    });
  },
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    spaDevRewrite(),
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    cloudflare({
      configPath: "./wrangler.jsonc",
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
