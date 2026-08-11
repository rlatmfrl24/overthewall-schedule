import type {
  OtwPlayChannelRole,
  OtwPlaySourceAvailabilityStatus,
} from "@contracts/otw-play";

const OFFICIAL_CHANNEL_ROLE_RANK: Partial<
  Record<OtwPlayChannelRole, number>
> = {
  otw_official: 0,
  unit_official: 0,
  member_music: 1,
  member_main: 2,
  project_official: 3,
};

const compareStableIds = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const normalizedPriority = (value: number | null | undefined): number =>
  Number.isSafeInteger(value) && (value ?? -1) >= 0
    ? (value as number)
    : Number.MAX_SAFE_INTEGER;

export interface OfficialSourceCandidate {
  id: string;
  channelRole: OtwPlayChannelRole;
  channelApproved: boolean;
  channelActive: boolean;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
  priority?: number | null;
}

const compareOfficialSourceCandidates = (
  left: OfficialSourceCandidate,
  right: OfficialSourceCandidate,
): number => {
  const roleDifference =
    (OFFICIAL_CHANNEL_ROLE_RANK[left.channelRole] ??
      Number.MAX_SAFE_INTEGER) -
    (OFFICIAL_CHANNEL_ROLE_RANK[right.channelRole] ??
      Number.MAX_SAFE_INTEGER);
  if (roleDifference !== 0) return roleDifference;

  const priorityDifference =
    normalizedPriority(left.priority) - normalizedPriority(right.priority);
  if (priorityDifference !== 0) return priorityDifference;

  return compareStableIds(left.id, right.id);
};

const isPlayableOfficialSource = (
  source: OfficialSourceCandidate,
): boolean =>
  source.channelApproved &&
  source.channelActive &&
  source.availabilityStatus === "playable" &&
  OFFICIAL_CHANNEL_ROLE_RANK[source.channelRole] !== undefined;

export const selectPreferredOfficialSource = <
  Source extends OfficialSourceCandidate,
>(
  sources: readonly Source[],
): Source | null =>
  sources
    .filter(isPlayableOfficialSource)
    .sort(compareOfficialSourceCandidates)[0] ?? null;
