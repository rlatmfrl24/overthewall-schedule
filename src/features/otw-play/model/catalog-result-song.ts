import type { OtwPlayPublicSongSummaryDto } from "@contracts/otw-play";

/** Display data shared by song results and individual performance results. */
export type CatalogResultSong = Pick<OtwPlayPublicSongSummaryDto,
  "id" | "slug" | "title" | "isOtwOriginal" | "tags" | "representativePerformance" | "playable"
> & Partial<Pick<OtwPlayPublicSongSummaryDto, "originalArtists">>;

export const catalogResultDestination = (song: CatalogResultSong) => ({
  to: song.representativePerformance.releaseType === "broadcast"
    ? "/play/clips/$songSlug" as const : "/play/songs/$songSlug" as const,
  params: { songSlug: song.slug },
  search: { performance: song.representativePerformance.releaseType === "broadcast"
    ? song.representativePerformance.id : undefined },
});
