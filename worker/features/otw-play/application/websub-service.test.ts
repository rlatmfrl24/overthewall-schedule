import { describe, expect, it, vi } from "vitest";
import type { OtwPlayChannelMonitorDto } from "@contracts/otw-play";
import { deriveWebsubSecrets } from "../domain/websub-crypto";
import type { OtwPlayYouTubeIngestionReader } from "./ports/youtube-metadata";
import type {
  WebsubDeliveryWorkItem,
  WebsubRepository,
  WebsubSubscriptionAuthority,
} from "./ports/websub-repository";
import { IngestionRepositoryError } from "./ports/ingestion-repository";
import { WebsubService } from "./websub-service";

const encoder = new TextEncoder();
const NOW = Date.UTC(2026, 7, 25, 6);

const monitor: OtwPlayChannelMonitorDto = {
  id: "monitor-1",
  channelId: "channel-1",
  channelDisplayName: "Approved Clips",
  externalChannelId: "UCmmmmmmmmmmmmmmmmmmmmmm",
  uploadsPlaylistId: "UUmmmmmmmmmmmmmmmmmmmmmm",
  status: "active",
  checkIntervalMinutes: 360,
  lastCheckedAt: null,
  nextCheckAt: NOW,
  lastSeenVideoId: "AAAAAAAAAAA",
  lastSeenPublishedAt: NOW - 1_000,
  lastRecentReconciledAt: null,
  lastErrorCode: null,
  automationApproval: {
    scope: "candidate_collection",
    status: "approved",
    operatorReference: "operator-proof",
    approvalReference: "rights-ticket",
    revocationProcedure: "pause and unsubscribe",
    approvedByUserId: "admin-1",
    approvedAt: NOW,
    revokedByUserId: null,
    revokedAt: null,
    version: 0,
  },
  subscription: null,
  candidateCount: 0,
  pendingCandidateCount: 0,
  previousGenerationPendingCount: 0,
  deliveryHealth: {
    pendingCount: 0,
    failedCount: 0,
    deadLetterCount: 0,
    lastReceivedAt: null,
    lastProcessedAt: null,
    lastFailedAt: null,
    lastErrorCode: null,
  },
  generation: 0,
  version: 0,
  createdAt: NOW,
  updatedAt: NOW,
};

const subscription: WebsubSubscriptionAuthority = {
  id: "subscription-1",
  monitorId: monitor.id,
  monitorGeneration: 0,
  externalChannelId: monitor.externalChannelId,
  topicUrl: `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${monitor.externalChannelId}`,
  callbackTokenHash: "a".repeat(64),
  secretVersion: 1,
  status: "active",
  pendingMode: null,
  requestedAt: NOW,
  verifiedAt: NOW,
  leaseExpiresAt: NOW + 86_400_000,
  monitorStatus: "active",
  monitorDeletedAt: null,
  approvalStatus: "approved",
};

const delivery = (overrides: Partial<WebsubDeliveryWorkItem> = {}): WebsubDeliveryWorkItem => ({
  id: "delivery-1",
  subscriptionId: subscription.id,
  monitorId: monitor.id,
  monitorGeneration: 0,
  externalChannelId: monitor.externalChannelId,
  externalVideoId: "BBBBBBBBBBB",
  providerUpdatedAt: NOW,
  status: "processing",
  attemptCount: 1,
  monitorVersion: 0,
  monitorStatus: "active",
  monitorDeletedAt: null,
  approvalStatus: "approved",
  ...overrides,
});

const repository = () => ({
  getMonitor: vi.fn(async () => monitor),
  getCurrentSubscription: vi.fn<WebsubRepository["getCurrentSubscription"]>(
    async () => subscription,
  ),
  findSubscriptionByTokenHash: vi.fn(async () => subscription),
  prepareSubscription: vi.fn(async () => undefined),
  markSubscriptionVerified: vi.fn(async () => undefined),
  markSubscriptionDenied: vi.fn(async () => undefined),
  markSubscriptionFailed: vi.fn(async () => undefined),
  recordDelivery: vi.fn(async () => ({ id: "delivery-1", shouldEnqueue: true })),
  markDeliveryEnqueued: vi.fn(async () => undefined),
  markDeliveryFailed: vi.fn(async () => undefined),
  claimDelivery: vi.fn(async () => delivery()),
  recordDeliveryObservation: vi.fn(async () => undefined),
  rejectDelivery: vi.fn(async () => undefined),
  markDeliveryDeadLetter: vi.fn(async () => undefined),
  listRecoverableDeliveryIds: vi.fn(async () => []),
  listStaleIntents: vi.fn<WebsubRepository["listStaleIntents"]>(async () => []),
  listCleanupMonitorIds: vi.fn<WebsubRepository["listCleanupMonitorIds"]>(async () => []),
  listRenewalMonitorIds: vi.fn(async () => []),
}) satisfies WebsubRepository;

const youtube = () => ({
  readChannel: vi.fn(async () => null),
  readChannelUploads: vi.fn(async () => null),
  readVideo: vi.fn(async () => null),
  readVideos: vi.fn<OtwPlayYouTubeIngestionReader["readVideos"]>(async ([videoId]) => [{
    videoId: videoId!,
    availabilityStatus: "playable",
    video: {
      videoId: videoId!,
      channelId: monitor.externalChannelId,
      channelTitle: monitor.channelDisplayName,
      title: "Authoritative title",
      thumbnailUrl: null,
      durationSeconds: 120,
      publishedAt: NOW,
      availabilityStatus: "playable",
      madeForKids: false,
    },
  }]),
  readPlaylistSummary: vi.fn(async () => null),
  readPlaylistPage: vi.fn(async () => ({ items: [], nextPageToken: null })),
}) satisfies OtwPlayYouTubeIngestionReader;

const hmacHeader = async (secret: string, payload: Uint8Array) => {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, payload));
  return `sha256=${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
};

describe("WebsubService", () => {
  it("verifies the exact pending topic, challenge, and lease", async () => {
    const repo = repository();
    repo.findSubscriptionByTokenHash.mockResolvedValue({
      ...subscription,
      status: "pending",
      pendingMode: "subscribe",
    });
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "id",
      () => NOW,
    );

    await expect(service.verifyIntent("callback-token", {
      mode: "subscribe",
      topic: subscription.topicUrl,
      challenge: "challenge-value",
      leaseSeconds: "86400",
      reason: null,
    })).resolves.toEqual({ denied: false, challenge: "challenge-value" });
    expect(repo.markSubscriptionVerified).toHaveBeenCalledWith({
      id: subscription.id,
      mode: "subscribe",
      leaseExpiresAt: NOW + 86_400_000,
      now: NOW,
    });
    await expect(service.verifyIntent("callback-token", {
      mode: "subscribe",
      topic: "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx",
      challenge: null,
      leaseSeconds: null,
      reason: "denied",
    })).rejects.toMatchObject({ code: "invalid_request" });
    expect(repo.markSubscriptionDenied).not.toHaveBeenCalled();
  });

  it("authenticates an Atom notification and enqueues only its delivery id", async () => {
    const repo = repository();
    const queue = { send: vi.fn(async () => undefined) };
    const material = await deriveWebsubSecrets("root-secret", subscription.id, 0);
    const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
      <link rel="self" href="${subscription.topicUrl}" />
      <entry>
      <yt:videoId>BBBBBBBBBBB</yt:videoId>
      <yt:channelId>${monitor.externalChannelId}</yt:channelId>
      <updated>2026-08-25T06:00:00Z</updated>
    </entry></feed>`;
    const payload = encoder.encode(xml);
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      queue,
      { 1: "root-secret" },
      "https://example.com",
      () => "delivery-1",
      () => NOW,
    );

    await service.receiveNotification({
      token: material.callbackToken,
      signature: await hmacHeader(material.hubSecret, payload),
      payload,
    });

    expect(repo.recordDelivery).toHaveBeenCalledWith(expect.objectContaining({
      externalVideoId: "BBBBBBBBBBB",
      externalChannelId: monitor.externalChannelId,
    }));
    expect(queue.send).toHaveBeenCalledWith({
      schemaVersion: 1,
      messageType: "channel_websub",
      deliveryId: "delivery-1",
    });
  });

  it("rejects notification topic or channel mismatches before recording a delivery", async () => {
    const repo = repository();
    const material = await deriveWebsubSecrets("root-secret", subscription.id, 0);
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "delivery-1",
      () => NOW,
    );
    const xml = (topic: string, channelId: string) => encoder.encode(
      `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
        <link rel="self" href="${topic}" />
        <entry>
          <yt:videoId>BBBBBBBBBBB</yt:videoId>
          <yt:channelId>${channelId}</yt:channelId>
          <updated>2026-08-25T06:00:00Z</updated>
        </entry>
      </feed>`,
    );
    const wrongTopicPayload = xml(
      "https://www.youtube.com/xml/feeds/videos.xml?channel_id=UCxxxxxxxxxxxxxxxxxxxxxx",
      monitor.externalChannelId,
    );
    await expect(service.receiveNotification({
      token: material.callbackToken,
      signature: await hmacHeader(material.hubSecret, wrongTopicPayload),
      payload: wrongTopicPayload,
    })).rejects.toMatchObject({ code: "invalid_feed" });

    const wrongChannelPayload = xml(subscription.topicUrl, "UCxxxxxxxxxxxxxxxxxxxxxx");
    await expect(service.receiveNotification({
      token: material.callbackToken,
      signature: await hmacHeader(material.hubSecret, wrongChannelPayload),
      payload: wrongChannelPayload,
    })).rejects.toMatchObject({ code: "invalid_feed" });
    expect(repo.recordDelivery).not.toHaveBeenCalled();
  });

  it.each([
    ["unverified", { verifiedAt: null }],
    ["missing lease", { leaseExpiresAt: null }],
    ["expired", { leaseExpiresAt: NOW }],
  ])("rejects %s active callbacks before delivery persistence or enqueue", async (_label, override) => {
    const repo = repository();
    repo.findSubscriptionByTokenHash.mockResolvedValueOnce({ ...subscription, ...override });
    const queue = { send: vi.fn() };
    const material = await deriveWebsubSecrets("root-secret", subscription.id, 0);
    const payload = encoder.encode(
      `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015"><link rel="self" href="${subscription.topicUrl}" /><entry><yt:videoId>BBBBBBBBBBB</yt:videoId><yt:channelId>${monitor.externalChannelId}</yt:channelId></entry></feed>`,
    );
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      queue,
      { 1: "root-secret" },
      "https://example.com",
      () => "delivery-1",
      () => NOW,
    );

    await expect(service.receiveNotification({
      token: material.callbackToken,
      signature: await hmacHeader(material.hubSecret, payload),
      payload,
    })).rejects.toMatchObject({ code: "authority_denied" });
    expect(repo.recordDelivery).not.toHaveBeenCalled();
    expect(queue.send).not.toHaveBeenCalled();
  });

  it("rejects revoked authority and authoritative channel mismatches", async () => {
    const repo = repository();
    const reader = youtube();
    repo.claimDelivery.mockResolvedValueOnce(delivery({ approvalStatus: "revoked" }));
    const service = new WebsubService(
      repo,
      reader,
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "id",
      () => NOW,
    );
    await service.process({ schemaVersion: 1, messageType: "channel_websub", deliveryId: "delivery-1" });
    expect(repo.rejectDelivery).toHaveBeenCalledWith("delivery-1", "authority_revoked", NOW);
    expect(reader.readVideos).not.toHaveBeenCalled();

    repo.claimDelivery.mockResolvedValueOnce(delivery());
    reader.readVideos.mockResolvedValueOnce([{
      videoId: "BBBBBBBBBBB",
      availabilityStatus: "playable",
      video: {
        videoId: "BBBBBBBBBBB",
        channelId: "UCxxxxxxxxxxxxxxxxxxxxxx",
        channelTitle: "Other",
        title: "Wrong channel",
        thumbnailUrl: null,
        durationSeconds: 10,
        publishedAt: NOW,
        availabilityStatus: "playable",
      },
    }]);
    await service.process({ schemaVersion: 1, messageType: "channel_websub", deliveryId: "delivery-1" });
    expect(repo.rejectDelivery).toHaveBeenCalledWith("delivery-1", "channel_mismatch", NOW);
  });

  it("still permits unsubscribe cleanup after a monitor is paused or rights are revoked", async () => {
    const repo = repository();
    repo.getMonitor.mockResolvedValue({
      ...monitor,
      status: "paused",
      automationApproval: {
        ...monitor.automationApproval!,
        status: "revoked",
        revokedByUserId: "admin-2",
        revokedAt: NOW,
        version: 1,
      },
    });
    repo.getCurrentSubscription.mockResolvedValue({
      ...subscription,
      monitorStatus: "paused",
      approvalStatus: "revoked",
    });
    const hub = { request: vi.fn(async () => undefined) };
    const service = new WebsubService(
      repo,
      youtube(),
      hub,
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "event-1",
      () => NOW,
    );

    await expect(service.unsubscribe("monitor-1", "admin-2")).resolves.toMatchObject({
      status: "paused",
    });
    expect(repo.prepareSubscription).toHaveBeenCalledWith(expect.objectContaining({
      id: subscription.id,
      status: "unsubscribing",
      pendingMode: "unsubscribe",
      actorUserId: "admin-2",
    }));
    expect(hub.request).toHaveBeenCalledWith(expect.objectContaining({
      mode: "unsubscribe",
    }));
  });

  it("keeps the existing lease active when a renewal hub request fails", async () => {
    const repo = repository();
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn(async () => { throw new Error("hub unavailable"); }) },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "event-1",
      () => NOW,
    );

    await expect(service.renew("monitor-1", "system:websub-renewal"))
      .rejects.toMatchObject({ code: "hub_failed", retryable: true });
    expect(repo.markSubscriptionFailed).toHaveBeenCalledWith(
      subscription.id,
      "hub_request_failed",
      "active",
      NOW,
    );
  });

  it("repairs an unverified active row as a fresh subscription and never restores it as active", async () => {
    const repo = repository();
    repo.getCurrentSubscription.mockResolvedValue({
      ...subscription,
      verifiedAt: null,
      leaseExpiresAt: null,
    });
    repo.getMonitor.mockResolvedValue({
      ...monitor,
      subscription: {
        id: subscription.id,
        status: "active",
        pendingMode: null,
        secretVersion: 1,
        requestedAt: NOW,
        verifiedAt: null,
        leaseExpiresAt: null,
        lastNotificationAt: null,
        lastErrorCode: "hub_request_failed",
        effectiveActive: false,
        recoveryReason: "unverified",
        version: 2,
      },
    });
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn(async () => { throw new Error("hub unavailable"); }) },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "event-1",
      () => NOW,
    );

    await expect(service.subscribe("monitor-1", "admin-1"))
      .rejects.toMatchObject({ code: "hub_failed", retryable: true });
    expect(repo.prepareSubscription).toHaveBeenCalledWith(expect.objectContaining({
      id: subscription.id,
      status: "pending",
      pendingMode: "subscribe",
    }));
    expect(repo.markSubscriptionFailed).toHaveBeenCalledWith(
      subscription.id,
      "hub_request_failed",
      "failed",
      NOW,
    );
  });

  it("requires an exact HTTPS public origin before creating a capability callback", async () => {
    const repo = repository();
    repo.getCurrentSubscription.mockResolvedValueOnce(null);
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com/unverified-path",
      () => "subscription-2",
      () => NOW,
    );

    await expect(service.subscribe("monitor-1", "admin-1")).rejects.toMatchObject({
      code: "not_configured",
      retryable: true,
    });
    expect(repo.prepareSubscription).not.toHaveBeenCalled();
  });

  it("persists a retryable transport error when unsubscribe configuration is missing", async () => {
    const repo = repository();
    const service = new WebsubService(
      repo,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      {},
      "https://example.com",
      () => "event-1",
      () => NOW,
    );

    await expect(service.unsubscribe("monitor-1", "admin-2")).rejects.toMatchObject({
      code: "not_configured",
      retryable: true,
    });
    expect(repo.markSubscriptionFailed).toHaveBeenCalledWith(
      subscription.id,
      "not_configured",
      "active",
      NOW,
    );
    expect(repo.prepareSubscription).not.toHaveBeenCalled();
  });

  it("preserves Made for Kids as an authoritative blocked observation", async () => {
    const repo = repository();
    const reader = youtube();
    reader.readVideos.mockResolvedValueOnce([{
      videoId: "BBBBBBBBBBB",
      availabilityStatus: "playable",
      video: {
        videoId: "BBBBBBBBBBB",
        channelId: monitor.externalChannelId,
        channelTitle: monitor.channelDisplayName,
        title: "Kids video",
        thumbnailUrl: null,
        durationSeconds: 30,
        publishedAt: NOW,
        availabilityStatus: "playable",
        madeForKids: true,
      },
    }]);
    const service = new WebsubService(
      repo,
      reader,
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "id",
      () => NOW,
    );

    await service.process({ schemaVersion: 1, messageType: "channel_websub", deliveryId: "delivery-1" });
    expect(repo.recordDeliveryObservation).toHaveBeenCalledWith(expect.objectContaining({
      observation: expect.objectContaining({
        video: expect.objectContaining({ madeForKids: true }),
      }),
    }));
  });

  it("maps repository races to safe authority outcomes", async () => {
    const missing = repository();
    missing.getMonitor.mockRejectedValueOnce(
      new IngestionRepositoryError("not_found", "raw repository message"),
    );
    const service = new WebsubService(
      missing,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "id",
      () => NOW,
    );
    await expect(service.subscribe("missing", "admin-1")).rejects.toMatchObject({
      code: "not_found",
      message: "Channel monitor not found",
    });

    const raced = repository();
    raced.recordDeliveryObservation.mockRejectedValueOnce(
      new IngestionRepositoryError("stale_message", "raw repository message"),
    );
    const racedService = new WebsubService(
      raced,
      youtube(),
      { request: vi.fn() },
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "id",
      () => NOW,
    );
    await racedService.process({
      schemaVersion: 1,
      messageType: "channel_websub",
      deliveryId: "delivery-1",
    });
    expect(raced.rejectDelivery).toHaveBeenCalledWith(
      "delivery-1",
      "authority_revoked",
      NOW,
    );
    expect(raced.markDeliveryFailed).not.toHaveBeenCalled();
  });

  it("retries stale renewal intents and cleans up invalid active subscriptions", async () => {
    const repo = repository();
    repo.listStaleIntents.mockResolvedValueOnce([{
      monitorId: "monitor-1",
      status: "renewing",
    }]);
    repo.getCurrentSubscription.mockResolvedValue({
      ...subscription,
      status: "renewing",
      pendingMode: "subscribe",
    });
    repo.listCleanupMonitorIds.mockResolvedValueOnce(["monitor-1"]);
    const hub = { request: vi.fn(async () => undefined) };
    const service = new WebsubService(
      repo,
      youtube(),
      hub,
      { send: vi.fn() },
      { 1: "root-secret" },
      "https://example.com",
      () => "event-recovery",
      () => NOW,
    );

    await expect(service.recoverStaleIntents()).resolves.toEqual([{
      id: "monitor-1",
      ok: true,
    }]);
    expect(repo.prepareSubscription).toHaveBeenCalledWith(expect.objectContaining({
      status: "renewing",
      pendingMode: "subscribe",
      actorUserId: "system:websub-intent-recovery",
    }));

    repo.getCurrentSubscription.mockResolvedValue(subscription);
    await expect(service.cleanupInvalidSubscriptions()).resolves.toEqual([{
      id: "monitor-1",
      ok: true,
    }]);
    expect(repo.prepareSubscription).toHaveBeenLastCalledWith(expect.objectContaining({
      status: "unsubscribing",
      pendingMode: "unsubscribe",
      actorUserId: "system:websub-cleanup",
    }));
    expect(hub.request).toHaveBeenCalledTimes(2);
  });
});
