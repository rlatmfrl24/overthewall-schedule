import { format } from "date-fns";
import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedulesByDate,
  updateSchedule,
} from "@/lib/api/schedules";

type SaveScheduleInput = {
  id?: number;
  member_uid: number;
  date: Date;
  start_time: string | null;
  title: string;
  status: ScheduleStatus;
};

const isExclusiveStatus = (status: ScheduleStatus) =>
  status === "휴방" || status === "게릴라" || status === "미정";

export async function saveScheduleWithConflicts(input: SaveScheduleInput) {
  const dateStr = format(input.date, "yyyy-MM-dd");
  const existing = await fetchSchedulesByDate(dateStr);
  const memberSchedules = existing.filter(
    (s) => s.member_uid === input.member_uid
  );

  if (input.status === "미정") {
    await deleteSchedules(memberSchedules);
    return;
  }

  if (isExclusiveStatus(input.status)) {
    const schedulesToDelete = memberSchedules.filter((s) => s.id !== input.id);
    await deleteSchedules(schedulesToDelete);
  } else if (input.status === "방송") {
    const conflicting = memberSchedules.filter(
      (s) => s.id !== input.id && isExclusiveStatus(s.status)
    );
    await deleteSchedules(conflicting);
  }

  const payload = {
    id: input.id,
    member_uid: input.member_uid,
    date: dateStr,
    start_time: input.start_time,
    title: input.title,
    status: input.status,
  };

  if (input.id) {
    await updateSchedule(payload);
  } else {
    await createSchedule(payload);
  }
}

async function deleteSchedules(list: ScheduleItem[]) {
  const deletions: Promise<unknown>[] = [];
  for (const item of list) {
    if (typeof item.id === "number") {
      deletions.push(deleteSchedule(item.id));
    }
  }
  await Promise.all(deletions);
}


