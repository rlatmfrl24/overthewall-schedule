export {
  assessExactSourceDuplicate,
  assessSoftDuplicate,
  createPerformanceDedupeKeyMaterial,
  createSongDedupeKeyMaterial,
  createVideoBackedSongDedupeKeyMaterial,
} from "./domain/duplicate-policy";
export type {
  ExactDuplicateAssessment,
  ExactDuplicateEvidence,
  PerformanceDedupeKeyInput,
  SoftDuplicateAssessment,
  SoftDuplicateEvidence,
  SoftDuplicateSignals,
  SongDedupeKeyInput,
  SourceSegmentIdentity,
  VideoBackedSongDedupeKeyInput,
} from "./domain/duplicate-policy";
export { normalizeOtwPlaySearchText } from "./domain/search-normalization";
export { selectPreferredOfficialSource } from "./domain/source-selection";
export type { OfficialSourceCandidate } from "./domain/source-selection";
export {
  canTransitionProposalStatus,
  canTransitionPublicationStatus,
  isOtwPlayProposalStatus,
  isOtwPlayPublicationStatus,
  isOtwPlayQualityStatus,
  isOtwPlaySourceAvailabilityStatus,
} from "./domain/status-transition";
export {
  extractYouTubeVideoId,
  YOUTUBE_VIDEO_ID_PATTERN,
} from "./domain/youtube-video-id";
export {
  canonicalizePublicCatalogQuery,
  isStructuredFirstPagePublicCatalogCacheQuery,
  parsePublicCatalogQuery,
  PublicCatalogQueryError,
} from "./domain/public-catalog-query";
export type { PublicCatalogQuery } from "./domain/public-catalog-query";
export {
  decodePublicCatalogCursor,
  encodePublicCatalogCursor,
  PublicCatalogCursorError,
} from "./domain/public-catalog-cursor";
export {
  decodePublicCatalogGroupKey,
  encodePublicCatalogGroupKey,
  PublicCatalogGroupKeyError,
} from "./domain/public-group-key";
export { selectPublicPlaybackSource } from "./domain/public-source-selection";
export { PublicCatalogService } from "./application/public-catalog-service";
export type {
  PublicCatalogSeoReader,
  PublicCatalogSeoState,
  PublicCatalogSongSeoProjection,
} from "./application/ports/public-catalog-seo-reader";
export {
  CloudflarePublicCatalogCache,
  createPublicCatalogEtag,
} from "./infrastructure/cloudflare-public-catalog-cache";
export { D1PublicCatalogReader } from "./infrastructure/d1-public-catalog-reader";
export { createPublicCatalogHandler } from "./http/public-catalog-handler";
export { AdminCatalogService } from "./application/admin-catalog-service";
export { SourceHealthService } from "./application/source-health-service";
export { D1AdminCatalogRepository } from "./infrastructure/d1-admin-catalog-repository";
export { D1SourceHealthRepository } from "./infrastructure/d1-source-health-repository";
export { DrizzleAdminCatalogAudit } from "./infrastructure/admin-catalog-audit";
export { YouTubeOtwPlayMetadataReader } from "./infrastructure/youtube-metadata-reader";
export { createAdminCatalogHandler } from "./http/admin-catalog-handler";
export { MemberSubmissionService } from "./application/member-submission-service";
export { D1MemberSubmissionRepository } from "./infrastructure/d1-member-submission-repository";
export { createMemberSubmissionHandler } from "./http/member-submission-handler";
export {
  IngestionProcessingError,
  IngestionService,
} from "./application/ingestion-service";
export type { OtwPlayIngestionQueueMessage } from "./application/ports/ingestion-repository";
export { D1IngestionRepository } from "./infrastructure/d1-ingestion-repository";
export {
  createIngestionHandler,
  createIngestionQueueHandler,
} from "./http/ingestion-handler";
export type {
  PlayTelemetryEvent,
  PlayTelemetryEventName,
  PlayTelemetryWriter,
} from "./application/ports/play-telemetry";
export {
  createPlayTelemetryEvent,
  NoopPlayTelemetryWriter,
} from "./application/ports/play-telemetry";
export {
  CloudflarePlayTelemetryWriter,
  shouldWritePlayCustomLog,
  toPlayAnalyticsDataPoint,
} from "./infrastructure/cloudflare-play-telemetry";
export {
  CloudflarePlayObservabilityReader,
  OTW_PLAY_OBSERVABILITY_SQL,
} from "./infrastructure/cloudflare-play-observability-reader";
export { createPlayObservabilityHandler } from "./http/observability-handler";
export { withPlayOperationsTelemetry } from "./http/play-telemetry-handler";
export { ReleaseService } from "./application/release-service";
export { D1ReleaseRepository } from "./infrastructure/d1-release-repository";
export { createReleaseHandler } from "./http/release-handler";
