import type {
  SaveScheduleResult,
  ScheduleDto,
  SchedulePayload,
  ScheduleStatus,
  UpsertSchedulePayload,
} from "@contracts/schedules";

export type ScheduleItem = Omit<ScheduleDto, "start_time"> & {
  start_time?: string | null;
};

export type {
  SaveScheduleResult,
  SchedulePayload,
  ScheduleStatus,
  UpsertSchedulePayload,
};
