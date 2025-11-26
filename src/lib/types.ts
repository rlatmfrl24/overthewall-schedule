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
  is_deprecated?: string;
}

// 스케줄 상태: 방송, 휴방, 게릴라
type ScheduleStatus = "방송" | "휴방" | "게릴라";

interface ScheduleItem {
  status: ScheduleStatus;
  uid: number;
  member_uid: number;
  date?: string;
  start_time?: string;
  title?: string;
}

export type { Member, ScheduleItem, ScheduleStatus };
