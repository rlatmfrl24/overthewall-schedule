import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Member, ScheduleItem } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function makeRandomSchedule(members: Member[]): ScheduleItem[] {
  if (members.length === 0) {
    return [];
  }

  const schedule = [];
  for (let i = 0; i < 24; i++) {
    schedule.push({
      uid: i,
      member_uid: members[Math.floor(Math.random() * members.length)].uid,
      date: new Date().toISOString(),
      start_time: `${i}:00`,
      title: `Schedule ${i}`,
    });
  }
  return schedule;
}
