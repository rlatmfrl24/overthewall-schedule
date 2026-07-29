import type { ScheduleBoardReader } from "./ports/schedule-board-reader";

export const readScheduleBoard = (
  reader: ScheduleBoardReader,
  startDate: string,
  endDate: string,
) => reader.read(startDate, endDate);
