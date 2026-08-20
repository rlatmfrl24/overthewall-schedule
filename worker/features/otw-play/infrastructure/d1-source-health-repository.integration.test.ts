import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { D1SourceHealthRepository } from "./d1-source-health-repository";

type SourceHealthTestEnv = Env & {
  OTW_PLAY_PRE_SOURCE_HEALTH_MIGRATIONS: D1Migration[];
  OTW_PLAY_SOURCE_HEALTH_MIGRATIONS: D1Migration[];
};

const testEnv = env as SourceHealthTestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 20);
const CHANNEL_EXTERNAL_ID = `UC${"A".repeat(22)}`;
let backfilledNextCheckAt: number | null = null;
let indexNames: string[] = [];
let claimQueryPlan = "";
let eventQueryPlan = "";

const insertChannel = (id = "channel-1") =>
  db.prepare(`INSERT INTO music_channels
    (id, provider, external_channel_id, display_name, channel_role,
     verification_status, active, version, created_at, updated_at)
    VALUES (?, 'youtube', ?, 'Official', 'member_music', 'approved', 1, 0, 0, 0)`)
    .bind(id, CHANNEL_EXTERNAL_ID);

const insertSource = (
  id: string,
  externalId: string,
  status = "playable",
  nextCheckAt: number | null = 0,
) => db.prepare(`INSERT INTO music_media_sources
  (id, provider, external_id, channel_id, title, thumbnail_url, duration_seconds,
   provider_published_at, availability_status, last_checked_at, next_check_at,
   version, created_at, updated_at)
  VALUES (?, 'youtube', ?, 'channel-1', 'Stored title', NULL, 180, 0, ?, 10, ?, 0, 0, 10)`)
  .bind(id, externalId, status, nextCheckAt);

const insertPerformanceLink = (
  sourceId: string,
  publicationStatus: "draft" | "published" = "published",
) => [
  db.prepare(`INSERT INTO music_songs
    (id, slug, title, normalized_title, dedupe_key, is_otw_original,
     original_release_date, original_release_precision, archived_at,
     version, created_at, updated_at)
    VALUES ('song-1', 'song-1', 'Song 1', 'song 1', 'song:1', 1,
      NULL, 'unknown', NULL, 0, 0, 0)`),
  db.prepare(`INSERT INTO music_performances
    (id, song_id, dedupe_key, relation_type, release_type, participation_type,
     publication_status, quality_status, released_at, internal_note,
     version, created_at, updated_at)
    VALUES ('performance-1', 'song-1', 'performance:1', 'original',
      'official_video', 'solo', ?, 'ok', 0, NULL, 0, 0, 0)`).bind(
    publicationStatus,
  ),
  db.prepare(`INSERT INTO music_performance_sources
    (performance_id, source_id, start_seconds, end_seconds,
     source_role, priority, is_primary)
    VALUES ('performance-1', ?, 0, NULL, 'official', 0, 1)`).bind(sourceId),
];

const insertPublishedLink = (sourceId: string) =>
  insertPerformanceLink(sourceId, "published");

const playableObservation = (externalId: string) => ({
  videoId: externalId,
  availabilityStatus: "playable" as const,
  video: {
    videoId: externalId,
    channelId: CHANNEL_EXTERNAL_ID,
    channelTitle: "Official",
    title: "Remote title",
    thumbnailUrl: "https://i.ytimg.com/remote.jpg",
    durationSeconds: 181,
    publishedAt: 1,
    availabilityStatus: "playable" as const,
  },
});

beforeAll(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PRE_SOURCE_HEALTH_MIGRATIONS);
  await db.batch([
    insertChannel("legacy-channel"),
    db.prepare(`INSERT INTO music_media_sources
      (id, provider, external_id, channel_id, title, availability_status,
       last_checked_at, next_check_at, version, created_at, updated_at)
      VALUES ('legacy-source', 'youtube', 'LEGACY00001', 'legacy-channel',
        'Legacy', 'unknown', 123, NULL, 0, 100, 123)`),
  ]);
  await applyD1Migrations(db, testEnv.OTW_PLAY_SOURCE_HEALTH_MIGRATIONS);
  backfilledNextCheckAt = (
    await db.prepare("SELECT next_check_at FROM music_media_sources WHERE id = 'legacy-source'")
      .first<{ next_check_at: number | null }>()
  )?.next_check_at ?? null;
  indexNames = (
    await db.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'index' AND name IN (
        'idx_music_media_sources_next_check_id',
        'idx_music_catalog_events_type_created_id'
      ) ORDER BY name`).all<{ name: string }>()
  ).results.map((row) => row.name);
  claimQueryPlan = (
    await db.prepare(`EXPLAIN QUERY PLAN SELECT id FROM music_media_sources
      WHERE next_check_at <= ? ORDER BY next_check_at, id LIMIT 50`)
      .bind(NOW)
      .all<{ detail: string }>()
  ).results.map((row) => row.detail).join(" ");
  eventQueryPlan = (
    await db.prepare(`EXPLAIN QUERY PLAN SELECT aggregate_id
      FROM music_catalog_events
      WHERE event_type = 'source.recovered' AND created_at >= ?
      ORDER BY created_at DESC, id LIMIT 50`)
      .bind(NOW - 7 * 24 * 60 * 60_000)
      .all<{ detail: string }>()
  ).results.map((row) => row.detail).join(" ");
});

beforeEach(async () => {
  await db.batch([
    db.prepare("DELETE FROM music_catalog_events"),
    db.prepare("DELETE FROM music_performance_sources"),
    db.prepare("DELETE FROM music_performances"),
    db.prepare("DELETE FROM music_songs"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("UPDATE music_catalog_meta SET revision = 0, updated_at = 0 WHERE id = 1"),
    db.prepare("UPDATE music_public_read_model_meta SET revision = 0, updated_at = 0 WHERE id = 1"),
  ]);
});

describe("D1SourceHealthRepository", () => {
  it("backfills existing sources and uses both source-health indexes", () => {
    expect(backfilledNextCheckAt).toBe(123);
    expect(indexNames).toEqual([
      "idx_music_catalog_events_type_created_id",
      "idx_music_media_sources_next_check_id",
    ]);
    expect(claimQueryPlan).toContain("idx_music_media_sources_next_check_id");
    expect(eventQueryPlan).toContain("idx_music_catalog_events_type_created_id");
  });

  it("atomically claims 50 due sources in stable order and leases them", async () => {
    await db.batch([
      insertChannel(),
      ...Array.from({ length: 51 }, (_, index) =>
        insertSource(
          `source-${String(index).padStart(3, "0")}`,
          String(index).padStart(11, "0"),
          "playable",
          index,
        )),
    ]);
    const repository = new D1SourceHealthRepository(db);
    const first = await repository.claimDueSources(NOW, NOW + 30 * 60_000, 51);
    expect(first).toHaveLength(50);
    expect(first.map((item) => item.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `source-${String(index).padStart(3, "0")}`),
    );
    expect(new Set(first.map((item) => item.nextCheckAt))).toEqual(
      new Set([NOW + 30 * 60_000]),
    );
    await expect(repository.claimDueSources(NOW, NOW + 30 * 60_000, 50))
      .resolves.toEqual([expect.objectContaining({ id: "source-050" })]);
  });

  it("updates source, event, and both revisions atomically only for public changes", async () => {
    await db.batch([
      insertChannel(),
      insertSource("source-1", "dQw4w9WgXcQ"),
      ...insertPublishedLink("source-1"),
    ]);
    const repository = new D1SourceHealthRepository(db);
    const target = await repository.readTarget("source-1");
    expect(target).not.toBeNull();
    const applied = await repository.applyObservation({
      target: target!,
      observation: {
        videoId: "dQw4w9WgXcQ",
        availabilityStatus: "unavailable",
        video: null,
      },
      actor: { kind: "system" },
      eventId: "event-unavailable",
      checkedAt: NOW,
      nextCheckAt: NOW + 6 * 60 * 60_000,
    });
    expect(applied).toMatchObject({
      kind: "applied",
      response: {
        catalogRevision: 1,
        data: { availabilityStatus: "unavailable", version: 1 },
        check: { changed: true },
      },
    });
    await expect(db.prepare(`SELECT revision FROM music_catalog_meta WHERE id = 1`)
      .first()).resolves.toMatchObject({ revision: 1 });
    await expect(db.prepare(`SELECT revision FROM music_public_read_model_meta WHERE id = 1`)
      .first()).resolves.toMatchObject({ revision: 1 });
    await expect(db.prepare(`SELECT event_type, actor_kind, detail_json
      FROM music_catalog_events WHERE id = 'event-unavailable'`).first())
      .resolves.toMatchObject({
        event_type: "source.unavailable",
        actor_kind: "system",
      });

    const after = await repository.readTarget("source-1");
    const same = await repository.applyObservation({
      target: after!,
      observation: {
        videoId: "dQw4w9WgXcQ",
        availabilityStatus: "unavailable",
        video: null,
      },
      actor: { kind: "admin" },
      eventId: "event-checked",
      checkedAt: NOW + 1,
      nextCheckAt: NOW + 6 * 60 * 60_000 + 1,
    });
    expect(same).toMatchObject({
      response: { catalogRevision: 1, check: { changed: false } },
    });
    await expect(db.prepare(`SELECT revision FROM music_catalog_meta WHERE id = 1`)
      .first()).resolves.toMatchObject({ revision: 1 });
  });

  it("preserves authority data on retry and rejects stale writes without partial events", async () => {
    await db.batch([insertChannel(), insertSource("source-1", "dQw4w9WgXcQ")]);
    const repository = new D1SourceHealthRepository(db);
    const target = await repository.readTarget("source-1");
    const retry = await repository.scheduleRetry({
      target: target!,
      actor: { kind: "admin" },
      eventId: "event-retry",
      retryCode: "timeout",
      nextCheckAt: NOW + 30 * 60_000,
      now: NOW,
    });
    expect(retry).toMatchObject({
      response: {
        catalogRevision: 0,
        data: { availabilityStatus: "playable", lastCheckedAt: 10, version: 1 },
        check: { status: "retry_scheduled", retryCode: "timeout" },
      },
    });
    const retryEvent = await db.prepare(`SELECT actor_kind, actor_user_id,
      detail_json FROM music_catalog_events WHERE id = 'event-retry'`).first<{
        actor_kind: string;
        actor_user_id: string | null;
        detail_json: string;
      }>();
    expect(retryEvent).toMatchObject({
      actor_kind: "system",
      actor_user_id: null,
    });
    expect(JSON.parse(retryEvent!.detail_json)).toEqual({
      trigger: "manual",
      retryCode: "timeout",
      previousAvailability: "playable",
      currentAvailability: "playable",
      nextCheckAt: NOW + 30 * 60_000,
    });
    expect(retryEvent!.detail_json).not.toContain("admin-1");
    await expect(repository.applyObservation({
      target: target!,
      observation: playableObservation(target!.externalId),
      actor: { kind: "system" },
      eventId: "event-stale",
      checkedAt: NOW + 1,
      nextCheckAt: NOW + 24 * 60 * 60_000,
    })).resolves.toEqual({ kind: "stale" });
    await expect(db.prepare(`SELECT COUNT(*) AS count FROM music_catalog_events
      WHERE id = 'event-stale'`).first()).resolves.toMatchObject({ count: 0 });
  });

  it("rolls back when a draft source becomes public immediately before the health batch", async () => {
    await db.batch([
      insertChannel(),
      insertSource("source-1", "dQw4w9WgXcQ"),
      ...insertPerformanceLink("source-1", "draft"),
    ]);
    let published = false;
    const racingDb = new Proxy(db, {
      get(target, property) {
        if (property === "batch") {
          return async (statements: D1PreparedStatement[]) => {
            if (!published) {
              published = true;
              await db.batch([
                db.prepare(`UPDATE music_performances
                  SET publication_status = 'published', version = version + 1
                  WHERE id = 'performance-1' AND publication_status = 'draft'`),
                db.prepare(`UPDATE music_catalog_meta
                  SET revision = revision + 1, updated_at = ? WHERE id = 1`)
                  .bind(NOW - 1),
                db.prepare(`UPDATE music_public_read_model_meta
                  SET revision = revision + 1, updated_at = ? WHERE id = 1`)
                  .bind(NOW - 1),
              ]);
            }
            return db.batch(statements);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database;
    const repository = new D1SourceHealthRepository(racingDb);
    const target = await repository.readTarget("source-1");

    await expect(repository.applyObservation({
      target: target!,
      observation: {
        videoId: "dQw4w9WgXcQ",
        availabilityStatus: "deleted",
        video: null,
      },
      actor: { kind: "system" },
      eventId: "event-racing-publish",
      checkedAt: NOW,
      nextCheckAt: NOW + 7 * 24 * 60 * 60_000,
    })).resolves.toEqual({ kind: "stale" });
    await expect(db.prepare(`SELECT availability_status, version
      FROM music_media_sources WHERE id = 'source-1'`).first()).resolves.toEqual({
      availability_status: "playable",
      version: 0,
    });
    await expect(db.prepare(`SELECT revision FROM music_catalog_meta WHERE id = 1`)
      .first()).resolves.toEqual({ revision: 1 });
    await expect(db.prepare(`SELECT revision FROM music_public_read_model_meta WHERE id = 1`)
      .first()).resolves.toEqual({ revision: 1 });
    await expect(db.prepare(`SELECT COUNT(*) AS count FROM music_catalog_events
      WHERE id = 'event-racing-publish'`).first()).resolves.toEqual({ count: 0 });
  });

  it("rolls back a source mutation when its capability event cannot be written", async () => {
    await db.batch([
      insertChannel(),
      insertSource("source-1", "dQw4w9WgXcQ"),
      db.prepare(`INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, created_at)
        VALUES ('duplicate-event', 'source', 'source-1', 'source.checked', 'system', 0)`),
    ]);
    const repository = new D1SourceHealthRepository(db);
    const target = await repository.readTarget("source-1");
    await expect(repository.applyObservation({
      target: target!,
      observation: playableObservation(target!.externalId),
      actor: { kind: "system" },
      eventId: "duplicate-event",
      checkedAt: NOW,
      nextCheckAt: NOW + 24 * 60 * 60_000,
    })).rejects.toThrow();
    await expect(repository.readTarget("source-1")).resolves.toMatchObject({
      title: "Stored title",
      availabilityStatus: "playable",
      lastCheckedAt: 10,
      version: 0,
    });
  });

  it("deduplicates recent recoveries and caps linked summaries at five", async () => {
    await db.batch([
      insertChannel(),
      insertSource("source-1", "dQw4w9WgXcQ", "playable", 0),
      ...Array.from({ length: 6 }, (_, index) => [
        db.prepare(`INSERT INTO music_songs
          (id, slug, title, normalized_title, dedupe_key, is_otw_original,
           original_release_date, original_release_precision, archived_at,
           version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, NULL, 'unknown', NULL, 0, 0, 0)`)
          .bind(
            `song-${index}`,
            `song-${index}`,
            `Song ${index}`,
            `song ${index}`,
            `song:${index}`,
          ),
        db.prepare(`INSERT INTO music_performances
          (id, song_id, dedupe_key, relation_type, release_type,
           participation_type, publication_status, quality_status,
           released_at, internal_note, version, created_at, updated_at)
          VALUES (?, ?, ?, 'original', 'official_video', 'solo', 'published',
            'ok', 0, NULL, 0, 0, 0)`)
          .bind(`performance-${index}`, `song-${index}`, `performance:${index}`),
        db.prepare(`INSERT INTO music_performance_sources
          (performance_id, source_id, start_seconds, end_seconds,
           source_role, priority, is_primary)
          VALUES (?, 'source-1', ?, NULL, 'official', 0, 1)`)
          .bind(`performance-${index}`, index),
      ]).flat(),
      db.prepare(`INSERT INTO music_catalog_events
        (id, aggregate_type, aggregate_id, event_type, actor_kind, detail_json, created_at)
        VALUES
        ('recovered-1', 'source', 'source-1', 'source.recovered', 'system', '{}', ?),
        ('recovered-2', 'source', 'source-1', 'source.recovered', 'system', '{}', ?)`)
        .bind(NOW - 2, NOW - 1),
    ]);
    const dashboard = await new D1SourceHealthRepository(db).readDashboard(
      NOW,
      NOW - 7 * 24 * 60 * 60_000,
      50,
      5,
    );
    expect(dashboard.counts).toEqual({
      due: 1,
      unplayable: 0,
      recentlyRecovered: 1,
    });
    expect(dashboard.recentlyRecovered).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({ id: "source-1" }),
        linkedPerformanceCount: 6,
        links: expect.arrayContaining([
          expect.objectContaining({ songTitle: "Song 0" }),
        ]),
        recoveredAt: NOW - 1,
      }),
    ]);
    expect(dashboard.recentlyRecovered[0]?.links).toHaveLength(5);
  });
});
