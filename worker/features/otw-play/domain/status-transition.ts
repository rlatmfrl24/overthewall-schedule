import {
  OTW_PLAY_PROPOSAL_STATUSES,
  OTW_PLAY_PUBLICATION_STATUSES,
  OTW_PLAY_QUALITY_STATUSES,
  OTW_PLAY_SOURCE_AVAILABILITY_STATUSES,
  type OtwPlayProposalStatus,
  type OtwPlayPublicationStatus,
  type OtwPlayQualityStatus,
  type OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";

const includesValue = <Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value =>
  typeof value === "string" &&
  (values as readonly string[]).includes(value);

export const isOtwPlayProposalStatus = (
  value: unknown,
): value is OtwPlayProposalStatus =>
  includesValue(OTW_PLAY_PROPOSAL_STATUSES, value);

export const isOtwPlayPublicationStatus = (
  value: unknown,
): value is OtwPlayPublicationStatus =>
  includesValue(OTW_PLAY_PUBLICATION_STATUSES, value);

export const isOtwPlayQualityStatus = (
  value: unknown,
): value is OtwPlayQualityStatus =>
  includesValue(OTW_PLAY_QUALITY_STATUSES, value);

export const isOtwPlaySourceAvailabilityStatus = (
  value: unknown,
): value is OtwPlaySourceAvailabilityStatus =>
  includesValue(OTW_PLAY_SOURCE_AVAILABILITY_STATUSES, value);

const PROPOSAL_TRANSITIONS: Record<
  OtwPlayProposalStatus,
  readonly OtwPlayProposalStatus[]
> = {
  pending_review: ["approved", "rejected"],
  approved: [],
  rejected: [],
  withdrawn: [],
};

const PUBLICATION_TRANSITIONS: Record<
  OtwPlayPublicationStatus,
  readonly OtwPlayPublicationStatus[]
> = {
  draft: ["published"],
  published: ["withdrawn"],
  withdrawn: [],
};

export const canTransitionProposalStatus = (
  from: OtwPlayProposalStatus,
  to: OtwPlayProposalStatus,
): boolean => PROPOSAL_TRANSITIONS[from].includes(to);

export const canTransitionPublicationStatus = (
  from: OtwPlayPublicationStatus,
  to: OtwPlayPublicationStatus,
): boolean => PUBLICATION_TRANSITIONS[from].includes(to);
