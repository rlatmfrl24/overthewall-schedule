import type {
  OtwPlayChannelRole,
  OtwPlaySourceAvailabilityStatus,
  OtwPlaySourceRole,
} from "@contracts/otw-play";

const PUBLIC_CHANNEL_ROLES: ReadonlySet<OtwPlayChannelRole> = new Set([
  "otw_official",
  "unit_official",
  "member_music",
  "member_main",
  "project_official",
]);

const PUBLIC_SOURCE_ROLES: ReadonlySet<OtwPlaySourceRole> = new Set([
  "official",
  "alternate",
]);

export interface PublicSourceCandidate {
  id: string;
  priority: number;
  isPrimary: boolean;
  channelApproved: boolean;
  channelActive: boolean;
  channelRole: OtwPlayChannelRole;
  sourceRole: OtwPlaySourceRole;
  availabilityStatus: OtwPlaySourceAvailabilityStatus;
}

export type PublicSourceFallbackReason =
  | "missing_primary"
  | "primary_unplayable"
  | null;

export interface PublicSourceSelection<Source extends PublicSourceCandidate> {
  sources: Source[];
  primarySource: Source | null;
  playbackSource: Source | null;
  playable: boolean;
  fallbackReason: PublicSourceFallbackReason;
}

const comparePublicSources = (
  left: PublicSourceCandidate,
  right: PublicSourceCandidate,
) =>
  left.priority - right.priority ||
  (left.id === right.id ? 0 : left.id < right.id ? -1 : 1);

const isPublicSource = (source: PublicSourceCandidate) =>
  source.channelApproved &&
  source.channelActive &&
  PUBLIC_CHANNEL_ROLES.has(source.channelRole) &&
  PUBLIC_SOURCE_ROLES.has(source.sourceRole);

const isPlayable = (source: PublicSourceCandidate) =>
  source.availabilityStatus === "playable";

export const selectPublicPlaybackSource = <
  Source extends PublicSourceCandidate,
>(
  candidates: readonly Source[],
): PublicSourceSelection<Source> => {
  const sources = candidates.filter(isPublicSource).sort(comparePublicSources);
  const primarySource =
    sources.filter((source) => source.isPrimary).sort(comparePublicSources)[0] ??
    null;

  if (primarySource && isPlayable(primarySource)) {
    return {
      sources,
      primarySource,
      playbackSource: primarySource,
      playable: true,
      fallbackReason: null,
    };
  }

  const playbackSource = sources.find(isPlayable) ?? null;
  return {
    sources,
    primarySource,
    playbackSource,
    playable: playbackSource !== null,
    fallbackReason: primarySource
      ? "primary_unplayable"
      : "missing_primary",
  };
};
