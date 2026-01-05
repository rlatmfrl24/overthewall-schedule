import { format } from "date-fns";
import type { ScheduleItem, ScheduleStatus } from "./types";
import {
  createSchedule,
  deleteSchedule,
  fetchSchedulesByDate,
  updateSchedule,
} from "./api/schedules";

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

  if (isExclusiveStatus(input.status) && input.status !== "방송") {
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
  await Promise.all(
    list
      .map((item) => item.id)
      .filter((id): id is number => typeof id === "number")
      .map((id) => deleteSchedule(id))
  );
}


