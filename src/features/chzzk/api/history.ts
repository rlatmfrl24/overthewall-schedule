import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import type { ChzzkHistoryDto } from "@contracts/chzzk";
import { apiFetch } from "@/shared/api/client";
export const fetchChzzkHistory = (channelId: string, cursor: string | null) => {
  const params = new URLSearchParams();
  if (channelId) params.set("channelId", channelId);
  if (cursor) params.set("cursor", cursor);
  return apiFetch<ChzzkHistoryDto>(withRouteSearch(apiRoutes.chzzk.history.build(), params), { auth: "required", cache: "no-store" });
};
