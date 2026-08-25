import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { D1ChannelMonitorRepository } from "./d1-channel-monitor-repository";

type TestEnv = Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 24, 5);
const approval = {
  scope: "candidate_collection" as const,
  operatorReference: "operator-proof",
  approvalReference: "rights-ticket",
  revocationProcedure: "pause and unsubscribe",
  confirmed: true as const,
};

const observation = (videoId: string, title = `Video ${videoId}`) => ({
  videoId,
  availabilityStatus: "playable" as const,
  video: {
    videoId,
    channelId: "UCmmmmmmmmmmmmmmmmmmmmmm",
    channelTitle: "Approved Clips",
    title,
    thumbnailUrl: "https://i.ytimg.com/test.jpg",
    durationSeconds: 180,
    publishedAt: NOW + 500,
    availabilityStatus: "playable" as const,
  },
});

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_catalog_events WHERE aggregate_type = 'channel_monitor'"),
    db.prepare("DELETE FROM music_catalog_events WHERE aggregate_type = 'channel_automation_approval'"),
    db.prepare("DELETE FROM music_channel_websub_deliveries"),
    db.prepare("DELETE FROM music_channel_websub_subscriptions"),
    db.prepare("DELETE FROM music_channel_upload_candidate_origins"),
    db.prepare("DELETE FROM music_channel_upload_monitors"),
    db.prepare("DELETE FROM music_channel_automation_approvals"),
    db.prepare("DELETE FROM music_ingestion_candidates WHERE candidate_kind = 'singing_clip'"),
    db.prepare(
      `DELETE FROM music_channels WHERE id IN (
        'monitor-channel', 'monitor-channel-next', 'monitor-channel-official'
      )`,
    ),
  ]);
  await db.prepare(
    `INSERT INTO music_channels (
      id, provider, external_channel_id, display_name, channel_role,
      verification_status, active, version, created_at, updated_at
    ) VALUES (
      'monitor-channel', 'youtube', 'UCmmmmmmmmmmmmmmmmmmmmmm', 'Approved Clips',
      'approved_kirinuki', 'approved', 1, 0, ?, ?
    ), (
      'monitor-channel-next', 'youtube', 'UCnnnnnnnnnnnnnnnnnnnnnn', 'Second Approved Clips',
      'approved_kirinuki', 'approved', 1, 0, ?, ?
    ), (
      'monitor-channel-official', 'youtube', 'UCoooooooooooooooooooooo', 'Official Channel',
      'otw_official', 'approved', 1, 0, ?, ?
    )`,
  ).bind(NOW, NOW, NOW, NOW, NOW, NOW).run();
  await db.prepare(
    `INSERT INTO music_channel_automation_approvals (
      channel_id, scope, status, operator_reference, approval_reference,
      revocation_procedure, approved_by_user_id, approved_at,
      version, created_at, updated_at
    ) VALUES
      ('monitor-channel', 'candidate_collection', 'approved', ?, ?, ?, 'admin-0', ?, 0, ?, ?),
      ('monitor-channel-next', 'candidate_collection', 'approved', ?, ?, ?, 'admin-0', ?, 0, ?, ?)`,
  ).bind(
    approval.operatorReference,
    approval.approvalReference,
    approval.revocationProcedure,
    NOW,
    NOW,
    NOW,
    approval.operatorReference,
    approval.approvalReference,
    approval.revocationProcedure,
    NOW,
    NOW,
    NOW,
  ).run();
});

describe("D1ChannelMonitorRepository", () => {
  it("keeps target generations isolated and preserves monitor audit history on deletion", async () => {
    const repository = new D1ChannelMonitorRepository(db);
    const channel = await repository.findEligibleChannel("UCmmmmmmmmmmmmmmmmmmmmmm");
    expect(channel).toMatchObject({ externalChannelId: "UCmmmmmmmmmmmmmmmmmmmmmm" });
    await expect(
      repository.findEligibleChannel("UCoooooooooooooooooooooo"),
    ).resolves.toBeNull();

    const created = await repository.create({
      id: "monitor-1",
      eventId: "event-monitor-created",
      approvalEventId: "event-monitor-approval",
      channel: channel!,
      uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
      lastSeenVideoId: "AAAAAAAAAAA",
      approval,
      actorUserId: "admin-1",
      now: NOW,
    });
    expect(created).toMatchObject({
      status: "active",
      lastSeenVideoId: "AAAAAAAAAAA",
      candidateCount: 0,
      generation: 0,
      nextCheckAt: NOW + 360 * 60_000,
    });
    const claimed = await repository.claim(created.id, NOW + 1);
    expect(claimed).toMatchObject({ id: created.id, generation: 0, version: 1 });

    await expect(repository.recordCandidates({
      monitorId: created.id,
      expectedVersion: claimed!.version,
      monitorGeneration: claimed!.generation,
      now: NOW + 1_000,
      observations: [observation("BBBBBBBBBBB", "New Singing Clip")],
    })).resolves.toBe(1);
    await expect(repository.listCandidates(created.id, 50, null)).resolves.toEqual({
      hasMore: false,
      items: [expect.objectContaining({
        videoId: "BBBBBBBBBBB",
        title: "New Singing Clip",
        status: "needs_input",
        classification: "scope_review",
      })],
    });

    const nextChannel = await repository.findEligibleChannel(
      "UCnnnnnnnnnnnnnnnnnnnnnn",
    );
    const updated = await repository.updateTarget({
      id: created.id,
      expectedVersion: claimed!.version,
      channel: nextChannel!,
      uploadsPlaylistId: "UUnnnnnnnnnnnnnnnnnnnnnn",
      lastSeenVideoId: "CCCCCCCCCCC",
      actorUserId: "admin-2",
      eventId: "event-monitor-target",
      now: NOW + 2_000,
    });
    expect(updated).toMatchObject({
      externalChannelId: "UCnnnnnnnnnnnnnnnnnnnnnn",
      channelDisplayName: "Second Approved Clips",
      lastSeenVideoId: "CCCCCCCCCCC",
      candidateCount: 0,
      generation: 1,
      version: 2,
    });
    await expect(repository.listCandidates(created.id, 50, null)).resolves.toEqual({
      items: [],
      hasMore: false,
    });

    await expect(repository.recordCandidates({
      monitorId: created.id,
      expectedVersion: claimed!.version,
      monitorGeneration: claimed!.generation,
      now: NOW + 3_000,
      observations: [observation("DDDDDDDDDDD", "Stale Claim Upload")],
    })).rejects.toMatchObject({ code: "stale_message" });
    await expect(repository.complete({
      id: created.id,
      expectedVersion: claimed!.version,
      monitorGeneration: claimed!.generation,
      lastSeenVideoId: "DDDDDDDDDDD",
      lastSeenPublishedAt: NOW + 500,
      now: NOW + 3_000,
    })).rejects.toMatchObject({ code: "stale_message" });
    await expect(repository.get(created.id)).resolves.toMatchObject({
      lastSeenVideoId: "CCCCCCCCCCC",
      generation: 1,
    });

    await expect(repository.remove({
      id: created.id,
      expectedVersion: updated.version,
      actorUserId: "admin-3",
      eventId: "event-monitor-deleted",
      now: NOW + 4_000,
    })).resolves.toEqual({ id: created.id });
    await expect(repository.get(created.id)).rejects.toMatchObject({ code: "not_found" });

    const persisted = await db.prepare(
      `SELECT deleted_at FROM music_channel_upload_monitors WHERE id = ?`,
    ).bind(created.id).first<{ deleted_at: number | null }>();
    const originCount = await db.prepare(
      `SELECT COUNT(*) AS count FROM music_channel_upload_candidate_origins
       WHERE monitor_id = ?`,
    ).bind(created.id).first<{ count: number }>();
    const events = await db.prepare(
      `SELECT event_type, actor_user_id FROM music_catalog_events
       WHERE aggregate_type = 'channel_monitor' AND aggregate_id = ?
       ORDER BY created_at ASC`,
    ).bind(created.id).all<{ event_type: string; actor_user_id: string | null }>();
    expect(persisted?.deleted_at).toBe(NOW + 4_000);
    expect(Number(originCount?.count)).toBe(1);
    expect(events.results).toEqual([
      { event_type: "channel_monitor.created", actor_user_id: "admin-1" },
      { event_type: "channel_monitor.target_changed", actor_user_id: "admin-2" },
      { event_type: "channel_monitor.deleted", actor_user_id: "admin-3" },
    ]);
  });

  it("filters terminal candidates before applying the page limit", async () => {
    const repository = new D1ChannelMonitorRepository(db);
    const channel = await repository.findEligibleChannel("UCmmmmmmmmmmmmmmmmmmmmmm");
    const created = await repository.create({
      id: "monitor-pagination",
      eventId: "event-pagination-created",
      approvalEventId: "event-pagination-approval",
      channel: channel!,
      uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
      lastSeenVideoId: null,
      approval,
      actorUserId: "admin-1",
      now: NOW,
    });
    const claimed = await repository.claim(created.id, NOW + 1);
    await repository.recordCandidates({
      monitorId: created.id,
      expectedVersion: claimed!.version,
      monitorGeneration: claimed!.generation,
      now: NOW + 1_000,
      observations: [
        observation("AAAAAAAAAAA"),
        observation("BBBBBBBBBBB"),
        observation("CCCCCCCCCCC"),
      ],
    });
    await db.prepare(
      `UPDATE music_ingestion_candidates SET status = 'ignored'
       WHERE external_video_id IN ('BBBBBBBBBBB', 'CCCCCCCCCCC')`,
    ).run();

    await expect(repository.listCandidates(created.id, 1, null)).resolves.toEqual({
      items: [expect.objectContaining({ videoId: "AAAAAAAAAAA" })],
      hasMore: false,
    });
  });

  it("requires an explicit watermark reset before a gap-paused monitor can resume", async () => {
    const repository = new D1ChannelMonitorRepository(db);
    const channel = await repository.findEligibleChannel("UCmmmmmmmmmmmmmmmmmmmmmm");
    const created = await repository.create({
      id: "monitor-gap",
      eventId: "event-gap-created",
      approvalEventId: "event-gap-approval",
      channel: channel!,
      uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
      lastSeenVideoId: "AAAAAAAAAAA",
      approval,
      actorUserId: "admin-1",
      now: NOW,
    });
    const claimed = await repository.claim(created.id, NOW + 1);
    const paused = await repository.markGapSuspected({
      id: created.id,
      expectedVersion: claimed!.version,
      monitorGeneration: claimed!.generation,
      now: NOW + 2,
    });

    await expect(repository.updateStatus({
      id: created.id,
      expectedVersion: paused.version,
      status: "active",
      actorUserId: "admin-1",
      eventId: "event-gap-invalid-resume",
      now: NOW + 3,
    })).rejects.toMatchObject({ code: "validation_failed" });
    await expect(repository.resetWatermark({
      id: created.id,
      expectedVersion: paused.version,
      lastSeenVideoId: "BBBBBBBBBBB",
      actorUserId: "admin-1",
      eventId: "event-gap-reset",
      now: NOW + 4,
    })).resolves.toMatchObject({
      status: "active",
      lastSeenVideoId: "BBBBBBBBBBB",
      lastErrorCode: null,
    });
  });
});
