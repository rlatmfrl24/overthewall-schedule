import type { PublicCatalogPerformanceDetail } from "./ports/public-catalog-reader";

export function playlistArtwork(item: PublicCatalogPerformanceDetail | undefined): string | null {
  if (!item?.performance.playable) return null;
  const source = item.performance.sources.find(source => source.id === item.performance.playbackSourceId);
  return source?.availabilityStatus === "playable" ? source.thumbnailUrl : null;
}

export function matchesPlaylist(item: PublicCatalogPerformanceDetail, query: { relation?: "original" | "cover"; member?: number }) {
  return (!query.relation || item.performance.relation === query.relation) &&
    (!query.member || item.performance.participants.some(participant => participant.kind === "current_member" &&
      participant.member?.uid === query.member && ["vocal", "featured_vocal"].includes(participant.participantRole)));
}
