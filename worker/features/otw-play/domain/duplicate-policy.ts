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
