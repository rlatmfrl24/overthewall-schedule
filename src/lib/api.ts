import type {
  Member,
  ScheduleItem,
  ScheduleStatus,
  DDayItem,
  ChzzkLiveStatusMap,
} from "./types";
import type { Notice } from "@/db/schema";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function mutate(url: string, init: RequestInit) {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }
}

export async function fetchMembers(options?: { includeDeprecated?: boolean }) {
  const data = await getJson<Member[]>("/api/members");
  if (options?.includeDeprecated) return data;
  return data.filter((m) => m.is_deprecated !== "true" && m.is_deprecated !== "1");
}

export async function fetchMemberByCode(code: string) {
  return getJson<Member>(`/api/members/${code}`);
}

export async function fetchSchedulesByDate(date: string) {
  return getJson<ScheduleItem[]>(`/api/schedules?date=${date}`);
}

export async function fetchSchedulesByRange(startDate: string, endDate: string) {
  return getJson<ScheduleItem[]>(
    `/api/schedules?startDate=${startDate}&endDate=${endDate}`
  );
}

export async function saveSchedule(data: {
  id?: number;
  member_uid: number;
  date: string;
  start_time: string | null;
  title: string;
  status: ScheduleStatus;
}) {
  const method = data.id ? "PUT" : "POST";
  await mutate("/api/schedules", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteSchedule(id: number) {
  await mutate(`/api/schedules?id=${id}`, { method: "DELETE" });
}

export async function fetchDDays() {
  return getJson<DDayItem[]>("/api/ddays");
}

export async function fetchNotices(options?: { includeInactive?: boolean }) {
  const qs = options?.includeInactive ? "?includeInactive=1" : "";
  return getJson<Notice[]>(`/api/notices${qs}`);
}

export async function fetchLiveStatuses(channelIds: string[]) {
  if (channelIds.length === 0) return {} as ChzzkLiveStatusMap;
  const data = await getJson<{
    items?: { channelId: string; content: ChzzkLiveStatusMap[number] }[];
  }>(`/api/live-status?channelIds=${channelIds.join(",")}`);

  const nextMap: ChzzkLiveStatusMap = {};
  data.items?.forEach(({ channelId, content }) => {
    nextMap[channelId as unknown as number] = content ?? null;
  });
  return nextMap;
}


