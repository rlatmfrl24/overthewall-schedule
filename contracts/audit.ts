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

export interface UpdateLogQuery {
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
