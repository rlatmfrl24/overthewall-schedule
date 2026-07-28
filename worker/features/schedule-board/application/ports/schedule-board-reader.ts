import type { ScheduleBoardResponse } from "../../../../../contracts/schedule-board";

export interface ScheduleBoardReader {
  read(startDate: string, endDate: string): Promise<ScheduleBoardResponse>;
}
