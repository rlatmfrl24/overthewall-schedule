import { parseSiteId } from "@contracts/site-definition";
import { FX_COLLECTION_LOOKBACK_HOURS, FX_COLLECTION_MAX_PAGES, type FxRecentCheck } from "@contracts/x-collection";
import type { XPostDto } from "@contracts/x-posts";
import { getDb } from "../../../platform/db";
import { collectionCadenceAnchor } from "../../../platform/collection-cadence";
import { getSetting } from "../../../platform/http-helpers";
import type { Env } from "../../../platform/types";
import { publicationHiddenSql } from "../../content-access";
import { writeStoredPosts } from "./x-api";
import { fetchFxProfile, fetchFxTimelinePage, FxApiError } from "./fx-api";
import { claimXSourceLeases, readActiveXHandles, releaseXSourceLeases, type XCollectionRunResult } from "./x-collection";

type FxSource = { cursor: string | null; user_id: string | null; collection_started_at: number; window_until_at: number | null; pages_completed: number; last_completed_at: number | null; retired_progress: string | null };

export async function runFxCollectionForHandles(env: Env, handles: string[], source: "manual" | "scheduled", scheduledFor?: number | null): Promise<XCollectionRunResult & { provider: "fxembed" }> {
  const siteId = parseSiteId(env.SITE_ID), db = env.otw_db;
  const result: XCollectionRunResult & { provider: "fxembed"; recentCheck: FxRecentCheck } = { provider: "fxembed", recentCheck: { lookbackHours: FX_COLLECTION_LOOKBACK_HOURS, maxPages: FX_COLLECTION_MAX_PAGES, limitedSources: 0 }, checkedHandles: 0, refreshedHandles: 0, postsReturned: 0, postsStored: 0, apiCalls: 0, estimatedCostMicros: 0, pendingSources: 0, coalescedHandles: 0, status: "success", success: true, error: null, updatedAt: new Date().toISOString() };
  if ((await getSetting(getDb(env), "x_collection_enabled")) !== "true") return { ...result, status: "skipped", success: false, error: "collection_disabled" };
  const allowed = new Set(await readActiveXHandles(getDb(env), siteId));
  const lease = await claimXSourceLeases(env, handles.filter(handle => allowed.has(handle.toLowerCase())), Date.now());
  result.coalescedHandles = lease.coalesced;
  try {
    for (const handle of lease.claimed) {
      result.checkedHandles++;
      const now = Date.now();
      const official = await db.prepare("SELECT user_id,collection_started_at FROM x_post_sources WHERE handle=?").bind(handle).first<{ user_id: string | null; collection_started_at: number | null }>();
      const existing = await db.prepare("SELECT cursor,user_id,collection_started_at,window_until_at,pages_completed,last_completed_at,retired_progress FROM x_fx_sources WHERE handle=?").bind(handle).first<FxSource>();
      await db.prepare(`INSERT INTO x_fx_sources(handle,collection_started_at,last_attempt_at,cadence_anchor_at,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(handle) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,cadence_anchor_at=excluded.cadence_anchor_at,updated_at=excluded.updated_at`)
        .bind(handle, official?.collection_started_at ?? now, now, collectionCadenceAnchor(source === "scheduled" ? scheduledFor : undefined, now), now).run();
      try {
        let userId = official?.user_id ?? existing?.user_id;
        if (!userId) { result.apiCalls++; userId = (await fetchFxProfile(handle)).id; }
        await db.prepare("UPDATE x_fx_sources SET user_id=? WHERE handle=?").bind(userId, handle).run();
        const startedAt = existing?.collection_started_at ?? official?.collection_started_at ?? now;
        let cursor = existing?.window_until_at != null ? existing.cursor : null;
        let pages = cursor ? existing!.pages_completed : 0;
        let windowUntil = cursor ? existing!.window_until_at : null;
        if (cursor && (!Number.isSafeInteger(windowUntil) || windowUntil! <= 0 || !Number.isInteger(pages) || pages < 1 || pages >= FX_COLLECTION_MAX_PAGES)) throw new Error("fx_progress_invalid");
        const storePage = async (posts: XPostDto[], until: number) => {
          const from = Math.max(startedAt, until - FX_COLLECTION_LOOKBACK_HOURS * 3_600_000);
          const selected = posts.filter(post => Date.parse(post.createdAt) >= from && Date.parse(post.createdAt) <= until);
          result.postsReturned += selected.length;
          const stored = await writeStoredPosts(db, handle, { id: userId, username: handle }, selected, Date.now(), siteId,
            { origin: "fxembed", completeness: { text: true, media: true, relations: true } });
          if (!stored.ok) throw new Error(stored.error ?? "fx_storage_failed");
          result.postsStored += stored.count;
        };
        let requestsLeft = FX_COLLECTION_MAX_PAGES;
        if (cursor) {
          result.apiCalls++; requestsLeft--;
          const head = await fetchFxTimelinePage(handle, null, userId);
          await storePage(head.posts, Date.now());
        }
        const visited = new Set<string>();
        while (requestsLeft-- > 0) {
          const requestedCursor = cursor;
          if (requestedCursor) visited.add(requestedCursor);
          result.apiCalls++;
          const page = await fetchFxTimelinePage(handle, requestedCursor, userId);
          if (page.nextCursor && visited.has(page.nextCursor)) throw new FxApiError("fx_cursor_repeated");
          windowUntil ??= Date.now();
          await storePage(page.posts, windowUntil);
          pages++;
          const completed = page.nextCursor === null || pages === FX_COLLECTION_MAX_PAGES;
          cursor = completed ? null : page.nextCursor;
          const retired = existing && existing.window_until_at === null && (existing.cursor || existing.last_completed_at !== null)
            ? JSON.stringify({ cursor: existing.cursor, lastCompletedAt: existing.last_completed_at, retiredAt: Date.now(), reason: "recent_48h_check" }) : null;
          const ack = await db.prepare(`UPDATE x_fx_sources SET cursor=?,window_until_at=?,pages_completed=?,
            last_window_until_at=CASE WHEN ? THEN ? ELSE last_window_until_at END,
            last_window_limited=CASE WHEN ? THEN ? ELSE last_window_limited END,
            retired_progress=COALESCE(retired_progress,?),last_completed_at=CASE WHEN ? THEN ? ELSE last_completed_at END,updated_at=?
            WHERE handle=? AND EXISTS(SELECT 1 FROM x_post_sources source WHERE source.handle=x_fx_sources.handle
              AND source.lease_token=? AND source.lease_until>? AND NOT (${publicationHiddenSql("x_post_sources", "source", siteId)})) RETURNING handle`)
            .bind(cursor, windowUntil, pages, completed ? 1 : 0, windowUntil, completed ? 1 : 0, page.nextCursor ? 1 : 0, retired, completed ? 1 : 0, Date.now(), Date.now(), handle, lease.token, Date.now()).first();
          if (!ack) throw new Error("fx_cursor_ack_failed");
          if (completed) { if (page.nextCursor) result.recentCheck.limitedSources++; break; }
        }
        await db.prepare(`UPDATE x_fx_sources SET last_success_at=?,consecutive_failures=0,consecutive_successes=consecutive_successes+1,
          fallback_active=CASE WHEN consecutive_successes+1>=2 THEN 0 ELSE fallback_active END,last_error=NULL,updated_at=? WHERE handle=?`)
          .bind(Date.now(), Date.now(), handle).run();
        result.refreshedHandles++;
      } catch (error) {
        const providerFailure = error instanceof FxApiError;
        await db.prepare(`UPDATE x_fx_sources SET last_error=?,consecutive_successes=0,
          consecutive_failures=consecutive_failures+?,fallback_active=CASE WHEN ? AND consecutive_failures+1>=2 THEN 1 ELSE fallback_active END,
          updated_at=? WHERE handle=?`)
          .bind(error instanceof Error ? error.message : "fx_storage_failed", providerFailure ? 1 : 0, providerFailure ? 1 : 0, Date.now(), handle).run();
        result.status = "failed";
        result.error = providerFailure ? error.code : "fx_storage_failed";
      }
    }
    result.pendingSources = Number(await db.prepare("SELECT COUNT(*) AS count FROM x_fx_sources WHERE handle IN (SELECT value FROM json_each(?)) AND (cursor IS NOT NULL OR last_error IS NOT NULL)")
      .bind(JSON.stringify(lease.claimed)).first("count"));
    if (!lease.claimed.length) { result.status = "skipped"; result.error = "coalesced"; }
    result.success = result.status === "success" && result.pendingSources === 0;
    if (result.status === "success" && result.pendingSources) result.error = "x_collection_continuation_pending";
    result.updatedAt = new Date().toISOString();
    return result;
  } finally { await releaseXSourceLeases(env, lease.token); }
}
