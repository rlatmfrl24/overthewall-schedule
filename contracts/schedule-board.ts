import type { DDayDto } from "./ddays";
import type { MemberDto } from "./members";
import type { NoticeDto } from "./notices";
import type { ScheduleDto } from "./schedules";

export interface ScheduleBoardResponse {
  startDate: string;
  endDate: string;
  updatedAt: string | null;
  members: MemberDto[];
  ddays: DDayDto[];
  notices: NoticeDto[];
  schedules: ScheduleDto[];
}
