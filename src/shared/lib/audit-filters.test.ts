import { describe, expect, it } from "vitest";
import { parseLogFilters } from "@contracts/audit";

describe("log filters", () => {
  it("keeps optional filters literal, with inclusive calendar boundaries", () => {
    expect(parseLogFilters(new URLSearchParams({q: "  50%_수집  ", target: "x", action: "run", status: "partial", from: "2026-09-01", until: "2026-09-05"}))).toEqual({q: "50%_수집", target: "x", action: "run", status: "partial", from: "2026-09-01", until: "2026-09-05"});
  });
  it.each(["from=2026-02-29", "until=2026-13-01", "from=2026-09-05&until=2026-09-01", `q=${"a".repeat(201)}`])("rejects invalid filter %s", (query) => {
    expect(() => parseLogFilters(new URLSearchParams(query))).toThrow();
  });
});
