import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ChannelMonitorRepository } from "./d1-channel-monitor-repository";

type TestEnv = Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 24, 5);

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_channel_upload_candidate_origins"),
    db.prepare("DELETE FROM music_channel_upload_monitors"),
    db.prepare("DELETE FROM music_ingestion_candidates WHERE candidate_kind = 'singing_clip'"),
    db.prepare("DELETE FROM music_channels WHERE id = 'monitor-channel'"),
  ]);
  await db.prepare(
    `INSERT INTO music_channels (
      id, provider, external_channel_id, display_name, channel_role,
      verification_status, active, version, created_at, updated_at
    ) VALUES (
      'monitor-channel', 'youtube', 'UCmmmmmmmmmmmmmmmmmmmmmm', 'Approved Clips',
      'approved_kirinuki', 'approved', 1, 0, ?, ?
    )`,
  ).bind(NOW, NOW).run();
});

describe("D1ChannelMonitorRepository", () => {
  it("persists the channel watermark and adds new uploads to the shared review candidates", async () => {
    const repository = new D1ChannelMonitorRepository(db);
    const channel = await repository.findEligibleChannel("monitor-channel");
    expect(channel).toMatchObject({ externalChannelId: "UCmmmmmmmmmmmmmmmmmmmmmm" });

    const created = await repository.create({
      id: "monitor-1",
      channel: channel!,
      uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
      lastSeenVideoId: "AAAAAAAAAAA",
      actorUserId: "admin-1",
      now: NOW,
    });
    expect(created).toMatchObject({
      status: "active",
      lastSeenVideoId: "AAAAAAAAAAA",
      candidateCount: 0,
      nextCheckAt: NOW + 360 * 60_000,
    });
    await expect(repository.claim(created.id, NOW + 1)).resolves.toMatchObject({
      id: created.id,
      version: 1,
    });

    await expect(repository.recordCandidates({
      monitorId: created.id,
      now: NOW + 1_000,
      observations: [{
        videoId: "BBBBBBBBBBB",
        availabilityStatus: "playable",
        video: {
          videoId: "BBBBBBBBBBB",
          channelId: "UCmmmmmmmmmmmmmmmmmmmmmm",
          channelTitle: "Approved Clips",
          title: "New Singing Clip",
          thumbnailUrl: "https://i.ytimg.com/test.jpg",
          durationSeconds: 180,
          publishedAt: NOW + 500,
          availabilityStatus: "playable",
        },
      }],
    })).resolves.toBe(1);

    await expect(repository.listCandidates(created.id, 50)).resolves.toEqual([
      expect.objectContaining({
        videoId: "BBBBBBBBBBB",
        title: "New Singing Clip",
        status: "needs_input",
        classification: "scope_review",
      }),
    ]);
    const candidate = await db.prepare(
      "SELECT candidate_kind FROM music_ingestion_candidates WHERE external_video_id = ?",
    ).bind("BBBBBBBBBBB").first<{ candidate_kind: string }>();
    expect(candidate?.candidate_kind).toBe("singing_clip");
  });
});
