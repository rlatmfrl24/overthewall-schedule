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
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId: string;
}

export interface OtwPlayPublicErrorResponse {
  error: OtwPlayPublicError;
}
