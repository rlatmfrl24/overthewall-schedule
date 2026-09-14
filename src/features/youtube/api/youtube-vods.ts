import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { YouTubeVodsResponseDto } from "@contracts/youtube";
import { apiFetch } from "@/shared/api/client";

export const fetchYouTubeVods = (memberUids: number[], cursor: string | null) => {
  const params = new URLSearchParams({ limit: "20" });
  if (memberUids.length) params.set("memberUids", [...memberUids].sort((a, b) => a - b).join(","));
  if (cursor) params.set("cursor", cursor);
  return apiFetch<YouTubeVodsResponseDto>(withRouteSearch(apiRoutes.youtube.vods.build(), params));
};
