import type { Notice } from "@/db/schema";
import { apiFetch } from "./client";
import type { DDayItem, Member, ScheduleItem } from "../types";

export interface ScheduleBoardResponse {
  startDate: string;
  endDate: string;
  updatedAt: string;
  members: Member[];
  ddays: DDayItem[];
  notices: Notice[];
  schedules: ScheduleItem[];
}

export async function fetchScheduleBoard(startDate: string, endDate: string) {
  const params = new URLSearchParams({ startDate, endDate });
  return apiFetch<ScheduleBoardResponse>(`/api/schedule-board?${params}`, {
    cache: "no-store",
  });
}
