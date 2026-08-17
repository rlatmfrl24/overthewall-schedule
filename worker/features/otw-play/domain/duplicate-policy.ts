import { normalizeOtwPlaySearchText } from "./search-normalization";

const compareStableIds = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

const normalizeIds = (ids: readonly string[]): string[] =>
  [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort(
    compareStableIds,
  );

const normalizeStartSeconds = (
  value: number | null | undefined,
): number => {
  const normalized = value ?? 0;
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new RangeError("startSeconds must be a non-negative safe integer");
  }
  return normalized;
};

const serializeKeyMaterial = (parts: readonly unknown[]): string => {
  const serialized = JSON.stringify(parts);
  if (serialized === undefined) {
    throw new TypeError("Unable to serialize duplicate key material");
  }
  return serialized;
};

export interface SongDedupeKeyInput {
  title: string;
  originalArtistIds: readonly string[];
}

export const createSongDedupeKeyMaterial = (
  input: SongDedupeKeyInput,
): string =>
  serializeKeyMaterial([
    "song:v1",
    normalizeOtwPlaySearchText(input.title),
    normalizeIds(input.originalArtistIds),
  ]);

export interface VideoBackedSongDedupeKeyInput {
  title: string;
  youtubeVideoId: string;
}

export const createVideoBackedSongDedupeKeyMaterial = (
  input: VideoBackedSongDedupeKeyInput,
): string =>
  serializeKeyMaterial([
    "song-from-video:v1",
    normalizeOtwPlaySearchText(input.title),
    input.youtubeVideoId.trim(),
  ]);

export interface PerformanceDedupeKeyInput {
  songId: string;
  sourceId: string;
  startSeconds?: number | null;
}

export const createPerformanceDedupeKeyMaterial = (
  input: PerformanceDedupeKeyInput,
): string =>
  serializeKeyMaterial([
    "performance:v1",
    input.songId.trim(),
    input.sourceId.trim(),
    normalizeStartSeconds(input.startSeconds),
  ]);

export const EXACT_DUPLICATE_EVIDENCE = [
  "same_youtube_video_id",
  "same_segment_start",
] as const;

export type ExactDuplicateEvidence =
  (typeof EXACT_DUPLICATE_EVIDENCE)[number];

export interface SourceSegmentIdentity {
  youtubeVideoId: string;
  startSeconds?: number | null;
}

export interface ExactDuplicateAssessment {
  isExactDuplicate: boolean;
  evidence: readonly ExactDuplicateEvidence[];
  automaticMerge: false;
}

export const assessExactSourceDuplicate = (
  candidate: SourceSegmentIdentity,
  existing: SourceSegmentIdentity,
): ExactDuplicateAssessment => {
  const evidence: ExactDuplicateEvidence[] = [];
  if (candidate.youtubeVideoId === existing.youtubeVideoId) {
    evidence.push("same_youtube_video_id");
  }
  if (
    normalizeStartSeconds(candidate.startSeconds) ===
    normalizeStartSeconds(existing.startSeconds)
  ) {
    evidence.push("same_segment_start");
  }

  return {
    isExactDuplicate: evidence.length === EXACT_DUPLICATE_EVIDENCE.length,
    evidence,
    automaticMerge: false,
  };
};

export const SOFT_DUPLICATE_EVIDENCE = [
  "similar_title",
  "overlapping_original_artist",
  "nearby_release_date",
  "overlapping_participant",
] as const;

export type SoftDuplicateEvidence =
  (typeof SOFT_DUPLICATE_EVIDENCE)[number];

export interface SoftDuplicateSignals {
  similarTitle?: boolean;
  overlappingOriginalArtistIds?: readonly string[];
  nearbyReleaseDate?: boolean;
  overlappingParticipantIds?: readonly string[];
}

export interface SoftDuplicateAssessment {
  isSoftDuplicateCandidate: boolean;
  evidence: readonly SoftDuplicateEvidence[];
  automaticMerge: false;
}

export const assessSoftDuplicate = (
  signals: SoftDuplicateSignals,
): SoftDuplicateAssessment => {
  const evidence: SoftDuplicateEvidence[] = [];
  if (signals.similarTitle) evidence.push("similar_title");
  if ((signals.overlappingOriginalArtistIds?.length ?? 0) > 0) {
    evidence.push("overlapping_original_artist");
  }
  if (signals.nearbyReleaseDate) evidence.push("nearby_release_date");
  if ((signals.overlappingParticipantIds?.length ?? 0) > 0) {
    evidence.push("overlapping_participant");
  }

  return {
    isSoftDuplicateCandidate: evidence.length > 0,
    evidence,
    automaticMerge: false,
  };
};
