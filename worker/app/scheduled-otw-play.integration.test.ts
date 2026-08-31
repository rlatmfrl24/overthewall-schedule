import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../platform/types";
import { checkScheduledOtwPlaySources } from "./scheduled";

type ScheduledTestEnv = Env & {
  OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS: D1Migration[];
  SCHEDULED_OPERATIONS_MIGRATIONS: D1Migration[];
};

const testEnv = env as unknown as ScheduledTestEnv;
const db = testEnv.otw_db;
const CHANNEL_ID = `UC${"A".repeat(22)}`;

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_PUBLIC_CATALOG_MIGRATIONS);
  await applyD1Migrations(db, testEnv.SCHEDULED_OPERATIONS_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_catalog_events"),
    db.prepare("DELETE FROM music_media_sources"),
    db.prepare("DELETE FROM music_channels"),
    db.prepare("UPDATE music_catalog_meta SET revision = 0, public_read_enabled = 0, navigation_visible = 0, updated_at = 0 WHERE id = 1"),
    db.prepare("UPDATE music_public_read_model_meta SET revision = 0, updated_at = 0 WHERE id = 1"),
    db.prepare(`INSERT INTO music_channels
      (id, provider, external_channel_id, display_name, channel_role,
       verification_status, active, version, created_at, updated_at)
      VALUES ('channel-1', 'youtube', ?, 'Official', 'member_music',
        'approved', 1, 0, 0, 0)`).bind(CHANNEL_ID),
    ...[
      ["source-playable", "PLAYABLE001", "playable"],
      ["source-deleted", "DELETED0001", "playable"],
      ["source-missing", "MISSING0001", "playable"],
      ["source-recovered", "RECOVER0001", "unavailable"],
    ].map(([id, externalId, status]) =>
      db.prepare(`INSERT INTO music_media_sources
        (id, provider, external_id, channel_id, title, availability_status,
         last_checked_at, next_check_at, version, created_at, updated_at)
        VALUES (?, 'youtube', ?, 'channel-1', ?, ?, 0, 0, 0, 0, 0)`)
        .bind(id, externalId, id, status)),
  ]);
});

describe("scheduled OTW Play source-health entry", () => {
  it("checks due fixtures through one YouTube batch while flags remain 0/0", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      expect(url.pathname).toContain("/youtube/v3/videos");
      return Response.json({
        items: [
          {
            id: "PLAYABLE001",
            snippet: { channelId: CHANNEL_ID, title: "Playable" },
            status: {
              uploadStatus: "processed",
              privacyStatus: "public",
              embeddable: true,
            },
          },
          {
            id: "DELETED0001",
            status: { uploadStatus: "deleted", privacyStatus: "private" },
          },
          {
            id: "RECOVER0001",
            snippet: { channelId: CHANNEL_ID, title: "Recovered" },
            status: {
              uploadStatus: "processed",
              privacyStatus: "public",
              embeddable: true,
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetcher);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await checkScheduledOtwPlaySources({
      otw_db: db,
      YOUTUBE_API_KEY: "test-key",
    } as Env);

    expect(result).toEqual({
      claimed: 4,
      checked: 4,
      changed: 4,
      recovered: 1,
      retryScheduled: 0,
      staleSkipped: 0,
      failed: 0,
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const requestUrl = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("id")?.split(",")).toEqual([
      "DELETED0001",
      "MISSING0001",
      "PLAYABLE001",
      "RECOVER0001",
    ]);
    const statuses = await db.prepare(`SELECT id, availability_status
      FROM music_media_sources ORDER BY id`).all<{
        id: string;
        availability_status: string;
      }>();
    expect(statuses.results).toEqual([
      { id: "source-deleted", availability_status: "deleted" },
      { id: "source-missing", availability_status: "unavailable" },
      { id: "source-playable", availability_status: "playable" },
      { id: "source-recovered", availability_status: "playable" },
    ]);
    const eventTypes = await db.prepare(`SELECT aggregate_id, event_type
      FROM music_catalog_events ORDER BY aggregate_id`).all();
    expect(eventTypes.results).toEqual([
      { aggregate_id: "source-deleted", event_type: "source.unavailable" },
      { aggregate_id: "source-missing", event_type: "source.unavailable" },
      { aggregate_id: "source-playable", event_type: "source.checked" },
      { aggregate_id: "source-recovered", event_type: "source.recovered" },
    ]);
    await expect(db.prepare(`SELECT revision, public_read_enabled,
      navigation_visible FROM music_catalog_meta WHERE id = 1`).first())
      .resolves.toEqual({
        revision: 0,
        public_read_enabled: 0,
        navigation_visible: 0,
      });
  });
});
