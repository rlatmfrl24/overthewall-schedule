import { describe, expect, it } from "vitest";
import { getD1DoctorChecks, REQUIRED_D1_COLUMNS } from "./d1-doctor-core.mjs";

describe("D1 deployment schema checks", () => {
  it("checks the runtime publication, maintenance and X repair prerequisites", () => {
    expect(REQUIRED_D1_COLUMNS.content_transitions).toEqual(expect.arrayContaining(["aborted_at", "maintenance_state"]));
    expect(REQUIRED_D1_COLUMNS.scheduled_outbox).toContain("reconciled_at");
    expect(REQUIRED_D1_COLUMNS.x_post_repair_work).toEqual(expect.arrayContaining(["post_id", "generation"]));
  });
  it("retains migration and required-column checks without scanning business data", () => {
    expect(getD1DoctorChecks(true)).toEqual(["migrations", "schema"]);
  });
  it("keeps full local data diagnostics by default", () => {
    expect(getD1DoctorChecks()).toEqual([
      "migrations", "schema", "catalog", "readModel", "sortKeys", "searchGrams", "submissionLimit", "youtubeQuota",
    ]);
  });
});
