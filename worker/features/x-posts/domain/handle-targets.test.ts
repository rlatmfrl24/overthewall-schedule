import { describe, expect, it } from "vitest";
import {
  extractXHandle,
  parseXHandleTargets,
  parseXMaxResults,
} from "./handle-targets";

describe("X handle target policy", () => {
  it("deduplicates handles case-insensitively", () => {
    expect(parseXHandleTargets("@Otw_Member,otw_member,Second")).toEqual({
      ok: true,
      handles: ["Otw_Member", "Second"],
    });
  });

  it("enforces handle count, format, and maxResults bounds", () => {
    expect(parseXHandleTargets("invalid-handle")).toMatchObject({ ok: false });
    expect(
      parseXHandleTargets(
        Array.from({ length: 21 }, (_, index) => `user_${index}`).join(","),
      ),
    ).toMatchObject({ ok: false });
    expect(parseXMaxResults("4")).toBeNull();
    expect(parseXMaxResults("21")).toBeNull();
    expect(parseXMaxResults("5")).toBe(5);
  });

  it("extracts only X or Twitter profile handles for the allowlist", () => {
    expect(extractXHandle("https://x.com/Otw_Member")).toBe("Otw_Member");
    expect(extractXHandle("twitter.com/Second")).toBe("Second");
    expect(extractXHandle("https://example.com/Otw_Member")).toBeNull();
  });
});
