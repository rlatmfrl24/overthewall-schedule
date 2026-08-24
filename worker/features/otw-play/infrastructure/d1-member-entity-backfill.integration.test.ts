import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { describe, expect, it } from "vitest";

type TestEnv = Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const db = testEnv.otw_db;

describe("OTW Play member entity backfill migration", () => {
  it("adds every active member missing from the ownership entity authority", async () => {
    const migrations = testEnv.OTW_PLAY_INGESTION_MIGRATIONS;
    const backfill = migrations.at(-1);
    expect(backfill?.name).toBe("0061_otw-play-member-entity-backfill.sql");
    await applyD1Migrations(db, migrations.slice(0, -1));
    await db.batch([
      db.prepare(
        `INSERT INTO members (uid, code, name, is_deprecated) VALUES
          (9401, 'existing_member', '기존 멤버', 0),
          (9402, 'missing_member', '누락 멤버', 0),
          (9403, 'retired_member', '졸업 멤버', 1)`,
      ),
      db.prepare(
        `INSERT INTO music_entities (
          id, member_uid, entity_kind, display_name, normalized_name, slug,
          archived_at, version, created_at, updated_at
        ) VALUES (
          'existing-entity', 9401, 'person', '기존 멤버', '기존 멤버',
          'existing_member', NULL, 0, 1, 1
        )`,
      ),
    ]);
    const before = await db
      .prepare("SELECT revision FROM music_catalog_meta WHERE id = 1")
      .first<{ revision: number }>();

    await applyD1Migrations(db, [backfill!]);

    const rows = await db.prepare(
      `SELECT member_uid, id, display_name, slug
       FROM music_entities WHERE member_uid IN (9401, 9402, 9403)
       ORDER BY member_uid`,
    ).all<{ member_uid: number; id: string; display_name: string; slug: string }>();
    expect(rows.results).toEqual([
      {
        member_uid: 9401,
        id: "existing-entity",
        display_name: "기존 멤버",
        slug: "existing_member",
      },
      {
        member_uid: 9402,
        id: "member:missing_member",
        display_name: "누락 멤버",
        slug: "missing_member",
      },
    ]);
    const after = await db
      .prepare(
        `SELECT catalog.revision,
                read_model.revision AS read_model_revision,
                catalog.updated_at,
                read_model.updated_at AS read_model_updated_at
         FROM music_catalog_meta AS catalog
         JOIN music_public_read_model_meta AS read_model ON read_model.id = catalog.id
         WHERE catalog.id = 1`,
      )
      .first<{
        revision: number;
        read_model_revision: number;
        updated_at: number;
        read_model_updated_at: number;
      }>();
    expect(Number(after?.revision)).toBe(Number(before?.revision) + 1);
    expect(Number(after?.read_model_revision)).toBe(Number(after?.revision));
    expect(Number(after?.read_model_updated_at)).toBe(Number(after?.updated_at));
  });
});
