import type { XActivityStatusDto } from "@contracts/x-activity";
import { X_FALLBACK_INTERVAL_MS, type XCollectionStatusDto } from "@contracts/x-collection";
import { parseXCollectionIntervalHours } from "@contracts/configuration";
import { parseSiteId } from "@contracts/site-definition";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { getXCollectionScheduleDecision, readActiveXHandles } from "./x-collection";

const timestamp = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
const latest = (values: Array<number | null>) => values.some(Boolean) ? Math.max(...values.map(value => value ?? 0)) : null;
export async function readXCollectionStatus(env: Env, activity: XActivityStatusDto | null, activityError: string | null = null): Promise<XCollectionStatusDto> {
  const observedAt = Date.now(), site = parseSiteId(env.SITE_ID), handles = await readActiveXHandles(getDb(env), site);
  const [settings, official, fx] = await Promise.all([
    env.otw_db.prepare("SELECT key,value FROM settings WHERE key IN ('x_collection_primary_source','x_collection_interval_hours','x_collection_last_run','x_collection_last_success','x_collection_cadence_state')").all<{ key: string; value: string }>(),
    env.otw_db.prepare("SELECT handle,last_completed_at,regular_completed_at,sync_pagination_token,last_error,next_check_at FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?))").bind(JSON.stringify(handles)).all<{ handle: string; last_completed_at: number | null; regular_completed_at: number | null; sync_pagination_token: string | null; last_error: string | null; next_check_at: number | null }>(),
    env.otw_db.prepare("SELECT handle,last_success_at,last_completed_at,cursor,last_error,consecutive_failures,consecutive_successes,fallback_active FROM x_fx_sources WHERE handle IN (SELECT value FROM json_each(?))").bind(JSON.stringify(handles)).all<{ handle: string; last_success_at: number | null; last_completed_at: number | null; cursor: string | null; last_error: string | null; consecutive_failures: number; consecutive_successes: number; fallback_active: number }>(),
  ]);
  const values = new Map(settings.results.map(row => [row.key, row.value]));
  const primarySource = values.get("x_collection_primary_source") === "fxembed" ? "fxembed" : "x_api";
  const intervalHours = primarySource === "fxembed" ? 24 : parseXCollectionIntervalHours(values.get("x_collection_interval_hours"));
  const decision = getXCollectionScheduleDecision(String(intervalHours), values.get("x_collection_last_run"), observedAt, values.get("x_collection_cadence_state"));
  const nextRegularEligibleAt = decision.lastRun ? observedAt - decision.elapsedMs + intervalHours * 3600000 : observedAt;
  const byOfficial = new Map(official.results.map(row => [row.handle, row]));
  const byFx = new Map(fx.results.map(row => [row.handle, row]));
  const accounts = handles.map(handle => {
    const source = byOfficial.get(handle), primary = byFx.get(handle), fallbackActive = Boolean(primary?.fallback_active);
    const officialPending = Boolean(source?.sync_pagination_token);
    const eligible = officialPending ? timestamp(source?.next_check_at) ?? observedAt : fallbackActive ? (timestamp(source?.last_completed_at) ?? observedAt - X_FALLBACK_INTERVAL_MS) + X_FALLBACK_INTERVAL_MS : nextRegularEligibleAt;
    return { handle, fxLastSuccessAt: timestamp(primary?.last_success_at), fxLastCompletedAt: timestamp(primary?.last_completed_at), fxPending: Boolean(primary?.cursor), fxError: primary?.last_error ?? null,
      consecutiveFailures: primary?.consecutive_failures ?? 0, consecutiveSuccesses: primary?.consecutive_successes ?? 0, fallbackActive,
      officialLastCompletedAt: timestamp(source?.last_completed_at), officialRegularCompletedAt: timestamp(source?.regular_completed_at), officialPending, officialError: source?.last_error ?? null,
      officialNextEligibleAt: source?.last_error ? Math.max(eligible, timestamp(source.next_check_at) ?? observedAt) : eligible };
  });
  const current = activity?.sites?.find(value => value.site === site);
  const fxCompleted = accounts.map(account => account.fxLastCompletedAt);
  return { primarySource, observedAt, accounts,
    fxembed: { intervalMinutes: 30, lastSuccessAt: latest(accounts.map(account => account.fxLastSuccessAt)), lastCompletedAt: fxCompleted.length && fxCompleted.every(Boolean) ? Math.min(...fxCompleted as number[]) : null, pendingSources: accounts.filter(account => account.fxPending).length, failedSources: accounts.filter(account => account.fxError).length },
    xApi: { intervalHours, lastRegularCompletedAt: timestamp(Number(values.get("x_collection_last_success"))), nextRegularEligibleAt, pendingSources: accounts.filter(account => account.officialPending).length, failedSources: accounts.filter(account => account.officialError).length, budgetReady: activity?.budgetReady ?? null },
    webhook: { state: current ? current.enabled ? "enabled" : "disabled" : "unavailable", siteActiveCount: current?.activeCount ?? null, reason: current?.pauseReason ?? null, error: current?.lastError ?? activity?.subscriptions?.find(subscription => subscription.error)?.error ?? activityError ?? activity?.coordinatorError ?? null },
  };
}
