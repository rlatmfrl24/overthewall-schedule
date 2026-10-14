import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { ScheduleBoardResponse } from "../model/types";

export async function fetchScheduleBoard(startDate: string, endDate: string, includeArchived = false) {
  const params = new URLSearchParams({ startDate, endDate });
  if (includeArchived) params.set("archive", "1");
  return apiFetch<ScheduleBoardResponse>(
    withRouteSearch(apiRoutes.scheduleBoard.read.build(), params),
    { cache: "no-store" },
  );
}
