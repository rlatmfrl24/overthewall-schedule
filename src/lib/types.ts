interface Member {
  uid: number;
  code: string;
  name: string;
  main_color?: string;
  sub_color?: string;
  oshi_mark?: string;
  url_twitter?: string;
  url_youtube?: string;
  url_chzzk?: string;
  birth_date?: string;
  debut_date?: string;
  unit_name?: string;
  fan_name?: string;
  introduction?: string;
  is_deprecated?: string;
}

// 스케줄 상태: 방송, 휴방, 게릴라
type ScheduleStatus = "방송" | "휴방" | "게릴라" | "미정";

interface ScheduleItem {
  id?: number;
  status: ScheduleStatus;
  member_uid: number;
  date: string;
  start_time?: string;
  title?: string;
}

type DDayType = "debut" | "birthday" | "event";

interface DDayItem {
  id?: number;
  title: string;
  date: string; // YYYY-MM-DD (연도 포함)
  description?: string;
  color?: string | null;
  colors?: string[];
  type: DDayType;
}

export type { Member, ScheduleItem, ScheduleStatus, DDayItem, DDayType };
