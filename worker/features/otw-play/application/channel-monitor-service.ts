import type {
  OtwPlayChannelMonitorReconcileDto,
  OtwPlayChannelMonitorStatus,
} from "@contracts/otw-play";
import type { ChannelMonitorRepository } from "./ports/channel-monitor-repository";
import {
  OtwPlayYouTubeMetadataError,
  type OtwPlayYouTubeIngestionReader,
  type OtwPlayYouTubeVideoObservation,
} from "./ports/youtube-metadata";
import { IngestionRepositoryError } from "./ports/ingestion-repository";

const MAX_RECONCILIATION_VIDEOS = 250;

export class ChannelMonitorService {
  private readonly repository: ChannelMonitorRepository;
  private readonly youtube: OtwPlayYouTubeIngestionReader;
  private readonly createId: () => string;
  private readonly clock: () => number;

  constructor(
    repository: ChannelMonitorRepository,
    youtube: OtwPlayYouTubeIngestionReader,
    createId: () => string = () => crypto.randomUUID(),
    clock: () => number = Date.now,
  ) {
    this.repository = repository;
    this.youtube = youtube;
    this.createId = createId;
    this.clock = clock;
  }

  list() {
    return this.repository.list();
  }

  listCandidates(id: string, limit = 50) {
    return this.repository.listCandidates(id, Math.max(1, Math.min(100, limit)));
  }

  async create(externalChannelId: string, actorUserId: string) {
    const existing = await this.repository.findByExternalChannel(externalChannelId);
    if (existing) return existing;
    const channel = await this.repository.findEligibleChannel(externalChannelId);
    if (!channel) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Only active, approved YouTube channels can be monitored",
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
      channel,
      uploadsPlaylistId: uploads.uploadsPlaylistId,
      lastSeenVideoId: page.items[0]?.videoId ?? null,
      actorUserId,
      now: this.clock(),
    });
  }

  updateStatus(
    id: string,
    expectedVersion: number,
    status: OtwPlayChannelMonitorStatus,
  ) {
    return this.repository.updateStatus({
      id,
      expectedVersion,
      status,
      now: this.clock(),
    });
  }

  async updateTarget(
    id: string,
    expectedVersion: number,
    externalChannelId: string,
  ) {
    const current = await this.repository.get(id);
    if (current.version !== expectedVersion) {
      throw new IngestionRepositoryError(
        "validation_failed",
        "Channel monitor changed during review",
      );
    }
    if (current.externalChannelId === externalChannelId) return current;
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
        "Only active, approved YouTube channels can be monitored",
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
      now: this.clock(),
    });
  }

  remove(id: string, expectedVersion: number) {
    return this.repository.remove({ id, expectedVersion });
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
      let pageToken: string | null = null;
      let foundWatermark = false;
      let hasMore = false;
      let newestVideoId: string | null = monitor.lastSeenVideoId;
      let firstPage = true;

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
          if (monitor.lastSeenVideoId && item.videoId === monitor.lastSeenVideoId) {
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
        observations,
        now: this.clock(),
      });
      const newestPublishedAt = observations.find(
        (item) => item.videoId === newestVideoId,
      )?.video?.publishedAt ?? monitor.lastSeenPublishedAt;
      const completed = await this.repository.complete({
        id: monitor.id,
        lastSeenVideoId: newestVideoId,
        lastSeenPublishedAt: newestPublishedAt,
        now: this.clock(),
      });
      return {
        monitor: completed,
        discoveredCount,
        checkedVideoCount: observations.length,
        capped: !foundWatermark && videoIds.length >= MAX_RECONCILIATION_VIDEOS && hasMore,
      };
    } catch (error) {
      await this.repository.fail({
        id: monitor.id,
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
    const results: Array<{ id: string; ok: boolean; discoveredCount: number }> = [];
    for (const id of ids) {
      try {
        const result = await this.reconcile(id);
        results.push({ id, ok: true, discoveredCount: result.discoveredCount });
      } catch {
        results.push({ id, ok: false, discoveredCount: 0 });
      }
    }
    return results;
  }
}
