import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { YouTubeHistoryDto } from "@contracts/youtube";
import { apiFetch } from "@/shared/api/client";

export const fetchYouTubeHistory = (channelId: string, cursor: string | null) => {
  const params = new URLSearchParams({ limit: "20" });
  if (channelId) params.set("channelId", channelId);
  if (cursor) params.set("cursor", cursor);
  return apiFetch<YouTubeHistoryDto>(withRouteSearch(apiRoutes.youtube.history.build(), params), { auth: "required", cache: "no-store" });
};
