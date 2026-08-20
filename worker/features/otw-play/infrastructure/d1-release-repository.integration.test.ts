import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type {
  OtwPlayAdminReleaseFlagsDto,
  OtwPlayAdminReleaseTransition,
} from "@contracts/otw-play";
import type { ReleaseUpdateCommand } from "../application/ports/release-repository";
import { D1ReleaseRepository } from "./d1-release-repository";

type ReleaseTestEnv = Env & {
  OTW_PLAY_RELEASE_MIGRATIONS: D1Migration[];
};

const testEnv = env as ReleaseTestEnv;
const db = testEnv.otw_db;
const repository = new D1ReleaseRepository(db);
const flags = (
  publicReadEnabled: boolean,
  navigationVisible: boolean,
): OtwPlayAdminReleaseFlagsDto => ({ publicReadEnabled, navigationVisible });

const command = (
  expected: OtwPlayAdminReleaseFlagsDto & { updatedAt: number },
  target: OtwPlayAdminReleaseFlagsDto,
  transition: OtwPlayAdminReleaseTransition,
  changedAt: number,
  auditId = `audit-${changedAt}`,
): ReleaseUpdateCommand => ({
  expected,
  target,
  transition,
  changedAt,
  auditId,
  actor: {
    userId: "admin-1",
    displayName: "Admin",
    ipAddress: "127.0.0.1",
  },
});

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_RELEASE_MIGRATIONS);
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DROP TRIGGER IF EXISTS fail_release_audit"),
    db.prepare(
      "DELETE FROM admin_audit_logs WHERE event_type = 'otw_play.release.updated'",
    ),
    db.prepare(`UPDATE music_catalog_meta
      SET revision = 7, public_read_enabled = 0, navigation_visible = 0,
          updated_at = 10 WHERE id = 1`),
    db.prepare(`UPDATE music_public_read_model_meta
      SET revision = 7, updated_at = 10 WHERE id = 1`),
  ]);
});

describe("D1 OTW Play release repository", () => {
  it("reads authoritative flags and revision readiness", async () => {
    await expect(repository.readState()).resolves.toEqual({
      publicReadEnabled: false,
      navigationVisible: false,
      catalogRevision: 7,
      readModelRevision: 7,
      updatedAt: 10,
      readyForPublicRead: true,
    });
  });

  it("performs 0/0 -> 1/0 -> 1/1 and both rollback forms without revision changes", async () => {
    const publicResult = await repository.update(
      command(
        { ...flags(false, false), updatedAt: 10 },
        flags(true, false),
        "enable_public_read",
        11,
      ),
    );
    expect(publicResult).toMatchObject({
      kind: "updated",
      response: { data: { publicReadEnabled: true, navigationVisible: false } },
    });
    if (publicResult.kind === "updated") {
      expect(publicResult.diagnostics.rowsWritten).toBeGreaterThanOrEqual(2);
    }
    const navigationResult = await repository.update(
      command(
        { ...flags(true, false), updatedAt: 11 },
        flags(true, true),
        "enable_navigation",
        12,
      ),
    );
    expect(navigationResult.kind).toBe("updated");
    const navigationRollback = await repository.update(
      command(
        { ...flags(true, true), updatedAt: 12 },
        flags(true, false),
        "disable_navigation",
        13,
      ),
    );
    expect(navigationRollback.kind).toBe("updated");
    const fullRollback = await repository.update(
      command(
        { ...flags(true, false), updatedAt: 13 },
        flags(false, false),
        "rollback_all",
        14,
      ),
    );
    expect(fullRollback).toMatchObject({
      kind: "updated",
      response: {
        data: {
          publicReadEnabled: false,
          navigationVisible: false,
          catalogRevision: 7,
          readModelRevision: 7,
        },
      },
    });
    const audits = await repository.readRecentChanges(20);
    expect(audits).toHaveLength(4);
    expect(audits[0]).toMatchObject({
      transition: "rollback_all",
      actor: { id: "admin-1", displayName: "Admin" },
      changedAt: 14,
    });
  });

  it("allows direct 1/1 -> 0/0 rollback without revision readiness", async () => {
    await db.batch([
      db.prepare(`UPDATE music_catalog_meta SET public_read_enabled = 1,
        navigation_visible = 1, updated_at = 20 WHERE id = 1`),
      db.prepare("UPDATE music_public_read_model_meta SET revision = 6 WHERE id = 1"),
    ]);
    const result = await repository.update(
      command(
        { ...flags(true, true), updatedAt: 20 },
        flags(false, false),
        "rollback_all",
        21,
      ),
    );
    expect(result).toMatchObject({
      kind: "updated",
      response: { data: { publicReadEnabled: false, navigationVisible: false } },
    });
  });

  it("fails public activation closed when catalog and read-model revisions differ", async () => {
    await db.prepare(
      "UPDATE music_public_read_model_meta SET revision = 6 WHERE id = 1",
    ).run();
    const result = await repository.update(
      command(
        { ...flags(false, false), updatedAt: 10 },
        flags(true, false),
        "enable_public_read",
        11,
      ),
    );
    expect(result).toMatchObject({ kind: "policy_unresolved" });
    expect(await repository.readRecentChanges(20)).toEqual([]);
    expect(await repository.readState()).toMatchObject(flags(false, false));
  });

  it("lets only one concurrent CAS command update and audit", async () => {
    const expected = { ...flags(false, false), updatedAt: 10 };
    const [left, right] = await Promise.all([
      repository.update(
        command(expected, flags(true, false), "enable_public_read", 11, "left"),
      ),
      repository.update(
        command(expected, flags(true, false), "enable_public_read", 12, "right"),
      ),
    ]);
    expect([left.kind, right.kind].sort()).toEqual(["stale", "updated"]);
    expect(await repository.readRecentChanges(20)).toHaveLength(1);
    expect(await repository.readState()).toMatchObject({
      publicReadEnabled: true,
      navigationVisible: false,
    });
  });

  it("rolls back the flag update when the conditional audit insert fails", async () => {
    await db.prepare(`CREATE TRIGGER fail_release_audit
      BEFORE INSERT ON admin_audit_logs
      WHEN NEW.event_type = 'otw_play.release.updated'
      BEGIN SELECT RAISE(ABORT, 'audit failed'); END`).run();
    await expect(
      repository.update(
        command(
          { ...flags(false, false), updatedAt: 10 },
          flags(true, false),
          "enable_public_read",
          11,
        ),
      ),
    ).rejects.toThrow("Release update failed");
    expect(await repository.readState()).toMatchObject({
      publicReadEnabled: false,
      navigationVisible: false,
      updatedAt: 10,
    });
  });
});
