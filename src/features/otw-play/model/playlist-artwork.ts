import type { OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";

export const performanceArtwork = (item: OtwPlayPublicPerformanceResponseDto | undefined) =>
  item?.performance.playable ? item.performance.selectedSource?.thumbnailUrl ?? null : null;
