import { X_FALLBACK_INTERVAL_MS, X_HYBRID_REGULAR_INTERVAL_MS, type XCollectionScope } from "@contracts/x-collection";

export function getOfficialAccountDecision(input: {
  now: number;
  activatedAt: number;
  regularCompletedAt: number | null;
  completedAt: number | null;
  pending: boolean;
  originScope: XCollectionScope | null;
  fallbackActive: boolean;
  backoffUntil: number | null;
}): { scope: XCollectionScope | null; originScope: XCollectionScope; nominalDueAt: number; eligibleAt: number; ageMs: number; health: "due" | "attention" | "overdue" | "waiting" } {
  const ageMs = Math.max(0, input.now - (input.regularCompletedAt ?? input.activatedAt));
  const regularDueAt = input.regularCompletedAt === null ? input.activatedAt : input.regularCompletedAt + X_HYBRID_REGULAR_INTERVAL_MS;
  const scope = input.pending ? "pending" : input.now >= regularDueAt ? "regular" : input.fallbackActive ? "fallback" : null;
  const nominalDueAt = scope === "pending" ? input.completedAt ?? input.activatedAt : scope === "fallback" ? (input.completedAt === null ? input.activatedAt : input.completedAt + X_FALLBACK_INTERVAL_MS) : regularDueAt;
  const eligibleAt = Math.max(nominalDueAt, input.backoffUntil ?? 0);
  return {
    scope: scope && input.now >= eligibleAt ? scope : null,
    originScope: input.pending ? input.originScope ?? "pending" : scope ?? "regular",
    nominalDueAt,
    eligibleAt,
    ageMs,
    health: ageMs >= 24 * 3_600_000 ? "overdue" : ageMs >= 18 * 3_600_000 ? "attention" : input.now >= regularDueAt ? "due" : "waiting",
  };
}
