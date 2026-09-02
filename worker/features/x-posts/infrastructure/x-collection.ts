import { sql } from "drizzle-orm";
import { getDb, type DbInstance } from "../../../platform/db";
import { members } from "@db/schema";
import {
  normalizeXCollectionIntervalHours,
  parseXCollectionIntervalHours,
} from "@contracts/configuration";
import { getSetting, updateSetting } from "../../../platform/http-helpers";
import {
  collectXPostsForHandles,
  extractXHandleFromUrl,
} from "./x-api";
import {
  backfillXPostFactsFromStoredPosts,
  backfillXPostReferencesFromStoredPosts,
} from "./x-history";
import type { Env } from "../../../platform/types";

const X_COLLECTION_INTERVAL_SETTING_KEY = "x_collection_interval_hours";
const X_COLLECTION_LAST_RUN_SETTING_KEY = "x_collection_last_run";
// Background collection uses a bounded 25-post page. Public feed limits stay
// independent (5..20) and always read stored D1 content.
const X_COLLECTION_MAX_RESULTS = 25;
const X_OPTIMIZED_FIRST_PAGE_RESULTS = 5;
const X_SOURCE_LEASE_MS = 10 * 60_000;

type XCollectionSource = "manual" | "scheduled";

type XCollectionServiceResult = Awaited<
  ReturnType<typeof collectXPostsForHandles>
>;

type XCollectionObservability = {
  uniqueResources: number;
  previewDeferred: number;
  coalescedHandles: number;
  effectiveIntervalMinutes: number;
  fallbackReason: XEffectiveCollectionPolicy["fallbackReason"];
};

export type XCollectionRunResult = Omit<
  XCollectionServiceResult,
  "error" | keyof XCollectionObservability
> & Partial<XCollectionObservability> & {
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

type XUsageGuardRow = {
  resource: string;
  consumed: number | string;
  limit_value: number | string | null;
};

export const normalizeXCollectionHandles = (handles: readonly string[]) =>
  Array.from(new Set(
    handles.map((handle) => handle.trim().toLowerCase()).filter(Boolean),
  ));

export const getXUsageFallbackReason = (
  rows: readonly XUsageGuardRow[],
  backoffUntil: number,
  currentTime: number,
): XEffectiveCollectionPolicy["fallbackReason"] => {
  if (Number.isFinite(backoffUntil) && backoffUntil > currentTime) {
    return "provider_backoff";
  }
  const fallbackByResource: Record<string, XEffectiveCollectionPolicy["fallbackReason"]> = {
    x_api_cost_micros: "x_budget",
    d1_rows_read: "d1_reads",
    d1_rows_written: "d1_writes",
    queue_operations: "queue",
  };
  const guarded = rows.find((row) => {
    const limit = Number(row.limit_value ?? 0);
    return limit > 0 && Number(row.consumed) / limit >= 0.7;
  });
  return guarded ? fallbackByResource[guarded.resource] ?? null : null;
};

export type XEffectiveCollectionPolicy = {
  optimizerEnabled: boolean;
  configuredIntervalMinutes: number;
  effectiveIntervalMinutes: number;
  fallbackReason: "x_budget" | "d1_reads" | "d1_writes" | "queue" | "provider_backoff" | null;
  referencePreviewMode: "cached_author" | "post_only" | "link_only";
};

export const resolveXEffectiveCollectionPolicy = async (
  env: Env,
  currentTime = Date.now(),
): Promise<XEffectiveCollectionPolicy> => {
  const db = getDb(env);
  const optimizerEnabled = (await getSetting(db, "x_cost_optimizer_enabled")) === "true";
  const configuredHours = parseXCollectionIntervalHours(
    await getSetting(db, X_COLLECTION_INTERVAL_SETTING_KEY),
  );
  const previewModeValue = await getSetting(db, "x_reference_preview_mode");
  const referencePreviewMode = previewModeValue === "post_only" || previewModeValue === "link_only"
    ? previewModeValue
    : "cached_author";
  const configuredIntervalMinutes = configuredHours * 60;
  if (!optimizerEnabled) {
    return {
      optimizerEnabled,
      configuredIntervalMinutes,
      effectiveIntervalMinutes: configuredIntervalMinutes,
      fallbackReason: null,
      referencePreviewMode,
    };
  }

  const backoffUntil = Number.parseInt(
    (await getSetting(db, "x_api_backoff_until")) ?? "0",
    10,
  );
  const earlyFallbackReason = getXUsageFallbackReason([], backoffUntil, currentTime);
  if (earlyFallbackReason) {
    return {
      optimizerEnabled,
      configuredIntervalMinutes,
      effectiveIntervalMinutes: Math.max(configuredIntervalMinutes, 60),
      fallbackReason: earlyFallbackReason,
      referencePreviewMode,
    };
  }

  const day = new Date(currentTime).toISOString().slice(0, 10);
  const rows = await env.otw_db.prepare(
    `SELECT resource, COALESCE(SUM(used + reserved), 0) AS consumed,
            MAX(limit_value) AS limit_value
     FROM scheduled_usage_daily
     WHERE day = ? AND lane = 'all'
       AND resource IN ('x_api_cost_micros', 'd1_rows_read', 'd1_rows_written', 'queue_operations')
     GROUP BY resource`,
  ).bind(day).all<XUsageGuardRow>();
  const fallbackReason = getXUsageFallbackReason(rows.results, 0, currentTime);
  return {
    optimizerEnabled,
    configuredIntervalMinutes,
    effectiveIntervalMinutes: fallbackReason
      ? Math.max(configuredIntervalMinutes, 60)
      : configuredIntervalMinutes,
    fallbackReason,
    referencePreviewMode,
  };
};

const claimXSourceLeases = async (env: Env, handles: string[], currentTime: number) => {
  const claimed: string[] = [];
  const token = crypto.randomUUID();
  const normalizedHandles = normalizeXCollectionHandles(handles);
  if (normalizedHandles.length === 0) {
    return { claimed, token, coalesced: 0 };
  }
  const existing = await env.otw_db.prepare(
    `SELECT handle FROM x_post_sources
     WHERE handle IN (${normalizedHandles.map(() => "?").join(", ")})`,
  ).bind(...normalizedHandles).all<{ handle: string }>();
  const existingHandles = new Set(existing.results.map((row) => row.handle));
  for (const handle of normalizedHandles) {
    if (!existingHandles.has(handle)) {
      await env.otw_db.prepare(
        `INSERT INTO x_post_sources (
           handle, last_checked_at, updated_at, collection_started_at,
           generation
         ) VALUES (?, 0, ?, ?, 0)
         ON CONFLICT(handle) DO NOTHING`,
      ).bind(handle, currentTime, currentTime).run();
    }
    const row = await env.otw_db.prepare(
      `UPDATE x_post_sources
       SET lease_token = ?, lease_until = ?, generation = generation + 1,
           updated_at = ?
       WHERE handle = ? AND (lease_until IS NULL OR lease_until <= ?)
       RETURNING handle`,
    ).bind(token, currentTime + X_SOURCE_LEASE_MS, currentTime, handle, currentTime)
      .first<{ handle: string }>();
    if (row?.handle) claimed.push(row.handle);
  }
  return {
    claimed,
    token,
    coalesced: normalizedHandles.length - claimed.length,
  };
};

const releaseXSourceLeases = async (env: Env, token: string) => {
  await env.otw_db.prepare(
    `UPDATE x_post_sources SET lease_token = NULL, lease_until = NULL
     WHERE lease_token = ?`,
  ).bind(token).run();
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

export const readActiveXHandles = async (db: DbInstance) => {
  const activeCondition = sql`${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0`;
  const rows = await db
    .select({ urlTwitter: members.url_twitter })
    .from(members)
    .where(activeCondition);

  return normalizeXCollectionHandles(
    rows.flatMap((member) => extractXHandleFromUrl(member.urlTwitter) ?? []),
  );
};

const normalizeCollectionResult = (
  result: XCollectionServiceResult & Partial<XCollectionObservability>,
  updatedAtMs: number,
): XCollectionRunResult => ({
  ...result,
  success: result.status === "success",
  error: "error" in result ? result.error ?? null : null,
  updatedAt: new Date(updatedAtMs).toISOString(),
});

export const runXCollectionForHandles = async (
  env: Env,
  handles: string[],
  source: XCollectionSource,
): Promise<XCollectionRunResult> => {
  try {
    await backfillXPostFactsFromStoredPosts(env.otw_db, 100);
    await backfillXPostReferencesFromStoredPosts(env.otw_db, 100);
  } catch (error) {
    console.warn("Failed to backfill stored X post facts or references", error);
  }
  const policy = await resolveXEffectiveCollectionPolicy(env);
  const lease = await claimXSourceLeases(env, handles, Date.now());
  try {
    const result = await collectXPostsForHandles(lease.claimed, {
      bearerToken: env.X_BEARER_TOKEN,
      cacheDb: env.otw_db,
      maxResults: policy.optimizerEnabled
        ? X_OPTIMIZED_FIRST_PAGE_RESULTS
        : X_COLLECTION_MAX_RESULTS,
      richXLinkPreviewEnabled: false,
      source,
      optimizerEnabled: policy.optimizerEnabled,
      effectiveIntervalMinutes: policy.effectiveIntervalMinutes,
      referencePreviewMode: policy.referencePreviewMode,
      coalescedHandles: lease.coalesced,
    });
    return normalizeCollectionResult({
      ...result,
      effectiveIntervalMinutes: policy.effectiveIntervalMinutes,
      fallbackReason: policy.fallbackReason,
      coalescedHandles: lease.coalesced,
    }, Date.now());
  } finally {
    await releaseXSourceLeases(env, lease.token);
  }
};

export const runXCollection = async (
  env: Env,
  source: XCollectionSource,
): Promise<XCollectionRunResult> => {
  const db = getDb(env);
  const handles = await readActiveXHandles(db);
  const result = await runXCollectionForHandles(env, handles, source);
  const updatedAtMs = Date.now();

  if (
    result.status === "success" ||
    result.status === "failed" ||
    ("error" in result && result.error === "all_handles_cooldown")
  ) {
    await updateSetting(
      db,
      X_COLLECTION_LAST_RUN_SETTING_KEY,
      String(updatedAtMs),
    );
  }

  return { ...result, updatedAt: new Date(updatedAtMs).toISOString() };
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
