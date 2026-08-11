import { describe, expect, it } from "vitest";
import {
  buildD1LocationArgs,
  parsePersistToOption,
} from "./d1-local-options.mjs";

const loadDoctorCore = () => import("./d1-doctor-core.mjs");

const MUSIC_TABLES = [
  "music_entities",
  "music_entity_aliases",
  "music_songs",
  "music_song_aliases",
  "music_song_original_artists",
  "music_channels",
  "music_channel_entities",
  "music_media_sources",
  "music_media_source_relations",
  "music_performances",
  "music_performance_participants",
  "music_performance_sources",
  "music_cover_proposals",
  "music_cover_proposal_participants",
  "music_cover_proposal_original_artists",
  "music_catalog_events",
  "music_search_terms",
  "music_catalog_meta",
];

const INITIAL_CATALOG_META_ROW = {
  id: 1,
  revision: 0,
  public_read_enabled: 0,
  navigation_visible: 0,
  updated_at: 0,
  id_type: "integer",
  revision_type: "integer",
  public_read_enabled_type: "integer",
  navigation_visible_type: "integer",
  updated_at_type: "integer",
};

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

describe("d1 doctor schema coverage", () => {
  it("checks every OTW Play catalog table", async () => {
    const { REQUIRED_D1_COLUMNS } = await loadDoctorCore();

    expect(
      Object.keys(REQUIRED_D1_COLUMNS).filter((tableName) =>
        tableName.startsWith("music_"),
      ),
    ).toEqual(MUSIC_TABLES);
    expect(REQUIRED_D1_COLUMNS.music_performances).toEqual(
      expect.arrayContaining([
        "publication_status",
        "quality_status",
        "relation_type",
        "release_type",
        "participation_type",
      ]),
    );
    expect(REQUIRED_D1_COLUMNS.music_media_sources).toContain(
      "availability_status",
    );
    expect(REQUIRED_D1_COLUMNS.music_cover_proposals).toEqual(
      expect.arrayContaining([
        "submitted_by_user_id",
        "idempotency_key",
        "youtube_video_id",
        "segment_start_seconds",
        "status",
        "version",
        "approved_performance_id",
      ]),
    );
    expect(REQUIRED_D1_COLUMNS.music_catalog_events).toEqual(
      expect.arrayContaining([
        "aggregate_type",
        "aggregate_id",
        "event_type",
        "actor_kind",
        "actor_user_id",
        "before_json",
        "after_json",
      ]),
    );
    expect(REQUIRED_D1_COLUMNS.music_search_terms).toEqual([
      "song_id",
      "term_kind",
      "display_value",
      "normalized_term",
    ]);
    expect(REQUIRED_D1_COLUMNS.music_catalog_meta).toEqual([
      "id",
      "revision",
      "public_read_enabled",
      "navigation_visible",
      "updated_at",
    ]);
  });

  it("validates the migration-owned catalog meta singleton readback", async () => {
    const { getMusicCatalogMetaStatus } = await loadDoctorCore();

    expect(getMusicCatalogMetaStatus([INITIAL_CATALOG_META_ROW])).toEqual({
      ok: true,
      message:
        "singleton id=1, revision=0, public_read_enabled=0, navigation_visible=0, updated_at=0",
    });
    expect(getMusicCatalogMetaStatus([])).toEqual({
      ok: false,
      message: "expected exactly one catalog meta row, found 0",
    });
    expect(
      getMusicCatalogMetaStatus([
        INITIAL_CATALOG_META_ROW,
        { ...INITIAL_CATALOG_META_ROW, id: 2 },
      ]),
    ).toEqual({
      ok: false,
      message: "expected exactly one catalog meta row, found 2",
    });
  });

  it("accepts valid operational meta changes and rejects invalid formats", async () => {
    const { getMusicCatalogMetaStatus } = await loadDoctorCore();

    expect(
      getMusicCatalogMetaStatus([
        {
          ...INITIAL_CATALOG_META_ROW,
          revision: 7,
          public_read_enabled: 1,
          navigation_visible: 1,
          updated_at: 1_786_000_000_000,
        },
      ]).ok,
    ).toBe(true);
    expect(
      getMusicCatalogMetaStatus([
        {
          ...INITIAL_CATALOG_META_ROW,
          revision: 0.5,
          revision_type: "real",
        },
      ]),
    ).toEqual({
      ok: false,
      message: "catalog meta revision must be an integer",
    });
    expect(
      getMusicCatalogMetaStatus([
        { ...INITIAL_CATALOG_META_ROW, public_read_enabled: 2 },
      ]),
    ).toEqual({
      ok: false,
      message: "catalog meta flags must be 0 or 1",
    });
    expect(
      getMusicCatalogMetaStatus([
        { ...INITIAL_CATALOG_META_ROW, navigation_visible: 1 },
      ]),
    ).toEqual({
      ok: false,
      message: "catalog navigation requires public read to be enabled",
    });
  });

  it("uses the requested persistence directory only for local checks", () => {
    const persistTo = parsePersistToOption([
      "--skip-api",
      "--persist-to=C:\\temp\\otw d1",
    ]);

    expect(buildD1LocationArgs("local", persistTo)).toEqual([
      "--local",
      "--persist-to",
      "C:\\temp\\otw d1",
    ]);
    expect(buildD1LocationArgs("remote", persistTo)).toEqual(["--remote"]);
  });

  it("rejects missing or duplicate persistence paths", () => {
    expect(() => parsePersistToOption(["--persist-to="])).toThrow(
      "non-empty directory",
    );
    expect(() =>
      parsePersistToOption([
        "--persist-to=first",
        "--persist-to=second",
      ]),
    ).toThrow("only be specified once");
  });
});
