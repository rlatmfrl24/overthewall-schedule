// Incomplete reference writes need replay; legacy complete and protected rows never do.
export async function readStoredRssCandidateIds(db: D1Database, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await db.prepare(`SELECT id FROM x_posts WHERE id IN (SELECT value FROM json_each(?))
    AND (hidden_at IS NOT NULL OR content_removed_at IS NOT NULL OR content_access<>'normal' OR source_authority IS NULL OR content_hash IS NOT NULL)`)
    .bind(JSON.stringify(ids)).all<{ id: string }>();
  return rows.results.map(row => row.id);
}
