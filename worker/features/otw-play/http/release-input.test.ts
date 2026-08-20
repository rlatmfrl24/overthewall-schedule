import { describe, expect, it } from "vitest";
import { parseReleaseRequest } from "./release-input";

describe("OTW Play release input", () => {
  const valid = {
    expected: {
      publicReadEnabled: false,
      navigationVisible: false,
      updatedAt: 10,
    },
    target: { publicReadEnabled: true, navigationVisible: false },
    confirmation: "direct_routes_verified",
  };

  it("parses the exact release command contract", () => {
    expect(parseReleaseRequest(valid)).toEqual({ ok: true, value: valid });
  });

  it.each([
    { ...valid, extra: true },
    { ...valid, expected: { ...valid.expected, extra: true } },
    { ...valid, expected: { ...valid.expected, updatedAt: -1 } },
    { ...valid, target: { publicReadEnabled: 1, navigationVisible: false } },
    { ...valid, confirmation: "yes" },
  ])("rejects malformed or additive command %#", (value) => {
    expect(parseReleaseRequest(value).ok).toBe(false);
  });
});
