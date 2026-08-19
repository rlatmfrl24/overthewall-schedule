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
  "music_song_tags",
  "music_song_original_artists",
  "music_channels",
  "music_channel_entities",
  "music_media_sources",
  "music_media_source_relations",
  "music_performances",
  "music_performance_participants",
  "music_public_performance_sort_keys",
  "music_performance_sources",
  "music_cover_proposals",
  "music_cover_proposal_participants",
  "music_cover_proposal_original_artists",
  "music_catalog_events",
  "music_search_terms",
  "music_search_grams",
  "music_search_gram_stats",
  "music_catalog_meta",
  "music_public_read_model_meta",
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

const INITIAL_PUBLIC_READ_MODEL_META_ROW = {
  id: 1,
  revision: 0,
  updated_at: 0,
  catalog_revision: 0,
  id_type: "integer",
  revision_type: "integer",
  updated_at_type: "integer",
  catalog_revision_type: "integer",
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
  it("validates the OTW Play submission limit as strict integer text", async () => {
    const { getOtwPlaySubmissionDailyLimitStatus } = await loadDoctorCore();

    expect(
      getOtwPlaySubmissionDailyLimitStatus([
        { value: "5", value_type: "text" },
      ]),
    ).toEqual({ ok: true, message: "daily limit=5" });
    expect(getOtwPlaySubmissionDailyLimitStatus([]).ok).toBe(false);
    expect(
      getOtwPlaySubmissionDailyLimitStatus([
        { value: "0", value_type: "text" },
      ]).ok,
    ).toBe(false);
    expect(
      getOtwPlaySubmissionDailyLimitStatus([
        { value: 5, value_type: "integer" },
      ]).ok,
    ).toBe(false);
  });

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
    expect(REQUIRED_D1_COLUMNS.music_cover_proposal_participants).toContain(
      "submitted_member_uid",
    );
    expect(REQUIRED_D1_COLUMNS.music_cover_proposal_original_artists).toContain(
      "submitted_member_uid",
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
    expect(REQUIRED_D1_COLUMNS.music_public_performance_sort_keys).toEqual([
      "performance_id",
      "song_id",
      "representative_participant_entity_id",
      "normalized_participant",
    ]);
    expect(REQUIRED_D1_COLUMNS.music_search_grams).toEqual([
      "song_id",
      "gram_size",
      "normalized_gram",
    ]);
    expect(REQUIRED_D1_COLUMNS.music_search_gram_stats).toEqual([
      "gram_size",
      "normalized_gram",
      "song_count",
    ]);
    expect(REQUIRED_D1_COLUMNS.music_public_read_model_meta).toEqual([
      "id",
      "revision",
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

  it("requires one strictly typed read-model meta row at the catalog revision", async () => {
    const { getMusicPublicReadModelMetaStatus } = await loadDoctorCore();

    expect(
      getMusicPublicReadModelMetaStatus(INITIAL_PUBLIC_READ_MODEL_META_ROW),
    ).toEqual({
      ok: false,
      message: "could not read public read-model meta",
    });
    expect(
      getMusicPublicReadModelMetaStatus([INITIAL_PUBLIC_READ_MODEL_META_ROW]),
    ).toEqual({
      ok: true,
      message:
        "singleton id=1, revision=0, catalog_revision=0, updated_at=0",
    });
    expect(getMusicPublicReadModelMetaStatus([])).toEqual({
      ok: false,
      message: "expected exactly one public read-model meta row, found 0",
    });
    expect(
      getMusicPublicReadModelMetaStatus([
        {
          ...INITIAL_PUBLIC_READ_MODEL_META_ROW,
          revision: 8,
          catalog_revision: 9,
        },
      ]),
    ).toEqual({
      ok: false,
      message:
        "public read-model revision 8 does not match catalog revision 9",
    });
    expect(
      getMusicPublicReadModelMetaStatus([
        {
          ...INITIAL_PUBLIC_READ_MODEL_META_ROW,
          revision: "0",
          revision_type: "text",
        },
      ]),
    ).toEqual({
      ok: false,
      message: "public read-model meta revision must be an integer",
    });
  });

  it("accepts empty or populated sort-key projections and reports drift", async () => {
    const { getMusicPublicSortKeyStatus } = await loadDoctorCore();
    const emptyStatusRow = {
      performance_count: 0,
      sort_key_count: 0,
      missing_count: 0,
      unexpected_count: 0,
      value_drift_count: 0,
    };

    expect(getMusicPublicSortKeyStatus([emptyStatusRow]).ok).toBe(true);
    expect(
      getMusicPublicSortKeyStatus([
        {
          ...emptyStatusRow,
          performance_count: 8_000,
          sort_key_count: 8_000,
        },
      ]),
    ).toEqual({
      ok: true,
      message:
        "performances=8000, sort_keys=8000, missing=0, unexpected=0, value_drift=0",
    });
    expect(
      getMusicPublicSortKeyStatus([
        {
          ...emptyStatusRow,
          performance_count: 3,
          sort_key_count: 2,
          missing_count: 1,
          value_drift_count: 1,
        },
      ]).ok,
    ).toBe(false);
    expect(
      getMusicPublicSortKeyStatus([
        { ...emptyStatusRow, performance_count: "invalid" },
      ]),
    ).toEqual({
      ok: false,
      message:
        "public sort-key performance_count must be a non-negative integer",
    });
  });

  it("accepts empty or populated gram stats and reports posting drift", async () => {
    const { getMusicSearchGramStatsStatus } = await loadDoctorCore();
    const emptyStatusRow = {
      expected_posting_count: 0,
      posting_count: 0,
      distinct_gram_count: 0,
      stat_count: 0,
      missing_posting_count: 0,
      unexpected_posting_count: 0,
      missing_stat_count: 0,
      unexpected_stat_count: 0,
      value_drift_count: 0,
    };

    expect(getMusicSearchGramStatsStatus([emptyStatusRow]).ok).toBe(true);
    expect(
      getMusicSearchGramStatsStatus([
        {
          ...emptyStatusRow,
          expected_posting_count: 27_000,
          posting_count: 27_000,
          distinct_gram_count: 9_500,
          stat_count: 9_500,
        },
      ]),
    ).toEqual({
      ok: true,
      message:
        "expected_postings=27000, postings=27000, distinct_grams=9500, stats=9500, missing_postings=0, unexpected_postings=0, missing_stats=0, unexpected_stats=0, value_drift=0",
    });
    expect(
      getMusicSearchGramStatsStatus([
        {
          ...emptyStatusRow,
          expected_posting_count: 4,
          posting_count: 3,
          distinct_gram_count: 2,
          stat_count: 2,
          missing_posting_count: 1,
          unexpected_stat_count: 1,
          value_drift_count: 1,
        },
      ]).ok,
    ).toBe(false);
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
