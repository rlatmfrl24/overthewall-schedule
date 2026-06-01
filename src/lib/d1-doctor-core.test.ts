import { describe, expect, it } from "vitest";

const loadDoctorCore = () => import("../../scripts/d1-doctor-core.mjs");

describe("d1 doctor migration status", () => {
  it("passes when wrangler reports no pending migrations", async () => {
    const { getMigrationListStatus } = await loadDoctorCore();

    expect(
      getMigrationListStatus("Resource location: local\nNo migrations to apply"),
    ).toEqual({
      ok: true,
      message: "no pending migrations",
    });
  });

  it("fails when wrangler output does not confirm migrations are clean", async () => {
    const { getMigrationListStatus } = await loadDoctorCore();

    expect(
      getMigrationListStatus("Migrations to be applied:\n0029_example.sql"),
    ).toEqual({
      ok: false,
      message:
        "pending migrations detected; apply local migrations before continuing",
    });
  });
});
