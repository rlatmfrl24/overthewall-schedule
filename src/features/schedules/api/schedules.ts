import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  SaveScheduleResult,
  ScheduleItem,
  SchedulePayload,
  UpsertSchedulePayload,
} from "../model/schedule";

export async function fetchSchedulesByDate(date: string) {
  return apiFetch<ScheduleItem[]>(
    withRouteSearch(apiRoutes.schedules.collection.build(), `date=${date}`),
    { cache: "no-store" },
  );
}

export async function fetchSchedulesInRange(
  startDate: string,
  endDate: string,
) {
  return apiFetch<ScheduleItem[]>(
    withRouteSearch(
      apiRoutes.schedules.collection.build(),
      `startDate=${startDate}&endDate=${endDate}`,
    ),
    { cache: "no-store" },
  );
}

export async function createSchedule(payload: SchedulePayload) {
  return apiFetch(apiRoutes.schedules.collection.build(), {
    method: "POST",
    json: payload,
  });
}

export async function updateSchedule(payload: UpsertSchedulePayload) {
  if (!payload.id) {
    throw new Error("id is required to update schedule");
  }
  return apiFetch(apiRoutes.schedules.collection.build(), {
    method: "PUT",
    json: payload,
  });
}

export async function deleteSchedule(id: number) {
  return apiFetch(
    withRouteSearch(apiRoutes.schedules.collection.build(), `id=${id}`),
    { method: "DELETE" },
  );
}

export async function saveSchedule(payload: UpsertSchedulePayload) {
  return apiFetch<SaveScheduleResult>(apiRoutes.schedules.save.build(), {
    method: "POST",
    json: payload,
  });
}
