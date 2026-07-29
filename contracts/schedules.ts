export type ScheduleStatus = "방송" | "휴방" | "게릴라" | "미정";

export interface ScheduleDto {
  id: number;
  member_uid: number;
  date: string;
  start_time: string | null;
  title: string | null;
  status: ScheduleStatus;
  created_at: string | number | null;
}

export interface SchedulePayload {
  member_uid: number;
  date: string;
  start_time?: string | null;
  title?: string | null;
  status: ScheduleStatus;
}

export interface UpsertSchedulePayload extends SchedulePayload {
  id?: number;
}

export interface SaveScheduleResult {
  success: boolean;
  action: "create" | "update" | "delete_conflicts";
  scheduleId: number | null;
  deletedIds: number[];
}
