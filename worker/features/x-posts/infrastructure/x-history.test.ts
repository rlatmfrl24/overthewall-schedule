import { describe, expect, it } from "vitest";
import { parseComplianceResultIds } from "./x-history";

describe("X Compliance result parsing", () => {
  it("redacts only removal events and ignores geo-only or edit events", () => {
    const result = [
      { id: "1", action: "delete", reason: "deleted" },
      { tweet_id: "2", action: "delete", reason: "protected" },
      { id: "3", action: "delete", reason: "scrub_geo" },
      { id: "4", action: "tweet_edit", reason: "edited" },
      { id: "5", action: "delete", reason: "suspended" },
    ].map((row) => JSON.stringify(row)).join("\n");

    expect(parseComplianceResultIds(result)).toEqual(["1", "2", "5"]);
  });

  it("ignores malformed and identifier-free result lines", () => {
    expect(parseComplianceResultIds([
      "not-json",
      JSON.stringify({ action: "delete", reason: "deleted" }),
      "",
    ].join("\n"))).toEqual([]);
  });
});
