import type { SiteId } from "@contracts/site-definition";
import { getHiddenMemberCodes } from "@contracts/site-publication";
/** archiveSource persists this receipt in the same transaction as root access.
 * Target acknowledgements are provenance, never target access policy. */
export const CONTENT_ACCESS_REVISION_SQL = `((SELECT COALESCE(SUM(json_extract(archive_receipt_json, '$.archivedRoots')), 0)
  FROM content_transitions WHERE local_site = source_site AND archive_receipt_json IS NOT NULL)
  + (SELECT count(*) FROM content_transitions WHERE local_site=target_site AND phase IN ('target_owned','complete') AND fence_json IS NOT NULL AND installation_json IS NOT NULL))`;

export async function readContentAccessRevision(db: D1Database, siteId?: SiteId): Promise<number> {
  const revision = Number(await db.prepare(`SELECT ${CONTENT_ACCESS_REVISION_SQL} AS revision`).first<number>("revision"));
  return siteId ? revision * 2 + Number(getHiddenMemberCodes(siteId, Date.now()).length > 0) : revision;
}
