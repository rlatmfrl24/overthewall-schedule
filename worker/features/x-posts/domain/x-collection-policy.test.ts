import { describe, expect, it } from "vitest";
import { getOfficialAccountDecision } from "./x-collection-policy";

const HOUR = 3_600_000;
const baseline = { now: 30 * HOUR, activatedAt: HOUR, regularCompletedAt: 18 * HOUR, completedAt: 29 * HOUR, pending: false, originScope: null, fallbackActive: false, backoffUntil: null } as const;

describe("independent official account policy", () => {
  it("does_not_gate_healthy_accounts_on_failed_peer", () => {
    const healthy = getOfficialAccountDecision(baseline);
    const failed = getOfficialAccountDecision({ ...baseline, regularCompletedAt: HOUR, backoffUntil: 31 * HOUR });
    expect(healthy.nominalDueAt).toBe(baseline.regularCompletedAt + 12 * HOUR);
    expect(healthy.scope).toBe("regular");
    expect(failed.scope).toBeNull();
    expect(failed.health).toBe("overdue");
  });
  it.each([[12 * HOUR - 1, "waiting"], [12 * HOUR, "due"], [18 * HOUR, "attention"], [24 * HOUR, "overdue"]] as const)("classifies exact age %s", (age, health) => {
    expect(getOfficialAccountDecision({ ...baseline, now: baseline.regularCompletedAt + age }).health).toBe(health);
  });
  it("makes an account without regular history immediately due without inventing completion", () => {
    expect(getOfficialAccountDecision({ ...baseline, activatedAt: baseline.now, regularCompletedAt: null })).toMatchObject({ scope: "regular", nominalDueAt: baseline.now, ageMs: 0, health: "due" });
  });
  it("preserves pending origin and never infers regular for old unknown pending", () => {
    expect(getOfficialAccountDecision({ ...baseline, pending: true, originScope: "regular" })).toMatchObject({ scope: "pending", originScope: "regular" });
    expect(getOfficialAccountDecision({ ...baseline, pending: true })).toMatchObject({ scope: "pending", originScope: "pending" });
  });
  it("chooses pending then regular then two-hour fallback, respecting backoff", () => {
    expect(getOfficialAccountDecision({ ...baseline, fallbackActive: true }).scope).toBe("regular");
    expect(getOfficialAccountDecision({ ...baseline, now: 20 * HOUR, completedAt: 18 * HOUR, fallbackActive: true }).scope).toBe("fallback");
    expect(getOfficialAccountDecision({ ...baseline, pending: true, backoffUntil: 31 * HOUR })).toMatchObject({ scope: null, eligibleAt: 31 * HOUR });
  });
});
