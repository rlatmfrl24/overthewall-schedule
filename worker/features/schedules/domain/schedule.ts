import type { ScheduleStatus } from "../../../../contracts/schedules";

export type ScheduleWriteInput = {
  id: number | null;
  memberUid: number;
  date: string;
  startTime: string | null;
  title: string | null;
  status: ScheduleStatus;
};

export type ScheduleActor = {
  actorId: string | null;
  actorName: string | null;
  actorIp: string | null;
};

export const isExclusiveScheduleStatus = (status: ScheduleStatus) =>
  status === "휴방" || status === "게릴라";

export const isScheduleStatus = (value: unknown): value is ScheduleStatus =>
  value === "방송" ||
  value === "휴방" ||
  value === "게릴라" ||
  value === "미정";
