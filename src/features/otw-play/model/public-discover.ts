import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";

const releasedAtValue = (song: OtwPlayPublicSongSummaryDto) => {
  const value = song.representativePerformance.releasedAt;
  return value === null ? null : Date.parse(value);
};

export const compareOtwPlayDiscoverSongs = (
  left: OtwPlayPublicSongSummaryDto,
  right: OtwPlayPublicSongSummaryDto,
) => {
  const leftReleased = releasedAtValue(left);
  const rightReleased = releasedAtValue(right);
  if (leftReleased === null && rightReleased !== null) return 1;
  if (leftReleased !== null && rightReleased === null) return -1;
  if (leftReleased !== null && rightReleased !== null && leftReleased !== rightReleased) {
    return rightReleased - leftReleased;
  }
  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
};

export const assembleOtwPlayCollaborationSongs = (
  groups: readonly (readonly OtwPlayPublicSongSummaryDto[])[],
  limit = 8,
) => {
  const unique = new Map<string, OtwPlayPublicSongSummaryDto>();
  for (const songs of groups) {
    for (const song of songs) unique.set(song.id, song);
  }
  return [...unique.values()].sort(compareOtwPlayDiscoverSongs).slice(0, limit);
};
