import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import * as schema from "@db/schema";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RETIRED_SETTINGS_KEYS } from "../../../../contracts/configuration";
import type { Env } from "../../../platform/types";
import { SettingsService } from "../application/settings-service";
import { DrizzleSettingsAudit } from "../infrastructure/settings-audit";
import { DrizzleSettingsRepository } from "../infrastructure/settings-repository";
import { createAdminSettingsHandler } from "./settings-handler";

// Authentication has its own JWT/role tests; persistence and HTTP parsing here
// use the production handler, service and repositories against actual D1.
vi.mock("../../../platform/auth", () => ({
  requireAdminUser: vi.fn(async () => ({ ok: true, user: { id: "admin", displayName: "Admin" } })),
}));
const testEnv = env as unknown as Env & { SETTINGS_MIGRATIONS: D1Migration[] };
const db = testEnv.otw_db;
const handle = createAdminSettingsHandler(() => {
  const database = drizzle(db, { schema });
  return new SettingsService(new DrizzleSettingsRepository(database), new DrizzleSettingsAudit(database));
});
const update = (body: Record<string, string>) => handle(new Request("https://otw.test/api/settings", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}), testEnv);
const readback = async () => ({
  settings: (await db.prepare("SELECT key, value, updated_at FROM settings ORDER BY key").all()).results,
  audit: (await db.prepare("SELECT * FROM admin_audit_logs ORDER BY id").all()).results,
});

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.SETTINGS_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM admin_audit_logs"),
    db.prepare("UPDATE settings SET value = '1000', updated_at = '1' WHERE key = 'youtube_api_daily_quota_units'"),
  ]);
});

describe("admin settings HTTP with actual D1 persistence", () => {
  it.each(RETIRED_SETTINGS_KEYS)("rejects %s alone and in a mixed update without any persisted change", async (key) => {
    const before = await readback();
    for (const body of [{ [key]: "true" }, { [key]: "true", youtube_api_daily_quota_units: "500" }]) {
      const response = await update(body);
      expect(response.status).toBe(400);
      expect(await response.text()).toContain(key);
      expect(await readback()).toEqual(before);
    }
  });
  it("saves the canonical budget and returns the authoritative value with one audit", async () => {
    expect((await update({ youtube_api_daily_quota_units: "500" })).status).toBe(200);
    const response = await handle(new Request("https://otw.test/api/settings"), testEnv);
    expect(await response.json()).toMatchObject({ youtube_api_daily_quota_units: "500" });
    const persisted = await readback();
    expect(persisted.settings.find(row => row.key === "youtube_api_daily_quota_units")?.value).toBe("500");
    expect(persisted.audit).toHaveLength(1);
    expect(persisted.audit[0].event_type).toBe("settings.update");
  });
});
