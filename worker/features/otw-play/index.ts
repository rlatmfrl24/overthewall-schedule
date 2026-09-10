export { createPerformanceDedupeKeyMaterial, createSongDedupeKeyMaterial, createVideoBackedSongDedupeKeyMaterial } from "./domain/duplicate-policy";
export type { PerformanceDedupeKeyInput, SongDedupeKeyInput, VideoBackedSongDedupeKeyInput } from "./domain/duplicate-policy";
export { normalizeOtwPlaySearchText } from "./domain/search-normalization";



export { AdminCatalogService } from "./application/admin-catalog-service";
export { ChannelMonitorService } from "./application/channel-monitor-service";
export {
  IngestionProcessingError,
  IngestionService
} from "./application/ingestion-service";
export { MemberSubmissionService } from "./application/member-submission-service";
export type { OtwPlayIngestionQueueMessage } from "./application/ports/ingestion-repository";
export {
  NoopPlayTelemetryWriter, createPlayTelemetryEvent
} from "./application/ports/play-telemetry";
export type {
  PlayTelemetryEvent,
  PlayTelemetryEventName,
  PlayTelemetryWriter
} from "./application/ports/play-telemetry";
export type {
  PublicCatalogSeoReader,
  PublicCatalogSeoState,
  PublicCatalogSongSeoProjection
} from "./application/ports/public-catalog-seo-reader";
export { PublicCatalogService } from "./application/public-catalog-service";
export { ReleaseService } from "./application/release-service";
export { SourceHealthService } from "./application/source-health-service";
export {
  PublicCatalogCursorError, decodePublicCatalogCursor,
  encodePublicCatalogCursor
} from "./domain/public-catalog-cursor";
export {
  PublicCatalogQueryError, canonicalizePublicCatalogQuery,
  isStructuredFirstPagePublicCatalogCacheQuery,
  parsePublicCatalogQuery
} from "./domain/public-catalog-query";
export type { PublicCatalogQuery } from "./domain/public-catalog-query";
export {
  PublicCatalogGroupKeyError, decodePublicCatalogGroupKey,
  encodePublicCatalogGroupKey
} from "./domain/public-group-key";
export { selectPublicPlaybackSource } from "./domain/public-source-selection";
export {
  YOUTUBE_VIDEO_ID_PATTERN, extractYouTubeVideoId
} from "./domain/youtube-video-id";
export { createAdminCatalogHandler } from "./http/admin-catalog-handler";
export { createChannelMonitorHandler } from "./http/channel-monitor-handler";
export { createIngestionHandler } from "./http/ingestion-handler";
export { createMemberSubmissionHandler } from "./http/member-submission-handler";
export { createPlayObservabilityHandler } from "./http/observability-handler";
export { withPlayOperationsTelemetry } from "./http/play-telemetry-handler";
export { createPublicCatalogHandler } from "./http/public-catalog-handler";
export { createReleaseHandler } from "./http/release-handler";
export {
  createWebsubAdminHandler,
  createWebsubCallbackHandler
} from "./http/websub-handler";
export { DrizzleAdminCatalogAudit } from "./infrastructure/admin-catalog-audit";
export {
  CloudflarePlayObservabilityReader,
  OTW_PLAY_OBSERVABILITY_SQL
} from "./infrastructure/cloudflare-play-observability-reader";
export {
  CloudflarePlayTelemetryWriter,
  shouldWritePlayCustomLog,
  toPlayAnalyticsDataPoint
} from "./infrastructure/cloudflare-play-telemetry";
export {
  CloudflarePublicCatalogCache,
  createPublicCatalogEtag
} from "./infrastructure/cloudflare-public-catalog-cache";
export { D1AdminCatalogRepository } from "./infrastructure/d1-admin-catalog-repository";
export { D1ChannelMonitorRepository } from "./infrastructure/d1-channel-monitor-repository";
export { D1IngestionRepository } from "./infrastructure/d1-ingestion-repository";
export { D1MemberSubmissionRepository } from "./infrastructure/d1-member-submission-repository";
export { D1PublicCatalogReader } from "./infrastructure/d1-public-catalog-reader";
export { D1PlaylistRepository } from "./infrastructure/d1-playlist-repository";
export { PlaylistService } from "./application/playlist-service";
export { createPlaylistHandler } from "./http/playlist-handler";
export { D1ReleaseRepository } from "./infrastructure/d1-release-repository";
export { D1SourceHealthRepository } from "./infrastructure/d1-source-health-repository";
export { YouTubeOtwPlayMetadataReader } from "./infrastructure/youtube-metadata-reader";

export { readAdminReviewSummary } from "./infrastructure/admin-review-summary";
export { readOtwPlayAutomationPaused } from "./infrastructure/play-automation-settings";
