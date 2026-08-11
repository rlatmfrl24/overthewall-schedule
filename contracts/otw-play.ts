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

export const OTW_PLAY_ADMIN_ERROR_CODES = [
  "PLAY_ADMIN_INVALID_REQUEST",
  "PLAY_ADMIN_NOT_FOUND",
  "PLAY_ADMIN_STALE_WRITE",
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
  version: number;
}

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
    submittedNameSnapshot: string;
    participantRole: OtwPlayParticipantRole;
  }>;
  originalArtists: Array<{
    creditOrder: number;
    resolvedEntityId: string | null;
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
}

export type OtwPlayAdminCreateSongRequest = OtwPlayAdminSongWriteInput;

export interface OtwPlayAdminUpdateSongRequest
  extends OtwPlayAdminSongWriteInput {
  id: string;
  expectedVersion: number;
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
  extends OtwPlayAdminPerformanceWriteInput {
  id: string;
  expectedVersion: number;
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
  song: { existingSongId: string } | { create: OtwPlayAdminSongWriteInput };
  performance: Omit<OtwPlayAdminPerformanceWriteInput, "songId" | "source"> & {
    source: Omit<OtwPlayAdminPerformanceWriteInput["source"], "youtubeUrl">;
  };
  publish: boolean;
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
