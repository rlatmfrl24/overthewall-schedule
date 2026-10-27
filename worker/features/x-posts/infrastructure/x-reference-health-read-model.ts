import type { XReferencePendingReasonDto } from "@contracts/x-posts";

type Group = {
  relation: "reply" | "quote";
  stage: "post" | "author";
  state: "pending" | "terminal" | "preview" | "link";
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
  // Group before stage fan-out; CROSS JOIN filters settled references before parent lookups.
  const rows = await db.prepare(`
    WITH grouped AS MATERIALIZED (
      SELECT r.relation_type AS relation, r.resolution_state, r.hydrated_at IS NULL AS needs_body,
        r.author_state, r.last_error_code AS post_code, r.author_last_error_code AS author_code,
        CASE WHEN r.relation_type='reply' AND r.resolution_state<>'terminal' THEN
          CASE WHEN json_valid(p.value) AND json_extract(p.value,'$.reply.post.id')=r.referenced_post_id
            THEN 'preview' ELSE 'link' END END AS reply_display,
        COUNT(*) AS amount, MIN(r.created_at) AS oldest,
        MIN(r.next_attempt_at) AS post_next, MIN(r.author_next_attempt_at) AS author_next
      FROM x_post_references r CROSS JOIN x_posts p ON p.id=r.source_post_id
      WHERE p.hidden_at IS NULL AND p.content_removed_at IS NULL
        AND (r.relation_type='reply' OR r.resolution_state='terminal'
          OR (r.relation_type='quote' AND (
            (r.resolution_state IN ('pending','local','link_only') AND r.hydrated_at IS NULL)
            OR (r.author_state='pending' AND r.resolution_state<>'terminal'))))
      GROUP BY relation, r.resolution_state, needs_body, r.author_state, post_code, author_code, reply_display
    ), stages AS (
      SELECT relation, 'post' AS stage,
        CASE WHEN resolution_state='terminal' THEN 'terminal' ELSE 'pending' END AS state,
        post_code AS code, amount, oldest, post_next AS next
      FROM grouped WHERE resolution_state='terminal'
        OR (relation='quote' AND resolution_state IN ('pending','local','link_only') AND needs_body)
      UNION ALL
      SELECT relation, 'author', 'pending', author_code, amount, oldest, author_next
      FROM grouped WHERE relation='quote' AND author_state='pending' AND resolution_state<>'terminal'
      UNION ALL
      SELECT relation, 'post', reply_display, NULL, amount, oldest, NULL
      FROM grouped WHERE relation='reply' AND resolution_state<>'terminal'
    )
    SELECT relation, stage, state, code, SUM(amount) AS count,
      MIN(oldest) AS oldest, MIN(next) AS next
    FROM stages GROUP BY relation, stage, state, code
    ORDER BY relation, stage, state, code
  `).all<Group>();
  const byRelation = (["reply", "quote"] as const).map((relation) => ({ relation, pendingPosts: 0, pendingAuthors: 0, terminal: 0 }));
  const pendingReasons: XReferencePendingReasonDto[] = [];
  const replyDisplay = { withPreview: 0, linkOnly: 0, terminal: 0 };
  let oldestPendingAt: number | null = null;
  let nextAttemptAt: number | null = null;
  let errors = 0;
  for (const row of rows.results) {
    const group = byRelation.find((item) => item.relation === row.relation)!;
    const amount = Number(row.count);
    if (row.state === "preview") { replyDisplay.withPreview += amount; continue; }
    if (row.state === "link") { replyDisplay.linkOnly += amount; continue; }
    if (row.state === "terminal") {
      group.terminal += amount;
      if (row.relation === "reply") replyDisplay.terminal += amount;
      continue;
    }
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
    replyPolicy: "stored_or_link" as const,
    replyDisplay,
    pendingPosts: byRelation.reduce((sum, group) => sum + group.pendingPosts, 0),
    pendingAuthors: byRelation.reduce((sum, group) => sum + group.pendingAuthors, 0),
    terminal: byRelation.reduce((sum, group) => sum + group.terminal, 0),
    oldestPendingAt, nextAttemptAt, errors, byRelation, pendingReasons,
  };
}
