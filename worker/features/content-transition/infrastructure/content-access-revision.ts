/** archiveSource persists this receipt in the same transaction as root access.
 * Target acknowledgements are provenance, never target access policy. */
export const CONTENT_ACCESS_REVISION_SQL = `(SELECT COALESCE(SUM(json_extract(archive_receipt_json, '$.archivedRoots')), 0)
  FROM content_transitions WHERE local_site = source_site AND archive_receipt_json IS NOT NULL)`;

export async function readContentAccessRevision(db: D1Database): Promise<number> {
  return Number(await db.prepare(`SELECT ${CONTENT_ACCESS_REVISION_SQL} AS revision`).first<number>("revision"));
}
