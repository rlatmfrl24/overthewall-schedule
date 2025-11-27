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
      member_uid: member.uid,
      date: new Date().toISOString(),
      start_time,
      title,
    });
  }

  return schedule;
}

export function hexToRgba(hex: string | undefined, alpha: number) {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getContrastColor(hexColor: string | undefined): string {
  if (!hexColor || !/^#[0-9A-F]{6}$/i.test(hexColor)) {
    return "#000000";
  }
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? "#000000" : "#ffffff";
}

export function adjustBrightness(hex: string, percent: number): string {
  if (!hex || !/^#[0-9A-F]{6}$/i.test(hex)) return hex;

  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;

  return (
    "#" +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}
