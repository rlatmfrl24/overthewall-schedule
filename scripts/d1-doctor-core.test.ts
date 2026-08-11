import { describe, expect, it } from "vitest";
import {
  buildD1LocationArgs,
  parsePersistToOption,
} from "./d1-local-options.mjs";

const loadDoctorCore = () => import("./d1-doctor-core.mjs");

const MUSIC_FOUNDATION_TABLES = [
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
];

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
  it("checks every OTW Play catalog foundation table", async () => {
    const { REQUIRED_D1_COLUMNS } = await loadDoctorCore();

    expect(
      Object.keys(REQUIRED_D1_COLUMNS).filter((tableName) =>
        tableName.startsWith("music_"),
      ),
    ).toEqual(MUSIC_FOUNDATION_TABLES);
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
