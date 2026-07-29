import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type { ScheduleBoardResponse } from "../model/types";

export async function fetchScheduleBoard(startDate: string, endDate: string) {
  const params = new URLSearchParams({ startDate, endDate });
  return apiFetch<ScheduleBoardResponse>(
    withRouteSearch(apiRoutes.scheduleBoard.read.build(), params),
    { cache: "no-store" },
  );
}
