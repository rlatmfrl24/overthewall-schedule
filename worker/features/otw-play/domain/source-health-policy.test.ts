import { describe, expect, it } from "vitest";
import {
  getNextSourceCheckAt,
  getSourceRetryAt,
} from "./source-health-policy";

describe("OTW Play source health policy", () => {
  it.each([
    ["playable", 24],
    ["private", 6],
    ["unavailable", 6],
    ["embed_disabled", 24],
    ["region_blocked", 24],
    ["deleted", 24 * 7],
  ] as const)("schedules %s after %s hours", (status, hours) => {
    expect(getNextSourceCheckAt(status, 1_000)).toBe(
      1_000 + hours * 60 * 60_000,
    );
  });

  it("clamps provider Retry-After and applies fixed retry policies", () => {
    expect(getSourceRetryAt("timeout", 0)).toBe(30 * 60_000);
    expect(getSourceRetryAt("rate_limited", 0, 1)).toBe(15 * 60_000);
    expect(getSourceRetryAt("rate_limited", 0, 48 * 60 * 60_000)).toBe(
      24 * 60 * 60_000,
    );
    expect(getSourceRetryAt("quota_exceeded", 0)).toBe(24 * 60 * 60_000);
  });
});
