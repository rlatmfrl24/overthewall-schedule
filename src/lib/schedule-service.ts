import { format } from "date-fns";
import type { ScheduleStatus } from "@/lib/types";
import { saveSchedule } from "@/lib/api/schedules";

type SaveScheduleInput = {
  id?: number;
  member_uid: number;
  date: Date;
  start_time: string | null;
  title: string;
  status: ScheduleStatus;
};

export async function saveScheduleWithConflicts(input: SaveScheduleInput) {
  const dateStr = format(input.date, "yyyy-MM-dd");
  return saveSchedule({
    id: input.id,
    member_uid: input.member_uid,
    date: dateStr,
    start_time: input.start_time,
    title: input.title,
    status: input.status,
  });
}


