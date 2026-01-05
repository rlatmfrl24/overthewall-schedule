import { format } from "date-fns";
import type { ScheduleItem, ScheduleStatus } from "./types";
import {
  deleteSchedule,
  fetchSchedulesByDate,
  saveSchedule,
} from "./api";

export type ScheduleUpsertInput = {
  id?: number;
  member_uid: number;
  date: Date;
  start_time: string | null;
  title: string;
  status: ScheduleStatus;
};

const isExclusiveStatus = (status: ScheduleStatus) =>
  status === "휴방" || status === "게릴라" || status === "미정";

export async function upsertScheduleWithRules(input: ScheduleUpsertInput) {
  const dateStr = format(input.date, "yyyy-MM-dd");
  const existingSchedules = await fetchSchedulesByDate(dateStr);
  const memberSchedules = existingSchedules.filter(
    (s) => s.member_uid === input.member_uid
  );

  if (input.status === "미정") {
    await Promise.all(memberSchedules.map((s) => deleteSchedule(s.id!)));
    await saveSchedule({ ...input, date: dateStr });
    return;
  }

  if (isExclusiveStatus(input.status)) {
    const schedulesToDelete = memberSchedules.filter((s) => s.id !== input.id);
    await Promise.all(schedulesToDelete.map((s) => deleteSchedule(s.id!)));
  } else if (input.status === "방송") {
    const conflicting = memberSchedules.filter(
      (s) => s.id !== input.id && isExclusiveStatus(s.status as ScheduleStatus)
    );
    await Promise.all(conflicting.map((s) => deleteSchedule(s.id!)));
  }

  await saveSchedule({ ...input, date: dateStr });
}

export async function removeSchedule(id: number) {
  await deleteSchedule(id);
}


