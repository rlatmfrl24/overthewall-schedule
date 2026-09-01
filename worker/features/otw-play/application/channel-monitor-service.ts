import type {
  OtwPlayChannelMonitorReconcileDto,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import type {
  ChannelMonitorAutomationApprovalInput,
  ChannelMonitorRepository,
} from "./ports/channel-monitor-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeIngestionReader,
  type OtwPlayYouTubeVideoObservation,
} from "./ports/youtube-metadata";
import { IngestionRepositoryError } from "./ports/ingestion-repository";
import {
  decodeChannelMonitorCandidateCursor,
  encodeChannelMonitorCandidateCursor,
} from "../domain/channel-monitor-cursor";

const MAX_RECONCILIATION_VIDEOS = 250;
// A failed or denied subscribe/renew/unsubscribe request can still leave the
// previous Hub lease alive. Only an acknowledged unsubscribe is safe for
// target replacement or deletion.
const TERMINAL_SUBSCRIPTION_STATUSES = new Set(["unsubscribed"]);
const PREAPPROVED_COLLECTION_AUTHORITY = {
  scope: "candidate_collection",
  operatorReference: "approved_kirinuki channel registration",
  approvalReference: "written email consent confirmed before monitor creation",
  revocationProcedure: "pause collection, unsubscribe WebSub, then remove the monitor",
  confirmed: true,
} as const satisfies ChannelMonitorAutomationApprovalInput;

export class ChannelMonitorService {
  private readonly repository: ChannelMonitorRepository;
  private readonly youtube: OtwPlayYouTubeIngestionReader;
  private readonly createId: () => string;
  private readonly clock: () => number;
  private readonly unsubscribeTransport?: (
    monitorId: string,
    actorUserId: string,
  ) => Promise<unknown>;

  constructor(
    repository: ChannelMonitorRepository,
    youtube: OtwPlayYouTubeIngestionReader,
    createId: () => string = () => crypto.randomUUID(),
    clock: () => number = Date.now,
    unsubscribeTransport?: (
      monitorId: string,
      actorUserId: string,
    ) => Promise<unknown>,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.createId = createId;
    this.clock = clock;
    this.unsubscribeTransport = unsubscribeTransport;
  }

  private assertTransportReleased(
    monitor: Awaited<ReturnType<ChannelMonitorRepository["get"]>>,
  ) {
    if (
      monitor.subscription &&
      !TERMINAL_SUBSCRIPTION_STATUSES.has(monitor.subscription.status)
    ) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Unsubscribe the current WebSub lease before deleting or changing the monitor target",
      );
    }
  }

  private async requestTransportStop(monitorId: string, actorUserId: string) {
    const monitor = await this.repository.get(monitorId);
    if (
      !this.unsubscribeTransport ||
      !monitor.subscription ||
      TERMINAL_SUBSCRIPTION_STATUSES.has(monitor.subscription.status) ||
      monitor.subscription.status === "unsubscribing"
    ) return monitor;
    try {
      await this.unsubscribeTransport(monitorId, actorUserId);
    } catch {
      // The authority/status mutation already blocks collection. The persisted
      // transport error and scheduled cleanup keep unsubscribe retryable.
    }
    return this.repository.get(monitorId);
  }

  private async requireVersion(id: string, expectedVersion: number) {
    const current = await this.repository.get(id);
    if (current.version !== expectedVersion) {
      throw new IngestionRepositoryError(
        "stale_write",
        "Channel monitor changed during review",
        {
          expectedVersion: String(expectedVersion),
          actualVersion: String(current.version),
        },
      );
    }
    return current;
  }

  list() {
    return this.repository.list();
  }

  async listCandidates(
    id: string,
    limit = 50,
    cursorValue: string | null = null,
    generationScope: "current" | "previous" = "current",
  ) {
    const cursor = cursorValue
      ? decodeChannelMonitorCandidateCursor(cursorValue)
      : null;
    const result = await this.repository.listCandidates(
      id,
      Math.max(1, Math.min(100, limit)),
      cursor,
      generationScope,
    );
    const last = result.items.at(-1);
    return {
      items: result.items,
      nextCursor: result.hasMore && last
        ? encodeChannelMonitorCandidateCursor({
            discoveredAt: last.discoveredAt,
            candidateId: last.candidateId,
          })
        : null,
    };
  }

  async create(
    externalChannelId: string,
    actorUserId: string,
  ) {
    const existing = await this.repository.findByExternalChannel(externalChannelId);
    if (existing) {
      if (existing.automationApproval?.status === "approved") return existing;
      throw new IngestionRepositoryError(
        "validation_failed",
        "The existing monitor does not have an active candidate-collection approval",
      );
    }
    const channel = await this.repository.findApprovableChannel(externalChannelId);
    if (!channel) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Only active, approved singing-clip YouTube channels can be monitored",
      );
    }
    const uploads = await this.youtube.readChannelUploads(channel.externalChannelId);
    if (!uploads || uploads.channelId !== channel.externalChannelId) {
      throw new IngestionRepositoryError(
        "not_found",
        "The channel uploads playlist could not be resolved",
      );
    }
    const page = await this.youtube.readPlaylistPage(uploads.uploadsPlaylistId, null);
    return this.repository.create({
      id: this.createId(),
      eventId: this.createId(),
      approvalEventId: this.createId(),
      channel,
      uploadsPlaylistId: uploads.uploadsPlaylistId,
      lastSeenVideoId: page.items[0]?.videoId ?? null,
      approval: PREAPPROVED_COLLECTION_AUTHORITY,
      actorUserId,
      now: this.clock(),
    });
  }

  async updateStatus(
    id: string,
    expectedVersion: number,
    status: OtwPlayChannelMonitorStatus,
    actorUserId: string,
  ) {
    const current = await this.requireVersion(id, expectedVersion);
    const monitor = await this.repository.updateStatus({
      id,
      expectedVersion,
      status,
      actorUserId,
      eventId: this.createId(),
      now: this.clock(),
    });
    if (status === "paused") {
      return this.requestTransportStop(monitor.id, actorUserId);
    }
    if (current.status === "paused") {
      const page = await this.youtube.readPlaylistPage(
        current.uploadsPlaylistId,
        null,
      );
      return this.repository.resetWatermark({
        id: monitor.id,
        expectedVersion: monitor.version,
        lastSeenVideoId: page.items[0]?.videoId ?? null,
        actorUserId,
        eventId: this.createId(),
        now: this.clock(),
      });
    }
    return monitor;
  }

  async updateTarget(
    id: string,
    expectedVersion: number,
    externalChannelId: string,
    actorUserId: string,
  ) {
    const current = await this.requireVersion(id, expectedVersion);
    if (current.externalChannelId === externalChannelId) return current;
    this.assertTransportReleased(current);
    const duplicate = await this.repository.findByExternalChannel(externalChannelId);
    if (duplicate && duplicate.id !== id) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "The channel is already monitored",
      );
    }
    const channel = await this.repository.findEligibleChannel(externalChannelId);
    if (!channel) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Only active, approved singing-clip YouTube channels can be monitored",
      );
    }
    const uploads = await this.youtube.readChannelUploads(channel.externalChannelId);
    if (!uploads || uploads.channelId !== channel.externalChannelId) {
      throw new IngestionRepositoryError(
        "not_found",
        "The channel uploads playlist could not be resolved",
      );
    }
    const page = await this.youtube.readPlaylistPage(uploads.uploadsPlaylistId, null);
    return this.repository.updateTarget({
      id,
      expectedVersion,
      channel,
      uploadsPlaylistId: uploads.uploadsPlaylistId,
      lastSeenVideoId: page.items[0]?.videoId ?? null,
      actorUserId,
      eventId: this.createId(),
      now: this.clock(),
    });
  }

  async resetWatermark(
    id: string,
    expectedVersion: number,
    actorUserId: string,
  ) {
    const current = await this.requireVersion(id, expectedVersion);
    const channel = await this.repository.findEligibleChannel(current.externalChannelId);
    if (!channel) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Only active, approved singing-clip YouTube channels can be monitored",
      );
    }
    const uploads = await this.youtube.readChannelUploads(channel.externalChannelId);
    if (!uploads || uploads.channelId !== channel.externalChannelId) {
      throw new IngestionRepositoryError(
        "not_found",
        "The channel uploads playlist could not be resolved",
      );
    }
    const page = await this.youtube.readPlaylistPage(uploads.uploadsPlaylistId, null);
    return this.repository.resetWatermark({
      id,
      expectedVersion,
      lastSeenVideoId: page.items[0]?.videoId ?? null,
      actorUserId,
      eventId: this.createId(),
      now: this.clock(),
    });
  }

  async revokeApproval(
    id: string,
    expectedVersion: number,
    expectedApprovalVersion: number,
    actorUserId: string,
  ) {
    await this.requireVersion(id, expectedVersion);
    const monitor = await this.repository.revokeApproval({
      id,
      expectedVersion,
      expectedApprovalVersion,
      actorUserId,
      approvalEventId: this.createId(),
      monitorEventId: this.createId(),
      now: this.clock(),
    });
    return this.requestTransportStop(monitor.id, actorUserId);
  }

  async remove(id: string, expectedVersion: number, actorUserId: string) {
    const current = await this.requireVersion(id, expectedVersion);
    this.assertTransportReleased(current);
    return this.repository.remove({
      id,
      expectedVersion,
      actorUserId,
      eventId: this.createId(),
      now: this.clock(),
    });
  }

  async reconcile(id: string): Promise<OtwPlayChannelMonitorReconcileDto> {
    const startedAt = this.clock();
    const monitor = await this.repository.claim(id, startedAt);
    if (!monitor) {
      throw new IngestionRepositoryError(
        "unavailable",
        "The channel monitor is paused or already being checked",
      );
    }
    try {
      const videoIds: string[] = [];
      let pageToken: string | null = monitor.syncPageToken ?? null;
      let foundWatermark = false;
      let hasMore = false;
      const baseVideoId = monitor.syncBaseVideoId ?? monitor.lastSeenVideoId;
      let newestVideoId: string | null = monitor.syncNewestVideoId ?? monitor.lastSeenVideoId;
      let firstPage = monitor.syncPageToken == null;

      do {
        const page = await this.youtube.readPlaylistPage(
          monitor.uploadsPlaylistId,
          pageToken,
        );
        if (firstPage) {
          newestVideoId = page.items[0]?.videoId ?? monitor.lastSeenVideoId;
          firstPage = false;
        }
        for (const item of page.items) {
          if (baseVideoId && item.videoId === baseVideoId) {
            foundWatermark = true;
            break;
          }
          if (!videoIds.includes(item.videoId)) videoIds.push(item.videoId);
          if (videoIds.length >= MAX_RECONCILIATION_VIDEOS) break;
        }
        pageToken = page.nextPageToken;
        hasMore = pageToken !== null;
      } while (
        !foundWatermark &&
        pageToken !== null &&
        videoIds.length < MAX_RECONCILIATION_VIDEOS
      );

      const capped = !foundWatermark &&
        videoIds.length >= MAX_RECONCILIATION_VIDEOS && hasMore;
      if (baseVideoId && !foundWatermark && !capped) {
        const gapMonitor = await this.repository.markGapSuspected({
          id: monitor.id,
          expectedVersion: monitor.version,
          monitorGeneration: monitor.generation,
          now: this.clock(),
        });
        return {
          monitor: gapMonitor,
          discoveredCount: 0,
          checkedVideoCount: videoIds.length,
          capped,
          gapSuspected: true,
        };
      }
      const observations: OtwPlayYouTubeVideoObservation[] = [];
      for (let index = 0; index < videoIds.length; index += 50) {
        const batch = await this.youtube.readVideos(videoIds.slice(index, index + 50));
        observations.push(
          ...batch.filter((item) =>
            item.video === null || item.video.channelId === monitor.externalChannelId
          ),
        );
      }
      const discoveredCount = await this.repository.recordCandidates({
        monitorId: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        observations,
        now: this.clock(),
      });

      if (capped && pageToken) {
        const continued = await this.repository.saveContinuation({
          id: monitor.id,
          expectedVersion: monitor.version,
          monitorGeneration: monitor.generation,
          pageToken,
          baseVideoId,
          newestVideoId,
          now: this.clock(),
        });
        return {
          monitor: continued,
          discoveredCount,
          checkedVideoCount: observations.length,
          capped: true,
          gapSuspected: false,
          continuationSaved: true,
        };
      }

      const newestPublishedAt = observations.find(
        (item) => item.videoId === newestVideoId,
      )?.video?.publishedAt ?? monitor.lastSeenPublishedAt;
      const completed = await this.repository.complete({
        id: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        lastSeenVideoId: newestVideoId,
        lastSeenPublishedAt: newestPublishedAt,
        now: this.clock(),
      });
      return {
        monitor: completed,
        discoveredCount,
        checkedVideoCount: observations.length,
        capped,
        gapSuspected: false,
      };
    } catch (error) {
      await this.repository.fail({
        id: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        errorCode: error instanceof OtwPlayYouTubeMetadataError
          ? `youtube_${error.code}`
          : "reconciliation_failed",
        now: this.clock(),
      });
      throw error;
    }
  }

  async runDue(limit = 10) {
    const ids = await this.repository.listDueIds(this.clock(), limit);
    const results: Array<{
      id: string;
      ok: boolean;
      partial?: boolean;
      discoveredCount: number;
      errorCode?: string;
      retryAt?: number;
    }> = [];
    for (const id of ids) {
      try {
        const result = await this.reconcile(id);
        results.push({
          id,
          ok: true,
          partial: result.continuationSaved === true,
          discoveredCount: result.discoveredCount,
        });
      } catch (error) {
        const metadataError = error instanceof OtwPlayYouTubeMetadataError ? error : null;
        results.push({
          id,
          ok: false,
          discoveredCount: 0,
          errorCode: metadataError ? `youtube_${metadataError.code}` : "reconciliation_failed",
          retryAt: this.clock() + (metadataError?.retryAfterMs ?? 15 * 60_000),
        });
      }
    }
    return results;
  }

  async backfill(id: string, count: number): Promise<OtwPlayChannelMonitorReconcileDto> {
    if (!Number.isSafeInteger(count) || count < 1 || count > 20) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Backfill count must be between 1 and 20",
      );
    }
    return this.reconcileSupplemental(id, count, true);
  }

  async reconcileRecent(id: string): Promise<OtwPlayChannelMonitorReconcileDto> {
    return this.reconcileSupplemental(id, 50, false);
  }

  private async reconcileSupplemental(
    id: string,
    count: number,
    includeBeforeWatermark: boolean,
  ): Promise<OtwPlayChannelMonitorReconcileDto> {
    const monitor = await this.repository.claim(id, this.clock());
    if (!monitor) {
      throw new IngestionRepositoryError(
        "unavailable",
        "The channel monitor is paused or already being checked",
      );
    }
    try {
      const page = await this.youtube.readPlaylistPage(monitor.uploadsPlaylistId, null);
      const recentItems = page.items.slice(0, count);
      const watermarkIndex = monitor.lastSeenVideoId === null
        ? -1
        : recentItems.findIndex((item) => item.videoId === monitor.lastSeenVideoId);
      const selected = includeBeforeWatermark || monitor.lastSeenVideoId === null
        ? recentItems
        : watermarkIndex >= 0
          ? recentItems.slice(0, watermarkIndex)
          : [];
      const ids = [...new Set(selected.map((item) => item.videoId))];
      const observations = await this.youtube.readVideos(ids);
      const authoritative = observations.filter((item) =>
        item.video === null || item.video.channelId === monitor.externalChannelId
      );
      const discoveredCount = await this.repository.recordCandidates({
        monitorId: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        observations: authoritative,
        now: this.clock(),
      });
      const completed = await this.repository.completeSupplemental({
        id: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        now: this.clock(),
      });
      return {
        monitor: completed,
        discoveredCount,
        checkedVideoCount: authoritative.length,
        capped: page.nextPageToken !== null && page.items.length >= count,
        gapSuspected: false,
      };
    } catch (error) {
      await this.repository.fail({
        id: monitor.id,
        expectedVersion: monitor.version,
        monitorGeneration: monitor.generation,
        errorCode: error instanceof OtwPlayYouTubeMetadataError
          ? `youtube_${error.code}`
          : "supplemental_reconciliation_failed",
        now: this.clock(),
      });
      throw error;
    }
  }

  async runRecentDue(limit = 10) {
    const ids = await this.repository.listRecentDueIds(this.clock(), limit);
    const results: Array<{ id: string; ok: boolean; discoveredCount: number }> = [];
    for (const id of ids) {
      try {
        const result = await this.reconcileRecent(id);
        results.push({ id, ok: true, discoveredCount: result.discoveredCount });
      } catch {
        results.push({ id, ok: false, discoveredCount: 0 });
      }
    }
    return results;
  }
}
