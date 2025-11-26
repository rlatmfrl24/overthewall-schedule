import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Member, ScheduleItem, ScheduleStatus } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function makeRandomSchedule(
  members: Member[],
  size: number
): ScheduleItem[] {
  if (members.length === 0) {
    return [];
  }

  const schedule: ScheduleItem[] = [];
  const statuses: ScheduleStatus[] = ["방송", "휴방", "게릴라", "미정"];
  const broadcastTitles = [
    "Just Chatting",
    "Minecraft",
    "Valorant",
    "Singing",
    "Talk",
    "League of Legends",
    "Cooking",
    "Study",
  ];

  for (let i = 0; i < size; i++) {
    const member = members[Math.floor(Math.random() * members.length)];
    // Randomly select a status
    const status = statuses[Math.floor(Math.random() * statuses.length)];

    let title: string;
    let start_time: string | undefined;

    if (status === "방송") {
      title =
        broadcastTitles[Math.floor(Math.random() * broadcastTitles.length)];
      // Random time between 10:00 and 23:59
      const hour = Math.floor(Math.random() * 14) + 10;
      const minute = Math.floor(Math.random() * 6) * 10;
      start_time = `${hour.toString().padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
    } else {
      title = status;
      start_time = undefined;
    }

    schedule.push({
      status,
      uid: i + 1,
      member_uid: member.uid,
      date: new Date().toISOString(),
      start_time,
      title,
    });
  }

  return schedule;
}
