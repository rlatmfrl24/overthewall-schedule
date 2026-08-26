import type { OtwPlayChannelMonitorDto } from "@contracts/otw-play";
import {
  deriveWebsubSecrets,
  sha256Hex,
  verifyWebsubSignature,
} from "../domain/websub-crypto";
import {
  parseYoutubeWebsubFeed,
  YoutubeWebsubFeedError,
} from "../domain/youtube-websub-feed";
import { IngestionRepositoryError } from "./ports/ingestion-repository";
import type { OtwPlayYouTubeIngestionReader } from "./ports/youtube-metadata";
import type {
  OtwPlayWebsubQueueMessage,
  WebsubHubClient,
  WebsubQueueSender,
  WebsubRepository,
} from "./ports/websub-repository";
import { WebsubHubRequestError } from "./ports/websub-repository";

const CHALLENGE_PATTERN = /^[\x20-\x7E]{1,2048}$/u;
const MAX_LEASE_SECONDS = 365 * 24 * 60 * 60;

export type WebsubErrorCode =
  | "not_found"
  | "invalid_request"
  | "invalid_signature"
  | "invalid_feed"
  | "authority_denied"
  | "not_configured"
  | "hub_failed"
  | "queue_failed";

export class WebsubError extends Error {
  readonly code: WebsubErrorCode;
  readonly retryable: boolean;

  constructor(
    code: WebsubErrorCode,
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "WebsubError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class WebsubService {
  private readonly repository: WebsubRepository;
  private readonly youtube: OtwPlayYouTubeIngestionReader;
  private readonly hub: WebsubHubClient;
  private readonly queue: WebsubQueueSender;
  private readonly rootSecrets: Readonly<Record<number, string | undefined>>;
  private readonly publicOrigin: string | undefined;
  private readonly createId: () => string;
  private readonly clock: () => number;

  constructor(
    repository: WebsubRepository,
    youtube: OtwPlayYouTubeIngestionReader,
    hub: WebsubHubClient,
    queue: WebsubQueueSender,
    rootSecrets: Readonly<Record<number, string | undefined>>,
    publicOrigin: string | undefined,
    createId: () => string = () => crypto.randomUUID(),
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.hub = hub;
    this.queue = queue;
    this.rootSecrets = rootSecrets;
    this.publicOrigin = publicOrigin;
    this.createId = createId;
    this.clock = clock;
  }

  private getSecret(version: number) {
    const value = this.rootSecrets[version]?.trim();
    if (!value) {
      throw new WebsubError(
        "not_configured",
        `WebSub secret V${version} is not configured`,
        true,
      );
    }
    return value;
  }

  private getOrigin() {
    const value = this.publicOrigin?.trim();
    let parsed: URL | null = null;
    try {
      parsed = value ? new URL(value) : null;
    } catch {
      parsed = null;
    }
    if (
      !parsed || parsed.protocol !== "https:" || parsed.username || parsed.password ||
      parsed.pathname !== "/" || parsed.search || parsed.hash
    ) {
      throw new WebsubError(
        "not_configured",
        "A verified HTTPS WebSub public origin is required",
        true,
      );
    }
    return parsed.origin;
  }

  private assertMonitorAuthority(monitor: OtwPlayChannelMonitorDto) {
    if (
      monitor.status !== "active" ||
      monitor.automationApproval?.scope !== "candidate_collection" ||
      monitor.automationApproval.status !== "approved"
    ) {
      throw new WebsubError(
        "authority_denied",
        "An active candidate-collection approval is required",
      );
    }
  }

  async subscribe(monitorId: string, actorUserId: string) {
    return this.requestSubscription(monitorId, "subscribe", false, actorUserId);
  }

  async renew(monitorId: string, actorUserId: string) {
    return this.requestSubscription(monitorId, "subscribe", true, actorUserId);
  }

  async unsubscribe(monitorId: string, actorUserId: string) {
    return this.requestSubscription(monitorId, "unsubscribe", false, actorUserId);
  }

  private async requestSubscription(
    monitorId: string,
    mode: "subscribe" | "unsubscribe",
    renewal: boolean,
    actorUserId: string,
    retryRenewal = false,
  ) {
    let monitor: OtwPlayChannelMonitorDto;
    try {
      monitor = await this.repository.getMonitor(monitorId);
    } catch (error) {
      if (error instanceof IngestionRepositoryError && error.code === "not_found") {
        throw new WebsubError("not_found", "Channel monitor not found");
      }
      throw error;
    }
    if (mode === "subscribe") this.assertMonitorAuthority(monitor);
    const current = await this.repository.getCurrentSubscription(
      monitor.id,
      monitor.generation,
    );
    const currentIsVerifiedActive = current?.status === "active" &&
      current.verifiedAt !== null &&
      current.leaseExpiresAt !== null;
    if (
      renewal && !currentIsVerifiedActive &&
      !(retryRenewal && current?.status === "renewing")
    ) {
      throw new WebsubError("invalid_request", "Only an active subscription can be renewed");
    }
    if (mode === "subscribe" && !renewal && currentIsVerifiedActive) {
      throw new WebsubError("invalid_request", "The monitor is already subscribed");
    }
    if (mode === "unsubscribe" && (!current || current.status === "unsubscribed")) {
      throw new WebsubError("invalid_request", "No subscription exists for this monitor");
    }
    const id = current?.id ?? this.createId();
    const secretVersion = current?.secretVersion ?? 1;
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${monitor.externalChannelId}`;
    let secrets: Awaited<ReturnType<typeof deriveWebsubSecrets>>;
    let callbackUrl: string;
    try {
      secrets = await deriveWebsubSecrets(
        this.getSecret(secretVersion),
        id,
        monitor.generation,
      );
      callbackUrl = `${this.getOrigin()}/api/play/webhooks/youtube/${secrets.callbackToken}`;
    } catch (error) {
      if (current) {
        await this.repository.markSubscriptionFailed(
          id,
          error instanceof WebsubError ? error.code : "callback_configuration_failed",
          currentIsVerifiedActive ? "active" : "failed",
          this.clock(),
        ).catch(() => undefined);
      }
      throw error;
    }
    const now = this.clock();
    try {
      await this.repository.prepareSubscription({
        id,
        monitorId: monitor.id,
        monitorGeneration: monitor.generation,
        topicUrl,
        callbackTokenHash: secrets.callbackTokenHash,
        secretVersion,
        status: mode === "unsubscribe"
          ? "unsubscribing"
          : renewal
            ? "renewing"
            : "pending",
        pendingMode: mode,
        actorUserId,
        eventId: this.createId(),
        now,
      });
    } catch (error) {
      if (error instanceof IngestionRepositoryError) {
        throw new WebsubError(
          mode === "subscribe" ? "authority_denied" : "invalid_request",
          mode === "subscribe"
            ? "WebSub subscription authority changed"
            : "WebSub unsubscribe state changed",
        );
      }
      throw error;
    }
    try {
      await this.hub.request({
        mode,
        topicUrl,
        callbackUrl,
        hubSecret: secrets.hubSecret,
      });
    } catch (error) {
      await this.repository.markSubscriptionFailed(
        id,
        error instanceof WebsubHubRequestError ? error.code : "hub_request_failed",
        currentIsVerifiedActive ? "active" : "failed",
        this.clock(),
      );
      throw new WebsubError("hub_failed", "WebSub hub request failed", true);
    }
    return this.repository.getMonitor(monitor.id);
  }

  async verifyIntent(
    token: string,
    input: {
      mode: string | null;
      topic: string | null;
      challenge: string | null;
      leaseSeconds: string | null;
      reason: string | null;
    },
  ) {
    const subscription = await this.repository.findSubscriptionByTokenHash(
      await sha256Hex(token),
    );
    if (!subscription) throw new WebsubError("not_found", "Unknown callback token");
    if (input.reason) {
      if (
        (input.mode !== "subscribe" && input.mode !== "unsubscribe") ||
        input.mode !== subscription.pendingMode ||
        input.topic !== subscription.topicUrl
      ) {
        throw new WebsubError("invalid_request", "Invalid WebSub denial intent");
      }
      await this.repository.markSubscriptionDenied(
        subscription.id,
        "hub_denied",
        this.clock(),
      );
      return { denied: true as const, challenge: null };
    }
    if (
      (input.mode !== "subscribe" && input.mode !== "unsubscribe") ||
      input.mode !== subscription.pendingMode ||
      input.topic !== subscription.topicUrl ||
      !input.challenge || !CHALLENGE_PATTERN.test(input.challenge)
    ) {
      throw new WebsubError("invalid_request", "Invalid WebSub intent verification");
    }
    let leaseExpiresAt: number | null = null;
    if (input.mode === "subscribe") {
      const leaseSeconds = Number(input.leaseSeconds);
      if (
        !Number.isSafeInteger(leaseSeconds) ||
        leaseSeconds < 1 ||
        leaseSeconds > MAX_LEASE_SECONDS
      ) {
        throw new WebsubError("invalid_request", "Invalid WebSub lease");
      }
      leaseExpiresAt = this.clock() + leaseSeconds * 1_000;
    }
    try {
      await this.repository.markSubscriptionVerified({
        id: subscription.id,
        mode: input.mode,
        leaseExpiresAt,
        now: this.clock(),
      });
    } catch (error) {
      if (error instanceof IngestionRepositoryError && error.code === "stale_message") {
        throw new WebsubError("invalid_request", "WebSub intent is no longer pending");
      }
      throw error;
    }
    return { denied: false as const, challenge: input.challenge };
  }

  async receiveNotification(input: {
    token: string;
    signature: string | null;
    payload: Uint8Array;
  }) {
    const subscription = await this.repository.findSubscriptionByTokenHash(
      await sha256Hex(input.token),
    );
    if (!subscription) throw new WebsubError("not_found", "Unknown callback token");
    if (
      subscription.status !== "active" ||
      subscription.monitorStatus !== "active" ||
      subscription.monitorDeletedAt !== null ||
      subscription.approvalStatus !== "approved"
    ) {
      throw new WebsubError("authority_denied", "WebSub subscription is not active");
    }
    const secrets = await deriveWebsubSecrets(
      this.getSecret(subscription.secretVersion),
      subscription.id,
      subscription.monitorGeneration,
    );
    if (!await verifyWebsubSignature(input.signature, secrets.hubSecret, input.payload)) {
      throw new WebsubError("invalid_signature", "Invalid WebSub signature");
    }
    let feed;
    try {
      feed = parseYoutubeWebsubFeed(new TextDecoder().decode(input.payload));
    } catch (error) {
      if (error instanceof YoutubeWebsubFeedError) {
        throw new WebsubError("invalid_feed", error.message);
      }
      throw error;
    }
    if (feed.topicUrl !== subscription.topicUrl) {
      throw new WebsubError("invalid_feed", "WebSub topic does not match subscription");
    }
    if (feed.entries.some((entry) => entry.channelId !== subscription.externalChannelId)) {
      throw new WebsubError("invalid_feed", "WebSub channel does not match subscription");
    }
    for (const entry of feed.entries) {
      let delivery: { id: string; shouldEnqueue: boolean };
      try {
        delivery = await this.repository.recordDelivery({
          id: this.createId(),
          subscription,
          externalChannelId: entry.channelId,
          externalVideoId: entry.videoId,
          providerUpdatedAt: entry.updatedAt,
          now: this.clock(),
        });
      } catch (error) {
        if (error instanceof IngestionRepositoryError && error.code === "stale_message") {
          throw new WebsubError("authority_denied", "WebSub delivery authority changed");
        }
        throw error;
      }
      if (!delivery.shouldEnqueue) continue;
      try {
        await this.queue.send({
          schemaVersion: 1,
          messageType: "channel_websub",
          deliveryId: delivery.id,
        });
        await this.repository.markDeliveryEnqueued(delivery.id, this.clock());
      } catch {
        await this.repository.markDeliveryFailed(
          delivery.id,
          "queue_send_failed",
          this.clock(),
        );
        throw new WebsubError("queue_failed", "WebSub delivery enqueue failed", true);
      }
    }
  }

  async process(message: OtwPlayWebsubQueueMessage) {
    const delivery = await this.repository.claimDelivery(message.deliveryId, this.clock());
    if (!delivery) return;
    if (
      delivery.monitorStatus !== "active" ||
      delivery.monitorDeletedAt !== null ||
      delivery.approvalStatus !== "approved"
    ) {
      await this.repository.rejectDelivery(
        delivery.id,
        "authority_revoked",
        this.clock(),
      );
      return;
    }
    try {
      const [observation] = await this.youtube.readVideos([delivery.externalVideoId]);
      if (!observation) throw new WebsubError("invalid_feed", "Video metadata is missing");
      if (
        observation.video !== null &&
        observation.video.channelId !== delivery.externalChannelId
      ) {
        await this.repository.rejectDelivery(
          delivery.id,
          "channel_mismatch",
          this.clock(),
        );
        return;
      }
      await this.repository.recordDeliveryObservation({
        delivery,
        observation,
        now: this.clock(),
      });
    } catch (error) {
      if (error instanceof WebsubError && !error.retryable) {
        await this.repository.rejectDelivery(delivery.id, error.code, this.clock());
        return;
      }
      if (error instanceof IngestionRepositoryError && error.code === "stale_message") {
        await this.repository.rejectDelivery(
          delivery.id,
          "authority_revoked",
          this.clock(),
        );
        return;
      }
      await this.repository.markDeliveryFailed(
        delivery.id,
        "metadata_read_failed",
        this.clock(),
      );
      throw error;
    }
  }

  markDeadLetter(message: OtwPlayWebsubQueueMessage) {
    return this.repository.markDeliveryDeadLetter(
      message.deliveryId,
      "queue_retries_exhausted",
      this.clock(),
    );
  }

  async recoverPending(limit = 50) {
    const ids = await this.repository.listRecoverableDeliveryIds(this.clock(), limit);
    let enqueued = 0;
    for (const id of ids) {
      try {
        await this.queue.send({
          schemaVersion: 1,
          messageType: "channel_websub",
          deliveryId: id,
        });
        await this.repository.markDeliveryEnqueued(id, this.clock());
        enqueued += 1;
      } catch {
        await this.repository.markDeliveryFailed(id, "queue_send_failed", this.clock());
      }
    }
    return enqueued;
  }

  async cleanupInvalidSubscriptions(
    actorUserId = "system:websub-cleanup",
    limit = 10,
  ) {
    const ids = await this.repository.listCleanupMonitorIds(limit);
    const results: Array<{ id: string; ok: boolean }> = [];
    for (const id of ids) {
      try {
        await this.unsubscribe(id, actorUserId);
        results.push({ id, ok: true });
      } catch {
        results.push({ id, ok: false });
      }
    }
    return results;
  }

  async recoverStaleIntents(
    actorUserId = "system:websub-intent-recovery",
    limit = 10,
  ) {
    const intents = await this.repository.listStaleIntents(this.clock(), limit);
    const results: Array<{ id: string; ok: boolean }> = [];
    for (const intent of intents) {
      try {
        if (intent.status === "pending") {
          await this.subscribe(intent.monitorId, actorUserId);
        } else if (intent.status === "renewing") {
          await this.requestSubscription(
            intent.monitorId,
            "subscribe",
            true,
            actorUserId,
            true,
          );
        } else {
          await this.unsubscribe(intent.monitorId, actorUserId);
        }
        results.push({ id: intent.monitorId, ok: true });
      } catch {
        results.push({ id: intent.monitorId, ok: false });
      }
    }
    return results;
  }

  async renewDue(actorUserId = "system:websub-renewal", limit = 10) {
    const ids = await this.repository.listRenewalMonitorIds(this.clock(), limit);
    const results: Array<{ id: string; ok: boolean }> = [];
    for (const id of ids) {
      try {
        await this.renew(id, actorUserId);
        results.push({ id, ok: true });
      } catch {
        results.push({ id, ok: false });
      }
    }
    return results;
  }
}
