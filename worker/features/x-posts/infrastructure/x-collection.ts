import { getHiddenMemberCodes } from "@contracts/site-publication";
import { publicationHiddenSql } from "../../content-access";
import { parseSiteId, type SiteId } from "@contracts/site-definition";
import {
  normalizeXCollectionIntervalHours,
  parseXCollectionIntervalHours,
} from "@contracts/configuration";
import type { XReferenceHydrationResultDto } from "@contracts/x-posts";
import { members, settings } from "@db/schema";
import { inArray, sql } from "drizzle-orm";
import { collectionCadenceAnchor } from "../../../platform/collection-cadence";
import { getDb, type DbInstance } from "../../../platform/db";
import { getSetting, updateSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import {
  collectXPostsForHandles,
  extractXHandleFromUrl,
} from "./x-api";
import {
  backfillXPostFactsFromStoredPosts,
  backfillXPostReferencesFromStoredPosts,
} from "./x-history";
import { hydrateXReferences } from "./x-reference-hydration";

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
  referenceHydration?: XReferenceHydrationResultDto;
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
       WHERE handle = ? AND NOT (${publicationHiddenSql("x_post_sources","x_post_sources",parseSiteId(env.SITE_ID))}) AND (lease_until IS NULL OR lease_until <= ?)
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
  cadenceStateValue?: string | null,
): XCollectionScheduleDecision => {
  const intervalHours = parseXCollectionIntervalHours(intervalValue);
  const lastRun = normalizeLastRun(lastRunValue);
  let anchorAt = lastRun;
  try {
    const state = JSON.parse(cadenceStateValue ?? "null");
    if (lastRun <= currentTime && state?.completedAt === lastRun && typeof state.anchorAt === "number") {
      anchorAt = collectionCadenceAnchor(state.anchorAt, lastRun);
    }
  } catch { /* Legacy or malformed state retains completion-based eligibility. */ }
  const elapsedMs = lastRun > 0 ? currentTime - anchorAt : Number.POSITIVE_INFINITY;
  return {
    shouldRun: lastRun <= 0 || elapsedMs >= intervalHours * 60 * 60 * 1000,
    intervalHours,
    lastRun,
    elapsedMs,
  };
};

export const readActiveXHandles = async (db: DbInstance, siteId: SiteId = "otw") => {
  const activeCondition = sql`(${members.is_deprecated} IS NULL OR ${members.is_deprecated} = 0) AND NOT (${sql.raw(publicationHiddenSql("members","members",siteId))})`;
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
  scheduledFor?: number | null,
): Promise<XCollectionRunResult> => {
  if (getHiddenMemberCodes(parseSiteId(env.SITE_ID), Date.now()).length) {
    const allowed = new Set(await readActiveXHandles(getDb(env), parseSiteId(env.SITE_ID)));
    handles = handles.filter(handle => allowed.has(handle.toLowerCase()));
  }
  const policy = await resolveXEffectiveCollectionPolicy(env);
  const lease = await claimXSourceLeases(env, handles, Date.now());
  try {
    if (lease.claimed.length) {
      await backfillXPostFactsFromStoredPosts(env.otw_db,parseSiteId(env.SITE_ID),100);
      await backfillXPostReferencesFromStoredPosts(env.otw_db,parseSiteId(env.SITE_ID),100);
    }
    const result = await collectXPostsForHandles(lease.claimed, {
      bearerToken: env.X_BEARER_TOKEN,
      cacheDb: env.otw_db,
      siteId: parseSiteId(env.SITE_ID),
      maxResults: policy.optimizerEnabled
        ? X_OPTIMIZED_FIRST_PAGE_RESULTS
        : X_COLLECTION_MAX_RESULTS,
      richXLinkPreviewEnabled: false,
      source,
      scheduledFor: source === "scheduled" ? scheduledFor : undefined,
      optimizerEnabled: policy.optimizerEnabled,
      effectiveIntervalMinutes: policy.effectiveIntervalMinutes,
      referencePreviewMode: policy.referencePreviewMode,
      coalescedHandles: lease.coalesced,
      afterTimeline: (tracker) => hydrateXReferences({ db: env.otw_db,siteId:parseSiteId(env.SITE_ID), handles: lease.claimed,
        bearerToken: env.X_BEARER_TOKEN ?? "", mode: policy.referencePreviewMode, tracker }),
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
  const handles = await readActiveXHandles(db, parseSiteId(env.SITE_ID));
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
  const rows = await db.select({ key: settings.key, value: settings.value }).from(settings).where(inArray(settings.key,
    [X_COLLECTION_INTERVAL_SETTING_KEY, X_COLLECTION_LAST_RUN_SETTING_KEY, "x_collection_cadence_state"]));
  const values = new Map(rows.map(row => [row.key, row.value]));
  const intervalValue = values.get(X_COLLECTION_INTERVAL_SETTING_KEY);
  const normalizedInterval = normalizeXCollectionIntervalHours(intervalValue);
  if (intervalValue !== normalizedInterval) {
    await updateSetting(db, X_COLLECTION_INTERVAL_SETTING_KEY, normalizedInterval);
  }
  const lastRunValue = values.get(X_COLLECTION_LAST_RUN_SETTING_KEY);
  return getXCollectionScheduleDecision(
    normalizedInterval,
    lastRunValue,
    currentTime,
    values.get("x_collection_cadence_state"),
  );
};

export const recordXCollectionCompletion = async (env: Env, completion: {
  completedAt: number; source: XCollectionSource; scheduledFor?: number | null; successful: boolean;
}) => {
  const { completedAt, source, successful } = completion;
  const anchorAt = source === "scheduled" && successful
    ? collectionCadenceAnchor(completion.scheduledFor, completedAt) : completedAt;
  const updates = [
    [X_COLLECTION_LAST_RUN_SETTING_KEY, String(completedAt)],
    ["x_collection_cadence_state", JSON.stringify({ completedAt, anchorAt })],
    ...(successful ? [["x_collection_last_success", String(completedAt)]] : []),
  ];
  await env.otw_db.batch(updates.map(([key, value]) => env.otw_db.prepare(
    `INSERT INTO settings(key,value,updated_at)
     SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM settings WHERE key=? AND CAST(value AS INTEGER)>?)
     ON CONFLICT(key) DO UPDATE SET value=CASE
       WHEN settings.key='x_collection_cadence_state' AND json_valid(settings.value) THEN CASE
         WHEN json_type(settings.value,'$.anchorAt')='integer'
           AND json_extract(settings.value,'$.anchorAt') <= json_extract(settings.value,'$.completedAt')
           AND json_extract(settings.value,'$.anchorAt') > ?
         THEN json_set(excluded.value,'$.anchorAt',?) ELSE excluded.value END
       ELSE excluded.value END,updated_at=excluded.updated_at
     WHERE settings.updated_at IS NOT excluded.updated_at
       OR (settings.key <> 'x_collection_cadence_state' AND settings.value IS NOT excluded.value)`,
  ).bind(key, value, String(completedAt), key === "x_collection_last_success" ? key : X_COLLECTION_LAST_RUN_SETTING_KEY,
    completedAt, anchorAt, completedAt)));
};
