export const OTW_PLAY_PROPOSAL_STATUSES = [
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type OtwPlayProposalStatus =
  (typeof OTW_PLAY_PROPOSAL_STATUSES)[number];

export const OTW_PLAY_CATALOG_EVENT_ACTOR_KINDS = [
  "member",
  "admin",
  "system",
] as const;

export type OtwPlayCatalogEventActorKind =
  (typeof OTW_PLAY_CATALOG_EVENT_ACTOR_KINDS)[number];

export const OTW_PLAY_SEARCH_TERM_KINDS = [
  "title",
  "title_alias",
  "original_artist",
  "participant",
] as const;

export type OtwPlaySearchTermKind =
  (typeof OTW_PLAY_SEARCH_TERM_KINDS)[number];

export const OTW_PLAY_PUBLICATION_STATUSES = [
  "draft",
  "published",
  "withdrawn",
] as const;

export type OtwPlayPublicationStatus =
  (typeof OTW_PLAY_PUBLICATION_STATUSES)[number];

export const OTW_PLAY_QUALITY_STATUSES = ["ok", "needs_update"] as const;

export type OtwPlayQualityStatus =
  (typeof OTW_PLAY_QUALITY_STATUSES)[number];

export const OTW_PLAY_SOURCE_AVAILABILITY_STATUSES = [
  "unknown",
  "playable",
  "private",
  "embed_disabled",
  "deleted",
  "region_blocked",
  "unavailable",
] as const;

export type OtwPlaySourceAvailabilityStatus =
  (typeof OTW_PLAY_SOURCE_AVAILABILITY_STATUSES)[number];

export const OTW_PLAY_PROVIDERS = ["youtube"] as const;

export type OtwPlayProvider = (typeof OTW_PLAY_PROVIDERS)[number];

export const OTW_PLAY_INGESTION_JOB_STATUSES = [
  "queued",
  "collecting",
  "completed",
  "partial",
  "failed",
] as const;
export type OtwPlayIngestionJobStatus =
  (typeof OTW_PLAY_INGESTION_JOB_STATUSES)[number];

export const OTW_PLAY_INGESTION_CANDIDATE_STATUSES = [
  "discovered",
  "needs_input",
  "ready",
  "converted",
  "ignored",
  "blocked",
] as const;
export type OtwPlayIngestionCandidateStatus =
  (typeof OTW_PLAY_INGESTION_CANDIDATE_STATUSES)[number];

export const OTW_PLAY_INGESTION_CLASSIFICATIONS = [
  "pending_metadata",
  "eligible",
  "existing_catalog",
  "existing_proposal",
  "existing_candidate",
  "channel_review",
  "policy_blocked",
  "unavailable",
  "scope_review",
  "playlist_duplicate",
] as const;
export type OtwPlayIngestionClassification =
  (typeof OTW_PLAY_INGESTION_CLASSIFICATIONS)[number];

export const OTW_PLAY_INGESTION_CONVERSION_OUTCOMES = [
  "created",
  "duplicate",
  "stale",
  "validation_failed",
  "retryable_failed",
] as const;
export type OtwPlayIngestionConversionOutcome =
  (typeof OTW_PLAY_INGESTION_CONVERSION_OUTCOMES)[number];

export type OtwPlayPlaylistImportMode = "all_new" | "recent";

export interface OtwPlayPlaylistPreflightRequest {
  playlistUrl: string;
  mode: OtwPlayPlaylistImportMode;
  recentLimit?: number;
  rangeStart?: number;
  rangeLimit?: number;
}

export interface OtwPlayPlaylistPreflightDto {
  playlistId: string;
  canonicalUrl: string;
  title: string;
  ownerChannelId: string;
  ownerChannelTitle: string;
  itemCount: number;
  privacyStatus: "public" | "unlisted";
  rangeStartPosition: number;
  rangeEndExclusive: number;
  nextRangeStart: number | null;
  requestedItemCount: number;
  estimatedPageCount: number;
  estimatedVideoBatchCount: number;
  hardCap: 5000;
  requiresSplit: boolean;
  previousImport: {
    jobId: string;
    status: OtwPlayIngestionJobStatus;
    lastSyncedAt: number;
  } | null;
}

export interface OtwPlayCreatePlaylistImportRequest
  extends OtwPlayPlaylistPreflightRequest {
  idempotencyKey: string;
}

export interface OtwPlayIngestionJobCountsDto {
  discovered: number;
  metadataChecked: number;
  eligible: number;
  existingCatalog: number;
  existingProposal: number;
  existingCandidate: number;
  channelReview: number;
  unavailable: number;
  policyBlocked: number;
  scopeReview: number;
  playlistDuplicate: number;
  retryPending: number;
  permanentError: number;
}

export interface OtwPlayIngestionJobDto {
  id: string;
  playlistId: string;
  playlistTitle: string;
  playlistOwnerChannelId: string;
  playlistOwnerChannelTitle: string;
  mode: OtwPlayPlaylistImportMode;
  rangeStartPosition: number;
  rangeEndExclusive: number;
  requestedItemCount: number;
  status: OtwPlayIngestionJobStatus;
  counts: OtwPlayIngestionJobCountsDto;
  lastErrorCode: string | null;
  nextRetryAt: number | null;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  updatedAt: number;
}

export interface OtwPlayIngestionCandidateItemDto {
  originId: string;
  candidateId: string;
  candidateVersion: number;
  playlistPosition: number;
  playlistItemId: string;
  videoId: string;
  status: OtwPlayIngestionCandidateStatus;
  classification: OtwPlayIngestionClassification;
  exclusionReason: string | null;
  title: string | null;
  channelId: string | null;
  channelTitle: string | null;
  catalogChannelId: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: number | null;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
  madeForKids: boolean | null;
  metadataCheckedAt: number | null;
  reviewInput: OtwPlayIngestionReviewInput | null;
  lastConversionOutcome: OtwPlayIngestionConversionOutcome | null;
  lastConversionErrorCode: string | null;
  lastConversionAttemptAt: number | null;
  linkedPerformanceId: string | null;
}

export interface OtwPlayIngestionReviewCandidateDto {
  id: string;
  version: number;
  videoId: string;
  status: OtwPlayIngestionCandidateStatus;
  classification: OtwPlayIngestionClassification;
  catalogChannelId: string | null;
  reviewInput: OtwPlayIngestionReviewInput | null;
  linkedPerformanceId: string | null;
}

export interface OtwPlayIngestionCandidatePageDto {
  items: OtwPlayIngestionCandidateItemDto[];
  nextCursor: string | null;
}

export interface OtwPlayIngestionItemFilters {
  classification?: OtwPlayIngestionClassification;
  status?: OtwPlayIngestionCandidateStatus;
}

export interface OtwPlayIngestionReviewInput {
  song: OtwPlayAdminCatalogSongDecision;
  participants: OtwPlayAdminCatalogParticipantInput[];
  relationType: OtwPlayRelationType;
  releaseType: Extract<OtwPlayReleaseType, "official_mv" | "official_video">;
  participationType: OtwPlayParticipationType;
  internalNote?: string | null;
}

export type OtwPlayUpdateIngestionCandidateRequest =
  | {
      expectedVersion: number;
      expectedReviewInput?: OtwPlayIngestionReviewInput | null;
      expectedReviewStatus?: OtwPlayIngestionCandidateStatus;
      action: "save";
      input: OtwPlayIngestionReviewInput;
    }
  | { expectedVersion: number; action: "ignore" }
  | { expectedVersion: number; action: "refresh_metadata" };

export interface OtwPlayConvertIngestionCandidatesRequest {
  candidates: Array<{ id: string; expectedVersion: number }>;
}

export interface OtwPlayIgnoreIngestionCandidatesRequest {
  candidates: Array<{ id: string; expectedVersion: number }>;
}

export const OTW_PLAY_INGESTION_IGNORE_OUTCOMES = [
  "ignored",
  "stale",
  "failed",
] as const;

export type OtwPlayIngestionIgnoreOutcome =
  (typeof OTW_PLAY_INGESTION_IGNORE_OUTCOMES)[number];

export interface OtwPlayIngestionIgnoreResultDto {
  candidateId: string;
  outcome: OtwPlayIngestionIgnoreOutcome;
  errorCode: string | null;
}

export interface OtwPlayIgnoreIngestionCandidatesResponse {
  results: OtwPlayIngestionIgnoreResultDto[];
}

export interface OtwPlayIngestionConversionResultDto {
  candidateId: string;
  outcome: OtwPlayIngestionConversionOutcome;
  performanceId: string | null;
  errorCode: string | null;
}

export interface OtwPlayConvertIngestionCandidatesResponse {
  results: OtwPlayIngestionConversionResultDto[];
}

export interface OtwPlayRetryIngestionJobResponse {
  job: OtwPlayIngestionJobDto;
  enqueued: number;
}

export const OTW_PLAY_CHANNEL_VERIFICATION_STATUSES = [
  "pending",
  "approved",
  "revoked",
] as const;

export type OtwPlayChannelVerificationStatus =
  (typeof OTW_PLAY_CHANNEL_VERIFICATION_STATUSES)[number];

export const OTW_PLAY_DATE_PRECISIONS = [
  "year",
  "month",
  "day",
  "unknown",
] as const;

export type OtwPlayDatePrecision =
  (typeof OTW_PLAY_DATE_PRECISIONS)[number];

export const OTW_PLAY_RELATION_TYPES = ["original", "cover"] as const;

export type OtwPlayRelationType =
  (typeof OTW_PLAY_RELATION_TYPES)[number];

export const OTW_PLAY_RELEASE_TYPES = [
  "official_mv",
  "official_video",
  "broadcast",
  "live",
  "shorts",
] as const;

export type OtwPlayReleaseType =
  (typeof OTW_PLAY_RELEASE_TYPES)[number];

export const OTW_PLAY_PARTICIPATION_TYPES = [
  "solo",
  "duet",
  "unit",
  "group",
  "external_collab",
] as const;

export type OtwPlayParticipationType =
  (typeof OTW_PLAY_PARTICIPATION_TYPES)[number];

export const OTW_PLAY_CHANNEL_ROLES = [
  "otw_official",
  "unit_official",
  "member_music",
  "member_main",
  "project_official",
  "approved_kirinuki",
  "other",
] as const;

export type OtwPlayChannelRole =
  (typeof OTW_PLAY_CHANNEL_ROLES)[number];

export type OtwPlayPublicChannelRole = Extract<
  OtwPlayChannelRole,
  | "otw_official"
  | "unit_official"
  | "member_music"
  | "member_main"
  | "project_official"
>;

export const OTW_PLAY_SOURCE_ROLES = [
  "official",
  "kirinuki",
  "broadcast_original",
  "alternate",
] as const;

export type OtwPlaySourceRole =
  (typeof OTW_PLAY_SOURCE_ROLES)[number];

export const OTW_PLAY_SOURCE_RELATION_TYPES = [
  "excerpt_of",
  "alternate_of",
] as const;

export type OtwPlaySourceRelationType =
  (typeof OTW_PLAY_SOURCE_RELATION_TYPES)[number];

export const OTW_PLAY_ENTITY_KINDS = [
  "person",
  "group",
  "organization",
] as const;

export type OtwPlayEntityKind =
  (typeof OTW_PLAY_ENTITY_KINDS)[number];

export const OTW_PLAY_PARTICIPANT_ROLES = [
  "vocal",
  "featured_vocal",
  "chorus",
  "other",
] as const;

export type OtwPlayParticipantRole =
  (typeof OTW_PLAY_PARTICIPANT_ROLES)[number];

export const OTW_PLAY_PUBLIC_PARTICIPANT_KINDS = [
  "current_member",
  "external",
  "group",
] as const;

export type OtwPlayPublicParticipantKind =
  (typeof OTW_PLAY_PUBLIC_PARTICIPANT_KINDS)[number];

export interface OtwPlayPublicError {
  code: OtwPlayPublicErrorCode;
  message: string;
  fields?: Record<string, string>;
  requestId: string;
}

export interface OtwPlayPublicErrorResponse {
  error: OtwPlayPublicError;
}

export const OTW_PLAY_PUBLIC_ERROR_CODES = [
  "PLAY_INVALID_QUERY",
  "PLAY_INVALID_CURSOR",
  "PLAY_CURSOR_STALE",
  "PLAY_PUBLIC_READ_DISABLED",
  "PLAY_NOT_FOUND",
  "PLAY_CATALOG_UNAVAILABLE",
  "PLAY_INTERNAL_ERROR",
] as const;

export const OTW_PLAY_ADMIN_PREVIEW_HEADER = "X-OTW-Play-Admin-Preview";

export type OtwPlayPublicErrorCode =
  (typeof OTW_PLAY_PUBLIC_ERROR_CODES)[number];

export const OTW_PLAY_MEMBER_MODES = ["any", "all"] as const;
export type OtwPlayMemberMode = (typeof OTW_PLAY_MEMBER_MODES)[number];

export const OTW_PLAY_CATALOG_SORTS = [
  "recent",
  "title",
  "participant",
] as const;
export type OtwPlayCatalogSort = (typeof OTW_PLAY_CATALOG_SORTS)[number];

export interface OtwPlayPublicCatalogQuery {
  q?: string;
  member?: number[];
  memberMode?: OtwPlayMemberMode;
  group?: string;
  participant?: string;
  participantRole?: OtwPlayParticipantRole;
  relation?: OtwPlayRelationType;
  participation?: OtwPlayParticipationType;
  originalArtist?: string;
  publishedFrom?: string;
  publishedTo?: string;
  sort?: OtwPlayCatalogSort;
  cursor?: string;
  limit?: number;
}

export interface OtwPlayPublicEnvelope<T> {
  data: T;
  nextCursor: string | null;
  catalogRevision: number;
  generatedAt: string;
}

export interface OtwPlayPublicConfigDto {
  publicReadEnabled: boolean;
  navigationVisible: boolean;
}

export interface OtwPlayPublicCreditDto {
  entityId: string;
  slug: string;
  displayName: string;
  kind: OtwPlayEntityKind;
}

interface OtwPlayPublicParticipantBaseDto {
  entityId: string;
  slug: string;
  displayName: string;
  role: OtwPlayParticipantRole;
  creditOrder: number;
}

export interface OtwPlayPublicCurrentMemberParticipantDto
  extends OtwPlayPublicParticipantBaseDto {
  kind: "current_member";
  uid: number;
  code: string;
  oshiMark: string | null;
  unitName: string | null;
}

export interface OtwPlayPublicExternalParticipantDto
  extends OtwPlayPublicParticipantBaseDto {
  kind: "external";
}

export interface OtwPlayPublicGroupParticipantDto
  extends OtwPlayPublicParticipantBaseDto {
  kind: "group";
  groupKey: string;
}

export type OtwPlayPublicParticipantDto =
  | OtwPlayPublicCurrentMemberParticipantDto
  | OtwPlayPublicExternalParticipantDto
  | OtwPlayPublicGroupParticipantDto;

export interface OtwPlayPublicChannelDto {
  id: string;
  displayName: string;
  role: OtwPlayPublicChannelRole;
}

export interface OtwPlayPublicSourceDto {
  sourceId: string;
  provider: OtwPlayProvider;
  externalId: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  providerPublishedAt: string | null;
  availability: OtwPlaySourceAvailabilityStatus;
  sourceRole: Extract<OtwPlaySourceRole, "official" | "alternate">;
  startSeconds: number;
  endSeconds: number | null;
  priority: number;
  isPrimary: boolean;
  playable: boolean;
  channel: OtwPlayPublicChannelDto;
}

export interface OtwPlayPublicPerformanceSummaryDto {
  id: string;
  relation: OtwPlayRelationType;
  releaseType: Extract<OtwPlayReleaseType, "official_mv" | "official_video">;
  participation: OtwPlayParticipationType;
  releasedAt: string | null;
  participants: OtwPlayPublicParticipantDto[];
  selectedSource: OtwPlayPublicSourceDto | null;
  sourceCount: number;
  playable: boolean;
  usingFallback: boolean;
}

export interface OtwPlayPublicPerformanceDetailDto
  extends OtwPlayPublicPerformanceSummaryDto {
  sources: OtwPlayPublicSourceDto[];
}

export interface OtwPlayPublicSongSummaryDto {
  id: string;
  slug: string;
  title: string;
  isOtwOriginal: boolean;
  originalReleaseDate: string | null;
  originalReleasePrecision: OtwPlayDatePrecision;
  originalArtists: OtwPlayPublicCreditDto[];
  tags: string[];
  representativePerformance: OtwPlayPublicPerformanceSummaryDto;
  performanceCount: number;
  playable: boolean;
}

export interface OtwPlayPublicCatalogDto {
  items: OtwPlayPublicSongSummaryDto[];
}

export interface OtwPlayPublicSongDetailDto
  extends Omit<OtwPlayPublicSongSummaryDto, "representativePerformance"> {
  performances: OtwPlayPublicPerformanceDetailDto[];
}

export interface OtwPlayPublicPerformanceResponseDto {
  song: {
    id: string;
    slug: string;
    title: string;
    isOtwOriginal: boolean;
    tags: string[];
  };
  performance: OtwPlayPublicPerformanceDetailDto;
}

export interface OtwPlayPublicMemberFacetDto {
  memberUid: number;
  code: string;
  displayName: string;
  oshiMark: string | null;
  unitName: string | null;
}

export interface OtwPlayPublicGroupFacetDto {
  key: string;
  kind: "entity" | "unit";
  displayName: string;
}

export interface OtwPlayPublicOriginalArtistFacetDto {
  slug: string;
  displayName: string;
}

export interface OtwPlayPublicFacetsDto {
  members: OtwPlayPublicMemberFacetDto[];
  groups: OtwPlayPublicGroupFacetDto[];
  originalArtists: OtwPlayPublicOriginalArtistFacetDto[];
}

export const OTW_PLAY_SUBMISSION_ERROR_CODES = [
  "PLAY_SUBMISSION_INVALID_REQUEST",
  "PLAY_SUBMISSION_AUTH_REQUIRED",
  "PLAY_SUBMISSION_NOT_FOUND",
  "PLAY_SUBMISSION_DUPLICATE",
  "PLAY_SUBMISSION_STALE_WRITE",
  "PLAY_SUBMISSION_IDEMPOTENCY_CONFLICT",
  "PLAY_SUBMISSION_RATE_LIMITED",
  "PLAY_SUBMISSION_UNAVAILABLE",
] as const;

export type OtwPlaySubmissionErrorCode =
  (typeof OTW_PLAY_SUBMISSION_ERROR_CODES)[number];

export interface OtwPlaySubmissionErrorResponse {
  error: {
    code: OtwPlaySubmissionErrorCode;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
}

export type OtwPlaySubmissionSubjectInput =
  | { kind: "member"; memberUid: number }
  | { kind: "external"; displayName: string };

export type OtwPlaySubmissionParticipantInput =
  | {
      kind: "member";
      memberUid: number;
      participantRole?: OtwPlayParticipantRole;
    }
  | {
      kind: "external";
      displayName: string;
      participantRole?: OtwPlayParticipantRole;
    };

export interface OtwPlaySubmissionPreflightRequest {
  youtubeUrl: string;
  title?: string;
}

export interface OtwPlaySubmissionSongCandidateDto {
  id: string;
  title: string;
  originalArtists: string[];
}

export interface OtwPlaySubmissionPreflightDto {
  videoId: string;
  canonicalUrl: string;
  thumbnailUrl: string;
  duplicate: "catalog" | "pending" | null;
  songCandidates: OtwPlaySubmissionSongCandidateDto[];
}

export interface OtwPlayCreateSubmissionRequest {
  clientRequestId: string;
  youtubeUrl: string;
  title: string;
  suggestedSongId?: string | null;
  originalArtists: OtwPlaySubmissionSubjectInput[];
  participants: OtwPlaySubmissionParticipantInput[];
  note?: string | null;
}

export interface OtwPlayUpdateSubmissionRequest
  extends Omit<OtwPlayCreateSubmissionRequest, "clientRequestId"> {
  expectedVersion: number;
}

export interface OtwPlayWithdrawSubmissionRequest {
  expectedVersion: number;
}

export type OtwPlayMemberSubmissionStatus = Extract<
  OtwPlayProposalStatus,
  "pending_review" | "approved" | "rejected" | "withdrawn"
>;

export interface OtwPlayMemberSubmissionDto {
  id: string;
  clientRequestId: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  title: string;
  suggestedSongId: string | null;
  note: string | null;
  status: OtwPlayMemberSubmissionStatus;
  version: number;
  editable: boolean;
  withdrawable: boolean;
  createdAt: number;
  updatedAt: number;
  originalArtists: Array<{
    creditOrder: number;
    memberUid: number | null;
    displayName: string;
  }>;
  participants: Array<{
    creditOrder: number;
    memberUid: number | null;
    displayName: string;
    participantRole: OtwPlayParticipantRole;
  }>;
  approvedSong: {
    id: string;
    slug: string;
    title: string;
    publicLinkAvailable: boolean;
  } | null;
}

export interface OtwPlayMemberSubmissionPageDto {
  items: OtwPlayMemberSubmissionDto[];
  nextCursor: string | null;
}

export interface OtwPlayCreateSubmissionResponse {
  data: OtwPlayMemberSubmissionDto;
  idempotentReplay: boolean;
}

export const OTW_PLAY_ADMIN_ERROR_CODES = [
  "PLAY_ADMIN_INVALID_REQUEST",
  "PLAY_ADMIN_NOT_FOUND",
  "PLAY_ADMIN_STALE_WRITE",
  "PLAY_ADMIN_DUPLICATE_SOURCE",
  "PLAY_ADMIN_VALIDATION_FAILED",
  "PLAY_ADMIN_POLICY_UNRESOLVED",
  "PLAY_ADMIN_EXTERNAL_SERVICE_UNAVAILABLE",
  "PLAY_ADMIN_INTERNAL_ERROR",
] as const;

export type OtwPlayAdminErrorCode = (typeof OTW_PLAY_ADMIN_ERROR_CODES)[number];

export interface OtwPlayAdminErrorResponse {
  error: {
    code: OtwPlayAdminErrorCode;
    message: string;
    fields?: Record<string, string>;
    requestId: string;
  };
}

export interface OtwPlayAdminEntityDto {
  id: string;
  memberUid: number | null;
  entityKind: OtwPlayEntityKind;
  displayName: string;
  normalizedName: string;
  slug: string;
  archivedAt: number | null;
  version: number;
}

export interface OtwPlayAdminSongDto {
  id: string;
  slug: string;
  title: string;
  normalizedTitle: string;
  isOtwOriginal: boolean;
  originalReleaseDate: string | null;
  originalReleasePrecision: OtwPlayDatePrecision;
  archivedAt: number | null;
  version: number;
  tags: string[];
  aliases: Array<{
    alias: string;
    normalizedAlias: string;
    locale: string | null;
    aliasKind: string | null;
  }>;
  originalArtists: Array<{
    entityId: string;
    displayName: string;
    creditOrder: number;
    isPrimary: boolean;
  }>;
}

export interface OtwPlayAdminChannelDto {
  id: string;
  provider: OtwPlayProvider;
  externalChannelId: string;
  displayName: string;
  channelRole: OtwPlayChannelRole;
  verificationStatus: OtwPlayChannelVerificationStatus;
  active: boolean;
  entityIds: string[];
  version: number;
}

export interface OtwPlayAdminSourceDto {
  id: string;
  provider: OtwPlayProvider;
  externalId: string;
  channelId: string;
  title: string | null;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  providerPublishedAt: number | null;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
  lastCheckedAt: number | null;
  nextCheckAt: number | null;
  version: number;
}

export const OTW_PLAY_SOURCE_HEALTH_RETRY_CODES = [
  "timeout",
  "network",
  "upstream_5xx",
  "invalid_response",
  "rate_limited",
  "quota_exceeded",
] as const;

export type OtwPlaySourceHealthRetryCode =
  (typeof OTW_PLAY_SOURCE_HEALTH_RETRY_CODES)[number];

export type OtwPlaySourceHealthEventType =
  | "source.unavailable"
  | "source.recovered"
  | "source.availability_changed"
  | "source.checked"
  | "source.retry_scheduled";

export interface OtwPlayAdminSourceHealthItemDto {
  source: OtwPlayAdminSourceDto;
  channel: {
    id: string;
    externalChannelId: string;
    displayName: string;
  };
  linkedPerformanceCount: number;
  links: Array<{
    songId: string;
    songTitle: string;
    performanceId: string;
    publicationStatus: OtwPlayPublicationStatus;
  }>;
  lastEvent: {
    type: OtwPlaySourceHealthEventType;
    at: number;
    retryCode: OtwPlaySourceHealthRetryCode | null;
  } | null;
  recoveredAt: number | null;
}

export interface OtwPlayAdminSourceHealthDto {
  generatedAt: number;
  recentRecoveryWindowDays: 7;
  listLimit: 50;
  counts: {
    due: number;
    unplayable: number;
    recentlyRecovered: number;
  };
  due: OtwPlayAdminSourceHealthItemDto[];
  unplayable: OtwPlayAdminSourceHealthItemDto[];
  recentlyRecovered: OtwPlayAdminSourceHealthItemDto[];
}

export type OtwPlayAdminObservabilityStatus =
  | "available"
  | "unconfigured"
  | "unavailable";

export interface OtwPlayAdminObservabilitySummaryDto {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  cacheHit: number;
  cacheMiss: number;
  cacheBypass: number;
  p95DurationMs: number | null;
  d1RowsRead: number | null;
  d1RowsWritten: number | null;
}

export interface OtwPlayAdminObservabilityRouteDto
  extends OtwPlayAdminObservabilitySummaryDto {
  routeId: string;
}

export interface OtwPlayAdminObservabilityEventDto {
  event: string;
  count: number;
}

export interface OtwPlayAdminObservabilityDto {
  status: OtwPlayAdminObservabilityStatus;
  generatedAt: string;
  windowHours: 24;
  summary: OtwPlayAdminObservabilitySummaryDto;
  routes: OtwPlayAdminObservabilityRouteDto[];
  events: OtwPlayAdminObservabilityEventDto[];
  reasonCode?: "analytics_unconfigured" | "analytics_unavailable";
}

export interface OtwPlayAdminReleaseFlagsDto {
  publicReadEnabled: boolean;
  navigationVisible: boolean;
}

export interface OtwPlayAdminReleaseStateDto
  extends OtwPlayAdminReleaseFlagsDto {
  catalogRevision: number;
  readModelRevision: number | null;
  updatedAt: number;
  readyForPublicRead: boolean;
}

export const OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS = [
  "direct_routes_verified",
  "public_canary_verified",
  "rollback_reviewed",
] as const;

export type OtwPlayAdminReleaseConfirmation =
  (typeof OTW_PLAY_ADMIN_RELEASE_CONFIRMATIONS)[number];

export type OtwPlayAdminReleaseTransition =
  | "enable_public_read"
  | "enable_navigation"
  | "disable_navigation"
  | "rollback_all";

export interface OtwPlayAdminReleaseRequest {
  expected: OtwPlayAdminReleaseFlagsDto & { updatedAt: number };
  target: OtwPlayAdminReleaseFlagsDto;
  confirmation: OtwPlayAdminReleaseConfirmation;
}

export interface OtwPlayAdminReleaseAuditDto {
  id: string;
  transition: OtwPlayAdminReleaseTransition;
  previous: OtwPlayAdminReleaseFlagsDto;
  current: OtwPlayAdminReleaseFlagsDto;
  actor: { id: string; displayName: string | null };
  changedAt: number;
}

export interface OtwPlayAdminReleaseReadResponse {
  data: OtwPlayAdminReleaseStateDto;
  recentChanges: OtwPlayAdminReleaseAuditDto[];
}

export interface OtwPlayAdminReleaseCommandResponse {
  data: OtwPlayAdminReleaseStateDto;
  transition: OtwPlayAdminReleaseTransition;
  changedAt: number;
}

export type OtwPlayAdminSourceRecheckResponse =
  OtwPlayAdminCommandResponse<OtwPlayAdminSourceDto> & {
    check:
      | {
          status: "checked";
          previousAvailability: OtwPlaySourceAvailabilityStatus;
          currentAvailability: OtwPlaySourceAvailabilityStatus;
          changed: boolean;
          checkedAt: number;
          nextCheckAt: number;
        }
      | {
          status: "retry_scheduled";
          currentAvailability: OtwPlaySourceAvailabilityStatus;
          retryCode: OtwPlaySourceHealthRetryCode;
          nextCheckAt: number;
        };
  };

export interface OtwPlayAdminPerformanceDto {
  id: string;
  songId: string;
  relationType: OtwPlayRelationType;
  releaseType: OtwPlayReleaseType;
  participationType: OtwPlayParticipationType;
  publicationStatus: OtwPlayPublicationStatus;
  qualityStatus: OtwPlayQualityStatus;
  releasedAt: number | null;
  internalNote: string | null;
  version: number;
  participants: Array<{
    entityId: string;
    displayName: string;
    participantRole: OtwPlayParticipantRole;
    creditOrder: number;
    creditNameSnapshot: string;
  }>;
  sources: Array<{
    source: OtwPlayAdminSourceDto;
    startSeconds: number;
    endSeconds: number | null;
    sourceRole: OtwPlaySourceRole;
    priority: number;
    isPrimary: boolean;
  }>;
}

export interface OtwPlayAdminProposalDto {
  id: string;
  submittedByUserId: string;
  submittedUrl: string;
  youtubeVideoId: string;
  segmentStartSeconds: number;
  submittedTitle: string;
  suggestedSongId: string | null;
  submittedNote: string | null;
  status: OtwPlayProposalStatus;
  version: number;
  reviewedByUserId: string | null;
  reviewedAt: number | null;
  reviewResultCode: string | null;
  reviewNote: string | null;
  approvedPerformanceId: string | null;
  createdAt: number;
  participants: Array<{
    creditOrder: number;
    resolvedEntityId: string | null;
    submittedMemberUid: number | null;
    submittedNameSnapshot: string;
    participantRole: OtwPlayParticipantRole;
  }>;
  originalArtists: Array<{
    creditOrder: number;
    resolvedEntityId: string | null;
    submittedMemberUid: number | null;
    submittedNameSnapshot: string;
  }>;
}

export interface OtwPlayAdminCatalogDto {
  revision: number;
  readModelRevision: number;
  songs: OtwPlayAdminSongDto[];
  performances: OtwPlayAdminPerformanceDto[];
  entities: OtwPlayAdminEntityDto[];
  channels: OtwPlayAdminChannelDto[];
}

export type OtwPlayAdminCatalogSubjectInput =
  | { kind: "member"; memberUid: number }
  | { kind: "entity"; entityId: string }
  | {
      kind: "new_external";
      clientKey: string;
      displayName: string;
      entityKind: Extract<OtwPlayEntityKind, "person" | "group">;
    };

export interface OtwPlayAdminCatalogArtistInput {
  subject: OtwPlayAdminCatalogSubjectInput;
  creditOrder: number;
  isPrimary: boolean;
}

export interface OtwPlayAdminCatalogParticipantInput {
  subject: OtwPlayAdminCatalogSubjectInput;
  participantRole: OtwPlayParticipantRole;
  creditOrder: number;
  creditNameSnapshot?: string;
}

export type OtwPlayAdminCatalogSongDecision =
  | { kind: "existing"; songId: string }
  | { kind: "from_video"; tags?: string[] }
  | {
      kind: "create";
      title: string;
      isOtwOriginal: boolean;
      originalReleaseDate: string | null;
      originalReleasePrecision: OtwPlayDatePrecision;
      aliases: Array<{
        alias: string;
        locale?: string | null;
        aliasKind?: string | null;
      }>;
      originalArtists: OtwPlayAdminCatalogArtistInput[];
      tags?: string[];
    };

export type OtwPlayAdminCatalogChannelDecision =
  | { kind: "existing"; channelId: string }
  | {
      kind: "recognized_member";
      memberUid: number;
      channelRole: Extract<
        OtwPlayChannelRole,
        "member_music" | "member_main"
      >;
    }
  | {
      kind: "confirm" | "pending";
      channelRole: OtwPlayChannelRole;
      owners: OtwPlayAdminCatalogSubjectInput[];
    };

export interface OtwPlayAdminCatalogEntryPreflightRequest {
  youtubeUrl: string;
  startSeconds: number;
}

export interface OtwPlayAdminCatalogEntryPreflightDto {
  catalogRevision: number;
  video: {
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    durationSeconds: number | null;
    publishedAt: number | null;
    availabilityStatus: OtwPlaySourceAvailabilityStatus;
    channelId: string;
    channelTitle: string;
  };
  channel: {
    state:
      | "approved"
      | "pending"
      | "inactive"
      | "revoked"
      | "recognized_member"
      | "unknown";
    catalogChannelId: string | null;
    verificationStatus: OtwPlayChannelVerificationStatus | null;
    active: boolean;
    channelRole: OtwPlayChannelRole | null;
    memberUid: number | null;
  };
  duplicate: {
    songId: string;
    performanceId: string;
  } | null;
}

export interface OtwPlayAdminCreateCatalogEntryRequest {
  expectedCatalogRevision: number;
  youtubeUrl: string;
  startSeconds: number;
  endSeconds?: number | null;
  song: OtwPlayAdminCatalogSongDecision;
  participants: OtwPlayAdminCatalogParticipantInput[];
  channel: OtwPlayAdminCatalogChannelDecision;
  relationType: OtwPlayRelationType;
  releaseType: Extract<OtwPlayReleaseType, "official_mv" | "official_video">;
  participationType: OtwPlayParticipationType;
  publicationTarget: Extract<OtwPlayPublicationStatus, "draft" | "published">;
  internalNote?: string | null;
}

export interface OtwPlayAdminCatalogEntryResultDto {
  song: OtwPlayAdminSongDto;
  performance: OtwPlayAdminPerformanceDto;
  channel: OtwPlayAdminChannelDto;
  createdEntities: OtwPlayAdminEntityDto[];
}

export interface OtwPlayAdminEntityReferenceInput {
  entityId: string;
  creditOrder: number;
  isPrimary?: boolean;
  participantRole?: OtwPlayParticipantRole;
  creditNameSnapshot?: string;
}

export interface OtwPlayAdminSongWriteInput {
  slug: string;
  title: string;
  isOtwOriginal: boolean;
  originalReleaseDate: string | null;
  originalReleasePrecision: OtwPlayDatePrecision;
  aliases: Array<{
    alias: string;
    locale?: string | null;
    aliasKind?: string | null;
  }>;
  originalArtists: OtwPlayAdminEntityReferenceInput[];
  tags?: string[];
}

export type OtwPlayAdminCreateSongRequest = OtwPlayAdminSongWriteInput;

export interface OtwPlayAdminUpdateSongRequest
  extends Omit<OtwPlayAdminSongWriteInput, "originalArtists"> {
  id: string;
  expectedVersion: number;
  originalArtists: OtwPlayAdminCatalogArtistInput[];
}

export interface OtwPlayAdminPerformanceWriteInput {
  songId: string;
  relationType: OtwPlayRelationType;
  releaseType: OtwPlayReleaseType;
  participationType: OtwPlayParticipationType;
  qualityStatus: OtwPlayQualityStatus;
  releasedAt: number | null;
  internalNote?: string | null;
  participants: OtwPlayAdminEntityReferenceInput[];
  source: {
    youtubeUrl: string;
    channelId: string;
    startSeconds: number;
    endSeconds?: number | null;
    sourceRole: Extract<OtwPlaySourceRole, "official" | "alternate">;
  };
}

export type OtwPlayAdminCreatePerformanceRequest =
  OtwPlayAdminPerformanceWriteInput;

export interface OtwPlayAdminUpdatePerformanceRequest
  extends Omit<OtwPlayAdminPerformanceWriteInput, "participants"> {
  id: string;
  expectedVersion: number;
  participants: OtwPlayAdminCatalogParticipantInput[];
}

export interface OtwPlayAdminExpectedVersionRequest {
  expectedVersion: number;
}

export interface OtwPlayAdminRecheckSourceRequest
  extends OtwPlayAdminExpectedVersionRequest {
  youtubeUrl: string;
  channelId: string;
}

export interface OtwPlayAdminRejectProposalRequest
  extends OtwPlayAdminExpectedVersionRequest {
  resultCode: string;
  note?: string | null;
}

export interface OtwPlayAdminApproveProposalRequest
  extends OtwPlayAdminExpectedVersionRequest {
  expectedCatalogRevision: number;
  song: OtwPlayAdminCatalogSongDecision;
  participants: OtwPlayAdminCatalogParticipantInput[];
  channel: OtwPlayAdminCatalogChannelDecision;
  releaseType: Extract<OtwPlayReleaseType, "official_mv" | "official_video">;
  participationType: OtwPlayParticipationType;
  singingCreditConfirmed: true;
  publish: true;
}

export interface OtwPlayAdminCreateChannelRequest {
  externalChannelId: string;
  displayName: string;
  channelRole: OtwPlayChannelRole;
  entityIds: string[];
}

export interface OtwPlayAdminCreateEntityRequest {
  memberUid?: number | null;
  entityKind: OtwPlayEntityKind;
  displayName: string;
  slug: string;
}

export interface OtwPlayAdminUpdateEntityRequest
  extends OtwPlayAdminCreateEntityRequest {
  id: string;
  expectedVersion: number;
  archived: boolean;
}

export interface OtwPlayAdminUpdateChannelRequest
  extends OtwPlayAdminCreateChannelRequest {
  id: string;
  verificationStatus: OtwPlayChannelVerificationStatus;
  active: boolean;
  expectedVersion: number;
}

export interface OtwPlayAdminCommandResponse<T> {
  data: T;
  catalogRevision: number;
}
