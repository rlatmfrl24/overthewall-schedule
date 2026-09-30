import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { YouTubeFeedStatusDto } from "@contracts/youtube";
import { apiFetch } from "@/shared/api/client";

export const fetchYouTubeFeedStatus = (windowHours: 24 | 168 = 24) =>
  apiFetch<YouTubeFeedStatusDto>(withRouteSearch(apiRoutes.youtube.feedStatus.build(), `windowHours=${windowHours}`), { cache: "no-store" });
