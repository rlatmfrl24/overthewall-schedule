import type { ScheduleDto } from "../../../../../contracts/schedules";

export type ScheduleQuery = {
  date?: string;
  startDate?: string;
  endDate?: string;
};

export interface ScheduleQueryRepository {
  read(query: ScheduleQuery): Promise<ScheduleDto[]>;
}
