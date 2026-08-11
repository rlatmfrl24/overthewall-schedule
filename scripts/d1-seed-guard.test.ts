import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  LOCAL_SEED_PROTECTED_TABLES,
  buildDestructiveRowCountSql,
  hasProtectedLocalSeedData,
} from "./d1-seed-guard.mjs";

const MUSIC_DELETE_ORDER = [
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
  it("counts every catalog foundation table as protected data", () => {
    const musicTables = LOCAL_SEED_PROTECTED_TABLES.filter((tableName) =>
      tableName.startsWith("music_"),
    );
    const countSql = buildDestructiveRowCountSql();

    expect(musicTables).toEqual(MUSIC_DELETE_ORDER);
    for (const tableName of MUSIC_DELETE_ORDER) {
      expect(countSql).toContain(`(SELECT COUNT(*) FROM ${tableName})`);
    }
  });

  it("deletes music fixtures child-to-parent without inserting music rows", () => {
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
    expect(fixtureSql).toMatch(
      /UPDATE music_songs\s+SET merged_into_song_id = NULL\s+WHERE merged_into_song_id IS NOT NULL;\s+DELETE FROM music_songs;/i,
    );
  });
});
