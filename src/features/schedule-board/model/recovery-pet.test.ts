import { describe, expect, it } from "vitest";
import { getRecoveryPetDays } from "./recovery-pet";

describe("getRecoveryPetDays", () => {
  it.each([
    ["2026-11-15T14:59:59.999Z", null],
    ["2026-11-15T15:00:00.000Z", 1],
    ["2026-11-16T14:59:59.999Z", 1],
    ["2026-11-16T15:00:00.000Z", 2],
    ["2026-12-31T15:00:00.000Z", 47],
    ["2027-11-15T15:00:00.000Z", 366],
  ])("counts elapsed Korean calendar days at %s as %s", (instant, days) => {
    expect(getRecoveryPetDays("luvdia", Date.parse(instant))).toBe(days);
  });

  it("keeps the pet exclusive to LuvDia after the cutoff", () => {
    expect(getRecoveryPetDays("otw", Date.parse("2026-11-16T00:00:00+09:00"))).toBeNull();
  });
});
