import type { AdminReviewSummaryDto } from "@contracts/operations";

// Operational read model only: do not materialize a catalog or contact a provider.
export async function readAdminReviewSummary(db: D1Database, now: number): Promise<AdminReviewSummaryDto> {
  const queries = {
    proposals: "SELECT COUNT(*) AS count FROM music_cover_proposals WHERE status = 'pending_review'",
    automatic: `SELECT COUNT(DISTINCT c.id) AS count FROM music_ingestion_candidates c
      JOIN music_channel_upload_candidate_origins o ON o.candidate_id = c.id
      JOIN music_channel_upload_monitors m ON m.id = o.monitor_id
      WHERE c.status NOT IN ('ignored', 'converted') AND o.monitor_generation = m.generation`,
    imports: `SELECT COUNT(*) AS count FROM music_ingestion_candidates c
      WHERE c.status NOT IN ('ignored', 'converted')
      AND EXISTS (SELECT 1 FROM music_ingestion_candidate_origins i WHERE i.candidate_id = c.id)`,
  };
  const entries = await Promise.all(Object.entries(queries).map(async ([kind, query]) => {
    try {
      const row = await db.prepare(query).first<{ count: number }>();
      if (!row || typeof row.count !== "number") throw new Error("Missing count");
      return { kind: kind as "proposals" | "automatic" | "imports", status: "available" as const, count: row.count, checkedAt: now };
    } catch {
      return { kind: kind as "proposals" | "automatic" | "imports", status: "unavailable" as const, count: null, checkedAt: now };
    }
  }));
  return { entries };
}
