import type {PlaylistArtwork} from "./ports/playlist-repository";
import type { PublicCatalogPerformanceDetail } from "./ports/public-catalog-reader";

export function playlistArtwork(item: PublicCatalogPerformanceDetail | PlaylistArtwork | undefined): string | null {
  if(item&&"imageUrl" in item)return item.imageUrl;
  if (!item?.performance.playable) return null;
  const source = item.performance.sources.find(source => source.id === item.performance.playbackSourceId);
  return source?.availabilityStatus === "playable" ? source.thumbnailUrl : null;
}

export function matchesPlaylist(item: PublicCatalogPerformanceDetail | PlaylistArtwork, query: { relation?: "original" | "cover"; member?: number }) {
  if("imageUrl" in item)return (!query.relation||item.relation===query.relation)&&(!query.member||item.memberUids.includes(query.member));
  return (!query.relation || item.performance.relation === query.relation) &&
    (!query.member || item.performance.participants.some(participant => participant.kind === "current_member" &&
      participant.member?.uid === query.member && ["vocal", "featured_vocal"].includes(participant.participantRole)));
}
