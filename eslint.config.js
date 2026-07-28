import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

export default tseslint.config([
  globalIgnores([
    "dist",
    "coverage",
    ".yoyo",
    "worker-configuration.d.ts",
  ]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs["recommended-latest"],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/worker/**",
                "**/db/**",
                "drizzle-orm",
                "drizzle-orm/**",
              ],
              message:
                "Frontend must depend on contracts, feature APIs, or shared clients instead of Worker/DB modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "worker/features/*/domain/**/*.{ts,tsx}",
    ],
    ignores: [
      "worker/features/**/*.test.{ts,tsx}",
      "worker/features/**/*.integration.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "drizzle-orm",
                "drizzle-orm/**",
                "@db",
                "@db/**",
                "**/platform",
                "**/platform/**",
                "**/application",
                "**/application/**",
                "**/infrastructure",
                "**/infrastructure/**",
                "**/http",
                "**/http/**",
                "../index",
              ],
              message:
                "Worker domain must not import platform, application, HTTP, infrastructure, D1, Drizzle, or its public index.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "worker/features/*/application/**/*.{ts,tsx}",
      "worker/features/*/ports/**/*.{ts,tsx}",
    ],
    ignores: [
      "worker/features/**/*.test.{ts,tsx}",
      "worker/features/**/*.integration.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "drizzle-orm",
                "drizzle-orm/**",
                "@db",
                "@db/**",
                "**/platform",
                "**/platform/**",
                "**/infrastructure",
                "**/infrastructure/**",
                "**/http",
                "**/http/**",
                "../index",
                "../../index",
              ],
              message:
                "Worker application/ports may only import their own application/domain and contracts.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["worker/features/*/http/**/*.{ts,tsx}"],
    ignores: [
      "worker/features/**/*.test.{ts,tsx}",
      "worker/features/**/*.integration.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "drizzle-orm",
                "drizzle-orm/**",
                "@db",
                "@db/**",
                "**/infrastructure",
                "**/infrastructure/**",
                "../index",
              ],
              message:
                "Worker HTTP adapters may use platform HTTP/auth/types and their own application/domain, but not infrastructure or DB adapters.",
            },
            {
              regex:
                "(?:^|/)platform/(?!auth$|types$|http-helpers$|http(?:/|$)).+",
              message:
                "Worker HTTP adapters may only import HTTP/auth/types modules from worker/platform.",
            },
            {
              regex: ".*",
              importNames: ["getDb"],
              message:
                "Worker HTTP adapters must receive database-backed dependencies through application ports.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["worker/features/*/infrastructure/**/*.{ts,tsx}"],
    ignores: [
      "worker/features/**/*.test.{ts,tsx}",
      "worker/features/**/*.integration.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../index", "**/http", "**/http/**"],
              message:
                "Worker infrastructure must not import its own HTTP layer or public index.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["worker/app/**/*.{ts,tsx}"],
    ignores: [
      "worker/app/**/*.test.{ts,tsx}",
      "worker/app/**/*.integration.test.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(?:^|/)features/[^/]+/(?!index$).+",
              message:
                "Worker app must import feature capabilities through their public index.",
            },
          ],
        },
      ],
    },
  },
]);
