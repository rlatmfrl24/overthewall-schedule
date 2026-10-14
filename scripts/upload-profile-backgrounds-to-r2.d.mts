import type { SpawnSyncOptions } from "node:child_process";
export function parseProfileBackgroundName(name: string): { code: string; backgroundId: string };
export function createProfileUploadPlan(args: string[], environment?: NodeJS.ProcessEnv): {
  siteId: "otw" | "luvdia";
  configPath: string;
  scope: string;
  persistTo: string | undefined;
  bucket: string;
  database: string;
  uploads: Array<{ file: string; key: string; operationId: string }>;
};
export function runProfileBackgroundUpload(args?: string[], options?: {
  spawn?: (command: string, args: string[], options: SpawnSyncOptions) => { status: number | null; error?: Error };
  environment?: NodeJS.ProcessEnv;
}): void;
