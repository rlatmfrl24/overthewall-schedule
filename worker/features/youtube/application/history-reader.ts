import type { YouTubeHistoryRequest, YouTubeHistoryDto } from "@contracts/youtube";

/** Constructed only after the owning HTTP adapter verifies administrator access. */
export interface AdminYouTubeHistoryReader {
  read(input: YouTubeHistoryRequest): Promise<YouTubeHistoryDto>;
}
