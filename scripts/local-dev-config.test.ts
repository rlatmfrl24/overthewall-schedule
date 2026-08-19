import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_DEV_PORT,
  getLocalDevOrigin,
  getLocalDevServerConfig,
  parseLocalDevPort,
  resolveLocalD1PersistState,
  resolveLocalDevPort,
  rewriteLocalSpaRequest,
} from "./local-dev-config.mjs";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

describe("local development server config", () => {
  it("uses one stable default for Vite and local API checks", () => {
    expect(DEFAULT_LOCAL_DEV_PORT).toBe(5173);
    expect(resolveLocalDevPort({})).toBe(5173);
    expect(getLocalDevServerConfig({})).toEqual({
      host: "localhost",
      port: 5173,
      strictPort: true,
    });
    expect(getLocalDevOrigin({})).toBe("http://localhost:5173");
  });

  it("applies OTW_DEV_PORT consistently", () => {
    const environment = { OTW_DEV_PORT: " 5180 " };

    expect(resolveLocalDevPort(environment)).toBe(5180);
    expect(getLocalDevServerConfig(environment).port).toBe(5180);
    expect(getLocalDevOrigin(environment)).toBe("http://localhost:5180");
  });

  it("uses an isolated D1 state only when explicitly configured", () => {
    expect(resolveLocalD1PersistState({})).toBe(true);
    expect(
      resolveLocalD1PersistState({
        OTW_D1_PERSIST_TO: " C:/tmp/otw-play-pr6 ",
      }),
    ).toEqual({ path: "C:/tmp/otw-play-pr6" });
  });

  it("rewrites nested SPA requests for both Vite and the Worker proxy", () => {
    const request = {
      method: "GET",
      url: "/play/songs/example?performance=performance-1",
      originalUrl: "/play/songs/example?performance=performance-1",
      headers: { accept: "text/html,application/xhtml+xml" },
    };

    expect(rewriteLocalSpaRequest(request)).toBe(true);
    expect(request.url).toBe("/?performance=performance-1");
    expect(request.originalUrl).toBe("/?performance=performance-1");
  });

  it("rewrites the rights page for direct local navigation and refresh", () => {
    const request = {
      method: "GET",
      url: "/rights",
      originalUrl: "/rights",
      headers: { accept: "text/html,application/xhtml+xml" },
    };

    expect(rewriteLocalSpaRequest(request)).toBe(true);
    expect(request.url).toBe("/");
    expect(request.originalUrl).toBe("/");
  });

  it("does not rewrite API or non-navigation requests", () => {
    const apiRequest = {
      method: "GET",
      url: "/api/play/config",
      originalUrl: "/api/play/config",
      headers: { accept: "application/json" },
    };
    const postRequest = {
      method: "POST",
      url: "/play",
      originalUrl: "/play",
      headers: { accept: "text/html" },
    };

    expect(rewriteLocalSpaRequest(apiRequest)).toBe(false);
    expect(rewriteLocalSpaRequest(postRequest)).toBe(false);
  });

  it.each(["abc", "5173.5", "1023", "65536"])(
    "rejects invalid port %s before startup",
    (value) => {
      expect(() => parseLocalDevPort(value, "test port")).toThrow(
        /expected an integer between 1024 and 65535/,
      );
    },
  );

  it("keeps every local tool on the shared config module", () => {
    for (const path of [
      "vite.config.ts",
      "scripts/dev-restart.mjs",
      "scripts/d1-doctor.mjs",
    ]) {
      expect(readFileSync(`${rootDir}/${path}`, "utf8")).toContain(
        "local-dev-config.mjs",
      );
    }
  });
});
