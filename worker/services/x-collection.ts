import { sql } from "drizzle-orm";
import { getDb, type DbInstance } from "../db";
import { members } from "../../src/db/schema";
import {
  normalizeXCollectionIntervalHours,
  parseXCollectionIntervalHours,
} from "../../src/lib/auto-update-interval";
import { getSetting, updateSetting } from "../utils/helpers";
import {
  collectXPostsForHandles,
  extractXHandleFromUrl,
} from "./x";
import type { Env } from "../types";

const X_COLLECTION_INTERVAL_SETTING_KEY = "x_collection_interval_hours";
const X_COLLECTION_LAST_RUN_SETTING_KEY = "x_collection_last_run";
const X_COLLECTION_MAX_RESULTS = 5;

type XCollectionSource = "manual" | "scheduled";

type XCollectionServiceResult = Awaited<
  ReturnType<typeof collectXPostsForHandles>
>;

export type XCollectionRunResult = Omit<XCollectionServiceResult, "error"> & {
  success: boolean;
  error: string | null;
  updatedAt: string;
};

export type XCollectionScheduleDecision = {
  shouldRun: boolean;
  intervalHours: number;
  lastRun: number;
  elapsedMs: number;
};

const normalizeLastRun = (value: string | null | undefined) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

export const getXCollectionScheduleDecision = (
  intervalValue: string | null | undefined,
  lastRunValue: string | null | undefined,
  currentTime = Date.now(),
): XCollectionScheduleDecision => {
  const intervalHours = parseXCollectionIntervalHours(intervalValue);
  const lastRun = normalizeLastRun(lastRunValue);
  const elapsedMs = lastRun > 0 ? currentTime - lastRun : Number.POSITIVE_INFINITY;
  return {
    shouldRun: lastRun <= 0 || elapsedMs >= intervalHours * 60 * 60 * 1000,
    intervalHours,
    lastRun,
    elapsedMs,
  };
};

const readActiveXHandles = async (db: DbInstance) => {
  const activeCondition = sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;
  const rows = await db
    .select({ urlTwitter: members.url_twitter })
    .from(members)
    .where(activeCondition);

  return Array.from(
    new Set(
      rows
        .map((member) => extractXHandleFromUrl(member.urlTwitter))
        .filter((handle): handle is string => Boolean(handle)),
    ),
  );
};

const normalizeCollectionResult = (
  result: XCollectionServiceResult,
  updatedAtMs: number,
): XCollectionRunResult => ({
  ...result,
  success: result.status === "success",
  error: "error" in result ? result.error ?? null : null,
  updatedAt: new Date(updatedAtMs).toISOString(),
});

export const runXCollection = async (
  env: Env,
  source: XCollectionSource,
): Promise<XCollectionRunResult> => {
  const db = getDb(env);
  const handles = await readActiveXHandles(db);
  const result = await collectXPostsForHandles(handles, {
    bearerToken: env.X_BEARER_TOKEN,
    cacheDb: env.otw_db,
    maxResults: X_COLLECTION_MAX_RESULTS,
    richXLinkPreviewEnabled: false,
    source,
  });
  const updatedAtMs = Date.now();

  if (result.status === "success" || result.status === "failed") {
    await updateSetting(
      db,
      X_COLLECTION_LAST_RUN_SETTING_KEY,
      String(updatedAtMs),
    );
  }

  return normalizeCollectionResult(result, updatedAtMs);
};

export const getScheduledXCollectionDecision = async (
  db: DbInstance,
  currentTime = Date.now(),
) => {
  const intervalValue = await getSetting(db, X_COLLECTION_INTERVAL_SETTING_KEY);
  const normalizedInterval = normalizeXCollectionIntervalHours(intervalValue);
  if (intervalValue !== normalizedInterval) {
    await updateSetting(db, X_COLLECTION_INTERVAL_SETTING_KEY, normalizedInterval);
  }
  const lastRunValue = await getSetting(db, X_COLLECTION_LAST_RUN_SETTING_KEY);
  return getXCollectionScheduleDecision(
    normalizedInterval,
    lastRunValue,
    currentTime,
  );
};

export const runScheduledXCollection = async (env: Env) => {
  const db = getDb(env);
  const decision = await getScheduledXCollectionDecision(db);
  if (!decision.shouldRun) {
    return {
      skipped: true as const,
      reason: "interval_not_elapsed" as const,
      ...decision,
    };
  }

  return {
    skipped: false as const,
    result: await runXCollection(env, "scheduled"),
    ...decision,
  };
};
