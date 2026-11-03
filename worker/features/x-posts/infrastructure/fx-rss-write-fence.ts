import type { SiteId } from "@contracts/site-definition";
import { publicationHiddenSql } from "../../content-access";

export type FxRssWriteFence = {
  handle: string; itemId: string; itemLeaseToken: string; sourceLeaseToken: string;
  members: Array<{ uid: number; urlTwitter: string }>;
};

export function fxRssWriteFenceSql(fence: FxRssWriteFence | undefined, siteId: SiteId, requirePointer = true) {
  if (!fence) return { sql: "1", bindings: [] as string[] };
  // SQL time also protects a statement prepared before its lease expires.
  const now = `max(CAST((julianday('now')-2440587.5)*86400000 AS INTEGER),${Date.now()})`;
  return { sql: `EXISTS(SELECT 1 FROM x_post_sources rss_source JOIN scheduled_job_items rss_item ON rss_item.id=?
    WHERE rss_source.handle=? AND rss_source.deactivated_at IS NULL
      AND rss_source.lease_token=? AND rss_source.lease_until>${now}
      AND rss_item.status='running' AND rss_item.lease_token=? AND rss_item.lease_until>${now}
      ${requirePointer ? "AND EXISTS(SELECT 1 FROM x_fx_sources rss_pending WHERE rss_pending.handle=rss_source.handle AND rss_pending.rss_pending_item_id=rss_item.id)" : ""}
      AND EXISTS(SELECT 1 FROM settings WHERE key='x_collection_enabled' AND value='true')
      AND EXISTS(SELECT 1 FROM settings WHERE key='x_collection_primary_source' AND value='fxembed')
      AND EXISTS(SELECT 1 FROM settings WHERE key='x_collection_hybrid_policy' AND value='rss_v1')
      AND EXISTS(SELECT 1 FROM settings WHERE key='x_collection_hybrid_activated_at'
        AND CASE WHEN json_valid(value) THEN json_type(value) IN ('integer','real') AND CAST(value AS REAL)>0 ELSE 0 END)
      AND EXISTS(SELECT 1 FROM members rss_member JOIN json_each(?) rss_allowed
        ON rss_member.uid=json_extract(rss_allowed.value,'$.uid') AND rss_member.url_twitter=json_extract(rss_allowed.value,'$.urlTwitter')
        WHERE coalesce(rss_member.is_deprecated,0)=0 AND rss_member.content_access='normal'
          AND NOT (${publicationHiddenSql("members", "rss_member", siteId)})))`,
    bindings: [fence.itemId, fence.handle, fence.sourceLeaseToken, fence.itemLeaseToken, JSON.stringify(fence.members)] };
}
