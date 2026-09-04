type DB = Pick<D1Database, "prepare">;
export const X_PREVIEW_RESOURCE = "x_reference_preview_cost_micros";
const GLOBAL_RESOURCE = "x_api_cost_micros";

export class XReferenceBudgetError extends Error {
  readonly code:
    | "budget_exceeded"
    | "preview_budget_exceeded"
    | "budget_unavailable";
  constructor(
    code: "budget_exceeded" | "preview_budget_exceeded" | "budget_unavailable",
  ) {
    super(code);
    this.code = code;
  }
}

// Legacy untagged User lookups are conservatively included on the rollout day.
// New timeline/user calls are explicitly tagged and excluded from this subledger.
const previewEventPredicate = `(json_extract(detail, '$.purpose') = 'reference_preview'
  OR (json_extract(detail, '$.purpose') IS NULL AND operation IN ('tweet_lookup', 'user_lookup')))`;

export async function readXReferenceBudget(db: DB, timestamp = Date.now()) {
  const day = new Date(timestamp).toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00Z`);
  const settings = await db
    .prepare(
      `SELECT key, value FROM settings WHERE key IN
    ('x_collection_daily_budget_cents', 'x_reference_preview_daily_budget_cents')`,
    )
    .all<{ key: string; value: string }>();
  const values = new Map(settings.results.map((row) => [row.key, row.value]));
  const parse = (key: string, fallback: number) => {
    const value = values.get(key);
    const number = value == null ? fallback : Number(value);
    if (!Number.isInteger(number) || number < 0)
      throw new XReferenceBudgetError("budget_unavailable");
    return number * 10_000;
  };
  const globalLimit = Math.min(
    1_000_000,
    parse("x_collection_daily_budget_cents", 100),
  );
  const previewLimit = Math.min(
    globalLimit,
    parse("x_reference_preview_daily_budget_cents", 10),
  );
  const rows = await db
    .prepare(
      `SELECT resource, used, reserved FROM scheduled_usage_daily
    WHERE day = ? AND lane = 'all' AND resource IN (?, ?)`,
    )
    .bind(day, GLOBAL_RESOURCE, X_PREVIEW_RESOURCE)
    .all<{ resource: string; used: number; reserved: number }>();
  const ledger = new Map(rows.results.map((row) => [row.resource, row]));
  // Only reconstruct a missing ledger; never rescan history on every admitted call.
  const missingGlobal = !ledger.has(GLOBAL_RESOURCE);
  const missingPreview = !ledger.has(X_PREVIEW_RESOURCE);
  const legacy =
    missingGlobal || missingPreview
      ? await db
          .prepare(
            `SELECT COALESCE(SUM(estimated_cost_micros), 0) AS total,
        COALESCE(SUM(CASE WHEN ${previewEventPredicate} THEN estimated_cost_micros ELSE 0 END), 0) AS preview
        FROM x_api_usage_events WHERE created_at >= ? AND created_at < ?`,
          )
          .bind(start, start + 86_400_000)
          .first<{ total: number; preview: number }>()
      : null;
  const globalUsed = Number(
    ledger.get(GLOBAL_RESOURCE)?.used ?? legacy?.total ?? 0,
  );
  const previewUsed = Number(
    ledger.get(X_PREVIEW_RESOURCE)?.used ?? legacy?.preview ?? 0,
  );
  const globalReserved = Number(ledger.get(GLOBAL_RESOURCE)?.reserved ?? 0);
  const previewReserved = Number(ledger.get(X_PREVIEW_RESOURCE)?.reserved ?? 0);
  return {
    day,
    globalLimit,
    previewLimit,
    globalUsed,
    previewUsed,
    globalReserved,
    previewReserved,
    remaining: Math.max(
      0,
      Math.min(
        globalLimit - globalUsed - globalReserved,
        previewLimit - previewUsed - previewReserved,
      ),
    ),
  };
}

export async function reserveXReferenceBudget(
  db: DB,
  amount: number,
  timestamp = Date.now(),
) {
  try {
    const budget = await readXReferenceBudget(db, timestamp);
    if (budget.globalUsed + budget.globalReserved + amount > budget.globalLimit)
      throw new XReferenceBudgetError("budget_exceeded");
    if (
      budget.previewUsed + budget.previewReserved + amount >
      budget.previewLimit
    )
      throw new XReferenceBudgetError("preview_budget_exceeded");
    // Seeding and refreshing limits reserves nothing. The subsequent single UPDATE
    // is the atomic admission of BOTH resources, even across concurrent shards.
    await db
      .prepare(
        `INSERT INTO scheduled_usage_daily(day,lane,resource,used,reserved,limit_value,updated_at)
      VALUES (?,'all',?,?,0,?,?), (?,'all',?,?,0,?,?)
      ON CONFLICT(day,lane,resource) DO UPDATE SET limit_value=excluded.limit_value`,
      )
      .bind(
        budget.day,
        GLOBAL_RESOURCE,
        budget.globalUsed,
        Math.max(1, budget.globalLimit),
        timestamp,
        budget.day,
        X_PREVIEW_RESOURCE,
        budget.previewUsed,
        Math.max(1, budget.previewLimit),
        timestamp,
      )
      .run();
    const admission = await db
      .prepare(
        `WITH eligible AS MATERIALIZED (
      SELECT COUNT(*) AS count FROM scheduled_usage_daily WHERE day=? AND lane='all'
      AND resource IN (?,?) AND used+reserved+?<=limit_value
    ) UPDATE scheduled_usage_daily SET reserved=reserved+?, updated_at=?
      WHERE day=? AND lane='all' AND resource IN (?,?) AND (SELECT count FROM eligible)=2
      RETURNING resource`,
      )
      .bind(
        budget.day,
        GLOBAL_RESOURCE,
        X_PREVIEW_RESOURCE,
        amount,
        amount,
        timestamp,
        budget.day,
        GLOBAL_RESOURCE,
        X_PREVIEW_RESOURCE,
      )
      .all<{ resource: string }>();
    if (admission.results.length !== 2)
      throw new XReferenceBudgetError("preview_budget_exceeded");
    let settled = false;
    return async (actual = 0) => {
      if (settled) return;
      try {
        await db
          .prepare(
            `UPDATE scheduled_usage_daily SET reserved=MAX(0,reserved-?),used=used+?,updated_at=?
        WHERE day=? AND lane='all' AND resource IN (?,?)`,
          )
          .bind(
            amount,
            Math.max(0, Math.trunc(actual)),
            Date.now(),
            budget.day,
            GLOBAL_RESOURCE,
            X_PREVIEW_RESOURCE,
          )
          .run();
      } catch {
        throw new XReferenceBudgetError("budget_unavailable");
      }
      settled = true;
    };
  } catch (error) {
    if (error instanceof XReferenceBudgetError) throw error;
    throw new XReferenceBudgetError("budget_unavailable");
  }
}
