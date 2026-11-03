import { FX_COLLECTION_INTERVAL_MS, X_FALLBACK_INTERVAL_MS, type XCollectionProvider, type XCollectionScope } from "@contracts/x-collection";
import { parseSiteId } from "@contracts/site-definition";
import { getDb } from "../../../platform/db";
import type { Env } from "../../../platform/types";
import { getXCollectionScheduleDecision, readActiveXHandles, readXCollectionBudgetAvailable } from "./x-collection";

export type HybridCollectionTarget = { provider: XCollectionProvider; scope: XCollectionScope; handles: string[]; hybrid: true };
export async function readHybridXCollectionTargets(env: Env, timestamp: number): Promise<HybridCollectionTarget[]> {
  const handles = await readActiveXHandles(getDb(env), parseSiteId(env.SITE_ID));
  if (!handles.length) return [];
  const [sources, fx, settings] = await Promise.all([
    env.otw_db.prepare("SELECT handle,sync_pagination_token,last_completed_at,regular_completed_at,next_check_at,last_error_code,deactivated_at FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?))").bind(JSON.stringify(handles)).all<{ handle: string; sync_pagination_token: string | null; last_completed_at: number | null; regular_completed_at: number | null; next_check_at: number | null; last_error_code: string | null; deactivated_at: number | null }>(),
    env.otw_db.prepare("SELECT handle,cadence_anchor_at,last_attempt_at,fallback_active FROM x_fx_sources WHERE handle IN (SELECT value FROM json_each(?))").bind(JSON.stringify(handles)).all<{ handle: string; cadence_anchor_at: number | null; last_attempt_at: number | null; fallback_active: number }>(),
    env.otw_db.prepare("SELECT key,value FROM settings WHERE key IN ('x_collection_last_run','x_collection_cadence_state','x_api_backoff_until')").all<{ key: string; value: string }>(),
  ]);
  const values = new Map(settings.results.map(row => [row.key, row.value]));
  const decision = getXCollectionScheduleDecision("24", values.get("x_collection_last_run"), timestamp, values.get("x_collection_cadence_state"));
  const official = new Map(sources.results.map(row => [row.handle, row]));
  const primary = new Map(fx.results.map(row => [row.handle, row]));
  const result: HybridCollectionTarget[] = [];
  const fxHandles = handles.filter(handle => {
    if (official.get(handle)?.deactivated_at != null) return false;
    const last = primary.get(handle), anchor = last?.cadence_anchor_at ?? last?.last_attempt_at ?? 0;
    return !anchor || timestamp - anchor >= FX_COLLECTION_INTERVAL_MS;
  });
  if (fxHandles.length) result.push({ provider: "fxembed", scope: "regular", handles: fxHandles, hybrid: true });
  if (Number(values.get("x_api_backoff_until") ?? 0) > timestamp || !await readXCollectionBudgetAvailable(env)) return result;
  const groups: Record<XCollectionScope, string[]> = { pending: [], regular: [], fallback: [] };
  for (const handle of handles) {
    const source = official.get(handle);
    if (source?.deactivated_at != null || (source?.last_error_code && Number(source.next_check_at ?? 0) > timestamp)) continue;
    if (source?.sync_pagination_token) {
      if (Number(source.next_check_at ?? 0) <= timestamp) groups.pending.push(handle);
    } else if (decision.shouldRun && Number(source?.regular_completed_at ?? 0) <= decision.lastRun) {
      groups.regular.push(handle);
    } else if (primary.get(handle)?.fallback_active && (!source?.last_completed_at || timestamp - source.last_completed_at >= X_FALLBACK_INTERVAL_MS)) {
      groups.fallback.push(handle);
    }
  }
  for (const scope of ["pending", "regular", "fallback"] as const) if (groups[scope].length) result.push({ provider: "x_api", scope, handles: groups[scope], hybrid: true });
  return result;
}

export async function isHybridRegularCollectionComplete(env: Env) {
  const handles = await readActiveXHandles(getDb(env), parseSiteId(env.SITE_ID));
  if (!handles.length) return false;
  const baseline = Number(await env.otw_db.prepare("SELECT value FROM settings WHERE key='x_collection_last_run'").first("value") ?? 0);
  const completed = await env.otw_db.prepare(`SELECT COUNT(*) AS count FROM x_post_sources WHERE handle IN (SELECT value FROM json_each(?))
    AND regular_completed_at>? AND sync_pagination_token IS NULL AND last_error IS NULL AND deactivated_at IS NULL`)
    .bind(JSON.stringify(handles), baseline).first<number>("count");
  return completed === handles.length;
}
