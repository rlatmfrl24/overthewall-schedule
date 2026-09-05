import type { XReferencePendingReasonDto } from "@contracts/x-posts";

type Group = {
  relation: "reply" | "quote";
  stage: "post" | "author";
  state: "pending" | "terminal";
  code: string | null;
  count: number;
  oldest: number | null;
  next: number | null;
};

const earliest = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.min(a, b);
const normalDeferral = new Set(["", "budget_exceeded", "preview_budget_exceeded", "preview_disabled"]);

/** One read of persisted relation state; no provider calls, repairs or budget reservations. */
export async function readXReferenceHealthCounts(db: Pick<D1Database, "prepare">) {
  const rows = await db.prepare(`
    WITH visible_references AS (
      SELECT r.* FROM x_post_references r JOIN x_posts p ON p.id = r.source_post_id
      WHERE p.hidden_at IS NULL AND p.content_removed_at IS NULL
    ), stages AS (
      SELECT relation_type AS relation, 'post' AS stage,
        CASE WHEN resolution_state = 'terminal' THEN 'terminal' ELSE 'pending' END AS state,
        last_error_code AS code, created_at, next_attempt_at AS next
      FROM visible_references
      WHERE resolution_state = 'terminal'
        OR (resolution_state IN ('pending', 'local', 'link_only') AND hydrated_at IS NULL)
      UNION ALL
      SELECT relation_type, 'author', 'pending', author_last_error_code, created_at, author_next_attempt_at
      FROM visible_references WHERE author_state = 'pending' AND resolution_state <> 'terminal'
    )
    SELECT relation, stage, state, code, COUNT(*) AS count,
      MIN(created_at) AS oldest, MIN(next) AS next
    FROM stages GROUP BY relation, stage, state, code
    ORDER BY relation, stage, state, code
  `).all<Group>();
  const byRelation = (["reply", "quote"] as const).map((relation) => ({ relation, pendingPosts: 0, pendingAuthors: 0, terminal: 0 }));
  const pendingReasons: XReferencePendingReasonDto[] = [];
  let oldestPendingAt: number | null = null;
  let nextAttemptAt: number | null = null;
  let errors = 0;
  for (const row of rows.results) {
    const group = byRelation.find((item) => item.relation === row.relation)!;
    const amount = Number(row.count);
    if (row.state === "terminal") { group.terminal += amount; continue; }
    group[row.stage === "post" ? "pendingPosts" : "pendingAuthors"] += amount;
    oldestPendingAt = earliest(oldestPendingAt, row.oldest);
    nextAttemptAt = earliest(nextAttemptAt, row.next);
    if (!normalDeferral.has(row.code ?? "")) errors += amount;
    const reason = pendingReasons.find((item) => item.stage === row.stage && item.code === row.code);
    if (reason) {
      reason.count += amount;
      reason.nextAttemptAt = earliest(reason.nextAttemptAt, row.next);
    } else pendingReasons.push({ stage: row.stage, code: row.code, count: amount, nextAttemptAt: row.next });
  }
  return {
    pendingPosts: byRelation.reduce((sum, group) => sum + group.pendingPosts, 0),
    pendingAuthors: byRelation.reduce((sum, group) => sum + group.pendingAuthors, 0),
    terminal: byRelation.reduce((sum, group) => sum + group.terminal, 0),
    oldestPendingAt, nextAttemptAt, errors, byRelation, pendingReasons,
  };
}
