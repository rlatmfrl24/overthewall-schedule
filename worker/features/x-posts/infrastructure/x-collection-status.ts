import type { XActivityStatusDto } from "@contracts/x-activity";
import { FX_COLLECTION_LOOKBACK_HOURS, FX_COLLECTION_MAX_PAGES, X_FALLBACK_INTERVAL_MS, type XCollectionStatusDto, type XCollectionScope } from "@contracts/x-collection";
import { parseXCollectionIntervalHours } from "@contracts/configuration";
import { parseSiteId } from "@contracts/site-definition";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { getOfficialAccountDecision } from "../domain/x-collection-policy";
import { getXCollectionScheduleDecision, readActiveXHandles } from "./x-collection";

const timestamp = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const latest = (values: Array<number | null>) => values.some(Boolean) ? Math.max(...values.map(value => value ?? 0)) : null;
const oldestComplete = (values: Array<number | null>) => values.length && values.every(value => value !== null) ? Math.min(...values as number[]) : null;
type Official = { handle: string; last_completed_at: number | null; regular_completed_at: number | null; sync_pagination_token: string | null; sync_origin_scope: XCollectionScope | null; sync_timeline_completed_at: number | null; last_error: string | null; last_error_code: string | null; next_check_at: number | null };
type Fx = { handle: string; last_success_at: number | null; last_completed_at: number | null; cursor: string | null; window_until_at: number | null; last_window_until_at: number | null; last_window_limited: number; retired_progress: string | null; last_error: string | null; consecutive_failures: number; consecutive_successes: number; fallback_active: number; rss_last_http_success_at: number | null; rss_last_check_completed_at: number | null; rss_last_error: string | null; rss_last_raw_count: number | null; rss_previous_raw_count: number | null; rss_pending_item_id: string | null; pending_candidates: number | null };
export async function readXCollectionStatus(env: Env, activity: XActivityStatusDto | null, activityError: string | null = null): Promise<XCollectionStatusDto> {
  const observedAt = Date.now(), site = parseSiteId(env.SITE_ID), handles = await readActiveXHandles(getDb(env), site);
  const [settings, official, fx] = await Promise.all([
    env.otw_db.prepare("SELECT key,value FROM settings WHERE key IN ('x_collection_enabled','x_collection_primary_source','x_collection_hybrid_policy','x_collection_hybrid_activated_at','x_collection_interval_hours','x_collection_last_run','x_collection_last_success','x_collection_cadence_state','x_api_backoff_until')").all<{ key: string; value: string }>(),
    env.otw_db.prepare("SELECT handle,last_completed_at,regular_completed_at,sync_pagination_token,sync_origin_scope,sync_timeline_completed_at,last_error,last_error_code,next_check_at FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?))").bind(JSON.stringify(handles)).all<Official>(),
    env.otw_db.prepare(`SELECT f.*,CASE WHEN json_valid(i.continuation_json) THEN json_array_length(i.continuation_json,'$.candidates') END AS pending_candidates
      FROM x_fx_sources f LEFT JOIN scheduled_job_items i ON i.id=f.rss_pending_item_id WHERE f.handle IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(handles)).all<Fx>(),
  ]);
  const values = new Map(settings.results.map(row => [row.key, row.value]));
  const primarySource = values.get("x_collection_primary_source") === "fxembed" ? "fxembed" : "x_api";
  const hybridPolicy = values.get("x_collection_hybrid_policy") === "rss_v1" ? "rss_v1" : values.get("x_collection_hybrid_policy") === "legacy" ? "legacy" : null;
  const activatedAt = timestamp(Number(values.get("x_collection_hybrid_activated_at")));
  const globalBackoffUntil = timestamp(Number(values.get("x_api_backoff_until"))) ?? 0;
  const independent = primarySource === "fxembed" && hybridPolicy === "rss_v1" && activatedAt !== null;
  const enabled = values.get("x_collection_enabled") === "true";
  const intervalHours = primarySource === "fxembed" ? independent ? 12 : 24 : parseXCollectionIntervalHours(values.get("x_collection_interval_hours"));
  const decision = getXCollectionScheduleDecision(String(intervalHours), values.get("x_collection_last_run"), observedAt, values.get("x_collection_cadence_state"));
  const legacyNext = decision.lastRun ? observedAt - decision.elapsedMs + intervalHours * 3_600_000 : observedAt;
  const byOfficial = new Map(official.results.map(row => [row.handle, row])), byFx = new Map(fx.results.map(row => [row.handle, row]));
  const budget = activity?.site === site ? activity.recovery?.budget : undefined;
  const blockedReason = activity?.site !== site || activity.budgetReady !== true || !budget ? "shared_budget_unavailable" : budget.availableMicros < budget.perPageMicros ? "budget_exceeded" : null;
  const accounts = handles.map(handle => {
    const source = byOfficial.get(handle), primary = byFx.get(handle), fallbackActive = Boolean(primary?.fallback_active);
    const officialPending = Boolean(source?.sync_pagination_token || independent && (source?.sync_origin_scope || source?.sync_timeline_completed_at != null));
    const accountDecision = independent ? getOfficialAccountDecision({ now: observedAt, activatedAt, regularCompletedAt: timestamp(source?.regular_completed_at), completedAt: timestamp(source?.last_completed_at), pending: officialPending, originScope: source?.sync_origin_scope ?? null, fallbackActive, backoffUntil: officialPending || source?.last_error_code || source?.last_error ? timestamp(source?.next_check_at) : null }) : null;
    const eligible = accountDecision?.eligibleAt ?? (officialPending ? timestamp(source?.next_check_at) ?? observedAt : fallbackActive ? (timestamp(source?.last_completed_at) ?? observedAt - X_FALLBACK_INTERVAL_MS) + X_FALLBACK_INTERVAL_MS : legacyNext);
    const paidTimeline = !independent || source?.sync_timeline_completed_at == null;
    const actualEligible = Math.max(source?.last_error ? Math.max(eligible, timestamp(source.next_check_at) ?? observedAt) : eligible, paidTimeline ? globalBackoffUntil : 0);
    return { handle, fxLastSuccessAt: timestamp(primary?.last_success_at), fxLastCompletedAt: timestamp(primary?.last_window_until_at) === null ? null : timestamp(primary?.last_completed_at), fxPending: Boolean(primary?.cursor || primary?.last_error), fxError: primary?.last_error ?? null,
      fxWindowUntilAt: timestamp(primary?.window_until_at), fxLastWindowUntilAt: timestamp(primary?.last_window_until_at), fxWindowLimited: Boolean(primary?.last_window_limited), fxRetiredTraversal: Boolean(primary?.retired_progress),
      consecutiveFailures: primary?.consecutive_failures ?? 0, consecutiveSuccesses: primary?.consecutive_successes ?? 0, fallbackActive,
      officialLastCompletedAt: timestamp(source?.last_completed_at), officialRegularCompletedAt: timestamp(source?.regular_completed_at), officialPending, officialError: source?.last_error ?? null,
      officialNextEligibleAt: actualEligible, officialNominalDueAt: accountDecision?.nominalDueAt ?? eligible,
      officialBlockedReason: !enabled ? "collection_disabled" : (paidTimeline ? blockedReason : null) ?? (actualEligible > observedAt && (paidTimeline && globalBackoffUntil > observedAt || officialPending || source?.last_error_code || source?.last_error) ? "backoff" : null),
      officialRegularAgeMs: accountDecision?.ageMs ?? (timestamp(source?.regular_completed_at) === null ? null : Math.max(0,observedAt - source!.regular_completed_at!)), officialHealth: accountDecision?.health ?? "waiting" as const,
      rssLastHttpSuccessAt: timestamp(primary?.rss_last_http_success_at), rssLastCheckCompletedAt: timestamp(primary?.rss_last_check_completed_at), rssPendingCandidates: primary?.pending_candidates ?? 0,
      rssWindowReduced: primary?.rss_last_raw_count != null && primary.rss_previous_raw_count != null && primary.rss_last_raw_count < primary.rss_previous_raw_count, rssError: primary?.rss_last_error ?? null };
  });
  const current = activity?.site === site ? activity.sites?.find(value => value.site === site) : undefined;
  const webhookError = current?.lastError ?? activity?.subscriptions?.find(subscription => subscription.site === site && subscription.error)?.error ?? activityError ?? activity?.coordinatorError ?? null;
  return { primarySource, hybridPolicy, observedAt, accounts,
    rss: { enabled: enabled && independent, intervalHours: 6, lastHttpSuccessAt: latest(accounts.map(account => account.rssLastHttpSuccessAt)), lastCheckCompletedAt: oldestComplete(accounts.map(account => account.rssLastCheckCompletedAt)), pendingSources: handles.filter(handle => byFx.get(handle)?.rss_pending_item_id).length, pendingCandidates: accounts.reduce((sum,account) => sum + account.rssPendingCandidates,0), windowReduced: accounts.some(account => account.rssWindowReduced), error: accounts.find(account => account.rssError)?.rssError ?? null },
    fxembed: { intervalMinutes: 30, lookbackHours: FX_COLLECTION_LOOKBACK_HOURS, maxPages: FX_COLLECTION_MAX_PAGES, lastSuccessAt: latest(accounts.map(account => account.fxLastSuccessAt)), lastCompletedAt: oldestComplete(accounts.map(account => account.fxLastCompletedAt)), lastWindowUntilAt: oldestComplete(accounts.map(account => account.fxLastWindowUntilAt)), limitedSources: accounts.filter(account => account.fxWindowLimited).length, retiredSources: accounts.filter(account => account.fxRetiredTraversal).length, pendingSources: accounts.filter(account => account.fxPending).length, failedSources: accounts.filter(account => account.fxError).length },
    xApi: { intervalHours, lastRegularCompletedAt: independent ? oldestComplete(accounts.map(account => account.officialRegularCompletedAt)) : timestamp(Number(values.get("x_collection_last_success"))), nextRegularEligibleAt: independent && accounts.length ? Math.min(...accounts.map(account => account.officialNextEligibleAt)) : Math.max(legacyNext,globalBackoffUntil), pendingSources: accounts.filter(account => account.officialPending).length, failedSources: accounts.filter(account => account.officialError).length, budgetReady: activity?.site === site ? activity.budgetReady ?? null : null },
    webhook: { state: current ? current.enabled ? "enabled" : "disabled" : "unavailable", siteActiveCount: webhookError ? null : current?.activeCount ?? null, reason: current?.pauseReason ?? null, error: webhookError },
  };
}
