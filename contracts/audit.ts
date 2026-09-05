export interface UpdateLogDto {
  id: number;
  schedule_id: number | null;
  member_uid: number | null;
  member_name: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  schedule_date: string;
  action: string;
  title: string | null;
  previous_status: string | null;
  vod_id: string | null;
  reason_code: string | null;
  reason_note: string | null;
  created_at: string | null;
}

export interface LogFilters {
  q?: string;
  action?: string;
  target?: string;
  status?: string;
  from?: string;
  until?: string;
}

export function parseLogFilters(params: URLSearchParams): LogFilters {
  const filters: LogFilters = {};
  for (const key of ["q", "action", "target", "status", "from", "until"] as const) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (value.length > 200) throw new Error("검색 조건은 200자 이하로 입력해 주세요.");
    if ((key === "from" || key === "until") && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("유효한 날짜를 입력해 주세요.");
    filters[key] = value;
  }
  if (filters.from && filters.until && filters.from > filters.until) throw new Error("종료일이 시작일보다 빠릅니다.");
  return filters;
}

export interface UpdateLogQuery extends LogFilters {
  page?: number;
  pageSize?: number;
  sort?:
    | "created_desc"
    | "created_asc"
    | "schedule_desc"
    | "schedule_asc"
    | "action_asc";
}

export interface UpdateLogPageResponseDto {
  items: UpdateLogDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface AdminAuditLogDto {
  id: number;
  event_type: string;
  resource_type: string;
  resource_id: string | null;
  action: string;
  status: "success" | "partial" | "failed" | "skipped";
  actor_id: string | null;
  actor_name: string | null;
  actor_ip: string | null;
  target_count: number | null;
  success_count: number | null;
  failure_count: number | null;
  detail: string | null;
  error: string | null;
  created_at: number;
}

export interface AdminAuditLogPageResponseDto {
  items: AdminAuditLogDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}
