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
