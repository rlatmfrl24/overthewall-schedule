export {
  assessExactSourceDuplicate,
  assessSoftDuplicate,
  createPerformanceDedupeKeyMaterial,
  createSongDedupeKeyMaterial,
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
export {
  CloudflarePublicCatalogCache,
  createPublicCatalogEtag,
} from "./infrastructure/cloudflare-public-catalog-cache";
export { D1PublicCatalogReader } from "./infrastructure/d1-public-catalog-reader";
export { createPublicCatalogHandler } from "./http/public-catalog-handler";
