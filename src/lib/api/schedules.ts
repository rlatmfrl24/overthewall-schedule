import { apiFetch } from "./client";
import type { ScheduleItem, ScheduleStatus } from "../types";

export type SchedulePayload = {
  member_uid: number;
  date: string;
  start_time?: string | null;
  title?: string | null;
  status: ScheduleStatus;
};

export type UpsertSchedulePayload = SchedulePayload & { id?: number };

export async function fetchSchedulesByDate(date: string) {
  return apiFetch<ScheduleItem[]>(`/api/schedules?date=${date}`);
}

export async function fetchSchedulesInRange(
  startDate: string,
  endDate: string
) {
  return apiFetch<ScheduleItem[]>(
    `/api/schedules?startDate=${startDate}&endDate=${endDate}`
  );
}

export async function createSchedule(payload: SchedulePayload) {
  return apiFetch("/api/schedules", { method: "POST", json: payload });
}

export async function updateSchedule(payload: UpsertSchedulePayload) {
  if (!payload.id) {
    throw new Error("id is required to update schedule");
  }
  return apiFetch("/api/schedules", { method: "PUT", json: payload });
}

export async function deleteSchedule(id: number) {
  return apiFetch(`/api/schedules?id=${id}`, { method: "DELETE" });
}
