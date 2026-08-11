import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCAL_SEED_PROTECTED_TABLES,
  buildDestructiveRowCountSql,
  hasProtectedLocalSeedData,
} from "./d1-seed-guard.mjs";

const MUSIC_DELETE_ORDER = [
  "music_search_gram_stats",
  "music_search_grams",
  "music_public_performance_sort_keys",
  "music_cover_proposal_participants",
  "music_cover_proposal_original_artists",
  "music_search_terms",
  "music_catalog_events",
  "music_cover_proposals",
  "music_performance_sources",
  "music_performance_participants",
  "music_media_source_relations",
  "music_channel_entities",
  "music_song_original_artists",
  "music_song_aliases",
  "music_entity_aliases",
  "music_performances",
  "music_media_sources",
  "music_songs",
  "music_channels",
  "music_entities",
];

describe("hasProtectedLocalSeedData", () => {
  it("완전히 빈 DB에서만 비강제 seed를 허용한다", () => {
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: 0 }),
    ).toBe(false);
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: 18 }),
    ).toBe(true);
  });

  it("보호 상태를 읽지 못하면 삭제 가능성을 열지 않는다", () => {
    expect(hasProtectedLocalSeedData({})).toBe(true);
    expect(
      hasProtectedLocalSeedData({ destructive_row_count: "invalid" }),
    ).toBe(true);
  });
});

describe("OTW Play local seed protection", () => {
  it("counts every deletable catalog table as protected data", () => {
    const musicTables = LOCAL_SEED_PROTECTED_TABLES.filter((tableName) =>
      tableName.startsWith("music_"),
    );
    const countSql = buildDestructiveRowCountSql();

    expect(musicTables).toEqual(MUSIC_DELETE_ORDER);
    for (const tableName of MUSIC_DELETE_ORDER) {
      expect(countSql).toContain(`(SELECT COUNT(*) FROM ${tableName})`);
    }
    expect(countSql).not.toContain("music_catalog_meta");
    expect(countSql).not.toContain("music_public_read_model_meta");
  });

  it("deletes music fixtures child-to-parent while preserving migration-owned meta", () => {
    const fixtureSql = readFileSync(
      new URL("./fixtures/local-d1-seed.sql", import.meta.url),
      "utf8",
    );
    const musicDeletes = Array.from(
      fixtureSql.matchAll(/^DELETE FROM (music_[a-z_]+);$/gim),
      (match) => match[1],
    );

    expect(musicDeletes).toEqual(MUSIC_DELETE_ORDER);
    expect(fixtureSql).not.toMatch(/INSERT\s+INTO\s+music_/i);
    expect(fixtureSql).not.toMatch(
      /(?:DELETE\s+FROM|INSERT\s+INTO)\s+music_catalog_meta/i,
    );
    expect(fixtureSql).not.toMatch(
      /(?:DELETE\s+FROM|INSERT\s+INTO)\s+music_public_read_model_meta/i,
    );
    expect(fixtureSql).toMatch(
      /UPDATE music_public_read_model_meta\s+SET revision = \(\s+SELECT revision\s+FROM music_catalog_meta\s+WHERE id = 1\s+\),\s+updated_at = \(\s+SELECT updated_at\s+FROM music_catalog_meta\s+WHERE id = 1\s+\)\s+WHERE id = 1;/i,
    );
    expect(fixtureSql).toMatch(
      /UPDATE music_songs\s+SET merged_into_song_id = NULL\s+WHERE merged_into_song_id IS NOT NULL;\s+DELETE FROM music_songs;/i,
    );
  });
});
