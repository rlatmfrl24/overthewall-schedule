import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { WebsubSubscriptionAuthority } from "../application/ports/websub-repository";
import { D1ChannelMonitorRepository } from "./d1-channel-monitor-repository";
import { D1WebsubRepository } from "./d1-websub-repository";

type TestEnv = Env & { OTW_PLAY_INGESTION_MIGRATIONS: D1Migration[] };
const testEnv = env as TestEnv;
const db = testEnv.otw_db;
const NOW = Date.UTC(2026, 7, 25, 6);
const CHANNEL_ID = "UCmmmmmmmmmmmmmmmmmmmmmm";
const approval = {
  scope: "candidate_collection" as const,
  operatorReference: "operator-proof",
  approvalReference: "rights-ticket",
  revocationProcedure: "pause and unsubscribe",
  confirmed: true as const,
};

beforeEach(async () => {
  await applyD1Migrations(db, testEnv.OTW_PLAY_INGESTION_MIGRATIONS);
  await db.batch([
    db.prepare("DELETE FROM music_channel_websub_deliveries"),
    db.prepare("DELETE FROM music_channel_websub_subscriptions"),
    db.prepare("DELETE FROM music_channel_upload_candidate_origins"),
    db.prepare("DELETE FROM music_channel_upload_monitors"),
    db.prepare("DELETE FROM music_channel_automation_approvals"),
    db.prepare("DELETE FROM music_ingestion_candidates WHERE candidate_kind = 'singing_clip'"),
    db.prepare("DELETE FROM music_catalog_events WHERE aggregate_type IN ('channel_monitor', 'channel_automation_approval', 'websub_subscription')"),
    db.prepare("DELETE FROM music_channels WHERE id = 'websub-channel'"),
  ]);
  await db.prepare(
    `INSERT INTO music_channels (
      id, provider, external_channel_id, display_name, channel_role,
      verification_status, active, version, created_at, updated_at
    ) VALUES ('websub-channel', 'youtube', ?, 'Approved Clips',
      'approved_kirinuki', 'approved', 1, 0, ?, ?)`,
  ).bind(CHANNEL_ID, NOW, NOW).run();
  const monitorRepository = new D1ChannelMonitorRepository(db);
  const channel = await monitorRepository.findApprovableChannel(CHANNEL_ID);
  await monitorRepository.create({
    id: "monitor-1",
    eventId: "event-monitor",
    approvalEventId: "event-approval",
    channel: channel!,
    uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
    lastSeenVideoId: "AAAAAAAAAAA",
    approval,
    actorUserId: "admin-1",
    now: NOW,
  });
});

const prepareActiveSubscription = async () => {
  const repository = new D1WebsubRepository(db);
  await repository.prepareSubscription({
    id: "subscription-1",
    monitorId: "monitor-1",
    monitorGeneration: 0,
    topicUrl: `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    callbackTokenHash: "a".repeat(64),
    secretVersion: 1,
    status: "pending",
    pendingMode: "subscribe",
    actorUserId: "admin-1",
    eventId: "event-subscribe",
    now: NOW,
  });
  await repository.markSubscriptionVerified({
    id: "subscription-1",
    mode: "subscribe",
    leaseExpiresAt: NOW + 86_400_000,
    now: NOW + 1,
  });
  return {
    repository,
    subscription: await repository.findSubscriptionByTokenHash("a".repeat(64)) as WebsubSubscriptionAuthority,
  };
};

describe("D1WebsubRepository", () => {
  it("deduplicates deliveries and title updates without duplicating candidates or origins", async () => {
    const { repository, subscription } = await prepareActiveSubscription();
    const first = await repository.recordDelivery({
      id: "delivery-1",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "BBBBBBBBBBB",
      providerUpdatedAt: NOW + 10,
      now: NOW + 10,
    });
    await expect(repository.recordDelivery({
      id: "delivery-duplicate",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "BBBBBBBBBBB",
      providerUpdatedAt: NOW + 10,
      now: NOW + 11,
    })).resolves.toEqual({ id: "delivery-1", shouldEnqueue: true });
    await repository.markDeliveryEnqueued(first.id, NOW + 12);
    const work = await repository.claimDelivery(first.id, NOW + 13);
    await repository.recordDeliveryObservation({
      delivery: work!,
      observation: {
        videoId: "BBBBBBBBBBB",
        availabilityStatus: "playable",
        video: {
          videoId: "BBBBBBBBBBB",
          channelId: CHANNEL_ID,
          channelTitle: "Approved Clips",
          title: "Initial title",
          thumbnailUrl: null,
          durationSeconds: 120,
          publishedAt: NOW + 5,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      },
      now: NOW + 14,
    });

    const titleUpdate = await repository.recordDelivery({
      id: "delivery-2",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "BBBBBBBBBBB",
      providerUpdatedAt: NOW + 20,
      now: NOW + 20,
    });
    await repository.markDeliveryEnqueued(titleUpdate.id, NOW + 21);
    const updateWork = await repository.claimDelivery(titleUpdate.id, NOW + 22);
    await repository.recordDeliveryObservation({
      delivery: updateWork!,
      observation: {
        videoId: "BBBBBBBBBBB",
        availabilityStatus: "playable",
        video: {
          videoId: "BBBBBBBBBBB",
          channelId: CHANNEL_ID,
          channelTitle: "Approved Clips",
          title: "Updated title",
          thumbnailUrl: null,
          durationSeconds: 120,
          publishedAt: NOW + 5,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      },
      now: NOW + 23,
    });

    const policyUpdate = await repository.recordDelivery({
      id: "delivery-3",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "BBBBBBBBBBB",
      providerUpdatedAt: NOW + 30,
      now: NOW + 30,
    });
    await repository.markDeliveryEnqueued(policyUpdate.id, NOW + 31);
    const policyWork = await repository.claimDelivery(policyUpdate.id, NOW + 32);
    await repository.recordDeliveryObservation({
      delivery: policyWork!,
      observation: {
        videoId: "BBBBBBBBBBB",
        availabilityStatus: "playable",
        video: {
          videoId: "BBBBBBBBBBB",
          channelId: CHANNEL_ID,
          channelTitle: "Approved Clips",
          title: "Policy update",
          thumbnailUrl: null,
          durationSeconds: 120,
          publishedAt: NOW + 5,
          availabilityStatus: "playable",
          madeForKids: true,
        },
      },
      now: NOW + 33,
    });

    const candidate = await db.prepare(
      `SELECT title, status, classification, exclusion_reason FROM music_ingestion_candidates
       WHERE provider = 'youtube' AND external_video_id = 'BBBBBBBBBBB'`,
    ).first<{ title: string; status: string; classification: string; exclusion_reason: string }>();
    const counts = await db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM music_ingestion_candidates
          WHERE provider = 'youtube' AND external_video_id = 'BBBBBBBBBBB') AS candidates,
        (SELECT COUNT(*) FROM music_channel_upload_candidate_origins
          WHERE monitor_id = 'monitor-1') AS origins,
        (SELECT COUNT(*) FROM music_channel_websub_deliveries
          WHERE external_video_id = 'BBBBBBBBBBB') AS deliveries`,
    ).first<{ candidates: number; origins: number; deliveries: number }>();
    expect(candidate).toEqual({
      title: "Policy update",
      status: "blocked",
      classification: "policy_blocked",
      exclusion_reason: "made_for_kids",
    });
    expect(counts).toEqual({ candidates: 1, origins: 1, deliveries: 3 });
  });

  it("claims pending deliveries and recovers abandoned processing work", async () => {
    const { repository, subscription } = await prepareActiveSubscription();
    const item = await repository.recordDelivery({
      id: "delivery-race",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "PPPPPPPPPPP",
      providerUpdatedAt: NOW + 10,
      now: NOW + 10,
    });

    await expect(repository.claimDelivery(item.id, NOW + 11)).resolves.toMatchObject({
      id: item.id,
      status: "processing",
    });
    await expect(repository.listRecoverableDeliveryIds(NOW + 4 * 60_000, 10))
      .resolves.not.toContain(item.id);
    await expect(repository.listRecoverableDeliveryIds(NOW + 6 * 60_000, 10))
      .resolves.toContain(item.id);
    await expect(repository.claimDelivery(item.id, NOW + 6 * 60_000))
      .resolves.toMatchObject({ id: item.id, attemptCount: 2 });
  });

  it("stops delivery and renewal when the catalog channel is revoked", async () => {
    const { repository, subscription } = await prepareActiveSubscription();
    await db.prepare(
      `UPDATE music_channels SET verification_status = 'revoked', active = 0,
        version = version + 1, updated_at = ? WHERE id = 'websub-channel'`,
    ).bind(NOW + 10).run();

    await expect(repository.recordDelivery({
      id: "delivery-after-channel-revoke",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "CCCCCCCCCCC",
      providerUpdatedAt: NOW + 11,
      now: NOW + 11,
    })).rejects.toMatchObject({ code: "stale_message" });
    await expect(repository.listRenewalMonitorIds(NOW + 12, 10)).resolves.toEqual([]);
    await expect(repository.listCleanupMonitorIds(10)).resolves.toEqual(["monitor-1"]);
    await db.prepare(
      `UPDATE music_channel_websub_subscriptions SET status = 'failed',
        last_error_code = 'hub_request_failed', updated_at = ? WHERE id = ?`,
    ).bind(NOW + 13, subscription.id).run();
    await expect(repository.listCleanupMonitorIds(10)).resolves.toEqual(["monitor-1"]);
  });

  it("lists only timed-out subscription intents for recovery", async () => {
    const { repository, subscription } = await prepareActiveSubscription();
    await repository.prepareSubscription({
      id: subscription.id,
      monitorId: "monitor-1",
      monitorGeneration: 0,
      topicUrl: subscription.topicUrl,
      callbackTokenHash: subscription.callbackTokenHash,
      secretVersion: 1,
      status: "renewing",
      pendingMode: "subscribe",
      actorUserId: "system:websub-renewal",
      eventId: "event-renew-stale",
      now: NOW + 10,
    });

    await expect(repository.listStaleIntents(NOW + 14 * 60_000, 10))
      .resolves.toEqual([]);
    await expect(repository.listStaleIntents(NOW + 16 * 60_000, 10))
      .resolves.toEqual([{ monitorId: "monitor-1", status: "renewing" }]);
  });

  it("stores Made for Kids as blocked and refuses persistence after rights revocation", async () => {
    const { repository, subscription } = await prepareActiveSubscription();
    const item = await repository.recordDelivery({
      id: "delivery-kids",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "KKKKKKKKKKK",
      providerUpdatedAt: NOW + 30,
      now: NOW + 30,
    });
    await repository.markDeliveryEnqueued(item.id, NOW + 31);
    const work = await repository.claimDelivery(item.id, NOW + 32);
    await repository.recordDeliveryObservation({
      delivery: work!,
      observation: {
        videoId: "KKKKKKKKKKK",
        availabilityStatus: "playable",
        video: {
          videoId: "KKKKKKKKKKK",
          channelId: CHANNEL_ID,
          channelTitle: "Approved Clips",
          title: "Kids video",
          thumbnailUrl: null,
          durationSeconds: 30,
          publishedAt: NOW + 25,
          availabilityStatus: "playable",
          madeForKids: true,
        },
      },
      now: NOW + 33,
    });
    await expect(db.prepare(
      `SELECT status, classification, exclusion_reason
       FROM music_ingestion_candidates WHERE external_video_id = 'KKKKKKKKKKK'`,
    ).first()).resolves.toEqual({
      status: "blocked",
      classification: "policy_blocked",
      exclusion_reason: "made_for_kids",
    });

    const racing = await repository.recordDelivery({
      id: "delivery-race",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "RRRRRRRRRRR",
      providerUpdatedAt: NOW + 35,
      now: NOW + 35,
    });
    await repository.markDeliveryEnqueued(racing.id, NOW + 36);
    const racingWork = await repository.claimDelivery(racing.id, NOW + 37);

    await db.prepare(
      `UPDATE music_channel_automation_approvals
       SET status = 'revoked', revoked_by_user_id = 'admin-2', revoked_at = ?,
         version = version + 1, updated_at = ? WHERE channel_id = 'websub-channel'`,
    ).bind(NOW + 40, NOW + 40).run();
    await expect(
      new D1ChannelMonitorRepository(db).claim("monitor-1", NOW + 41),
    ).resolves.toBeNull();
    await expect(repository.listRenewalMonitorIds(NOW + 41, 10)).resolves.toEqual([]);
    await expect(repository.recordDelivery({
      id: "delivery-after-revoke",
      subscription,
      externalChannelId: CHANNEL_ID,
      externalVideoId: "SSSSSSSSSSS",
      providerUpdatedAt: NOW + 42,
      now: NOW + 42,
    })).rejects.toMatchObject({ code: "stale_message" });
    await expect(repository.recordDeliveryObservation({
      delivery: racingWork!,
      observation: {
        videoId: "RRRRRRRRRRR",
        availabilityStatus: "playable",
        video: {
          videoId: "RRRRRRRRRRR",
          channelId: CHANNEL_ID,
          channelTitle: "Approved Clips",
          title: "Racing revocation",
          thumbnailUrl: null,
          durationSeconds: 60,
          publishedAt: NOW + 34,
          availabilityStatus: "playable",
          madeForKids: false,
        },
      },
      now: NOW + 43,
    })).rejects.toMatchObject({ code: "stale_message" });
    const revokedCounts = await db.prepare(
      `SELECT
        (SELECT COUNT(*) FROM music_channel_websub_deliveries
          WHERE external_video_id = 'SSSSSSSSSSS') AS post_revoke_deliveries,
        (SELECT COUNT(*) FROM music_ingestion_candidates
          WHERE external_video_id = 'RRRRRRRRRRR') AS racing_candidates,
        (SELECT COUNT(*) FROM music_channel_upload_candidate_origins AS origin
          JOIN music_ingestion_candidates AS candidate ON candidate.id = origin.candidate_id
          WHERE candidate.external_video_id = 'RRRRRRRRRRR') AS racing_origins`,
    ).first<{ post_revoke_deliveries: number; racing_candidates: number; racing_origins: number }>();
    expect(revokedCounts).toEqual({
      post_revoke_deliveries: 0,
      racing_candidates: 0,
      racing_origins: 0,
    });

    await db.prepare(
      "UPDATE music_channel_upload_monitors SET status = 'paused' WHERE id = 'monitor-1'",
    ).run();
    await expect(repository.prepareSubscription({
      id: subscription.id,
      monitorId: "monitor-1",
      monitorGeneration: 0,
      topicUrl: subscription.topicUrl,
      callbackTokenHash: subscription.callbackTokenHash,
      secretVersion: 1,
      status: "unsubscribing",
      pendingMode: "unsubscribe",
      actorUserId: "admin-2",
      eventId: "event-unsubscribe-after-revoke",
      now: NOW + 44,
    })).resolves.toBeUndefined();
    await expect(repository.getCurrentSubscription("monitor-1", 0)).resolves.toMatchObject({
      status: "unsubscribing",
      pendingMode: "unsubscribe",
      monitorStatus: "paused",
      approvalStatus: "revoked",
    });
  });
});
