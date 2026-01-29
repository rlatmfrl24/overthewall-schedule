import { apiFetch } from "./client";

export interface AutoUpdateSettings {
  auto_update_enabled: string | null;
  auto_update_interval_hours: string | null;
  auto_update_last_run: string | null;
  auto_update_range_days: string | null;
}

export interface AutoUpdateRunDetail {
  memberUid: number;
  memberName: string;
  scheduleId: number | null;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string | null;
}

export interface AutoUpdateRunResult {
  success: boolean;
  updated: number;
  checked: number;
  details: AutoUpdateRunDetail[];
}

export interface AutoUpdateLog {
  id: number;
  schedule_id: number | null;
  member_uid: number;
  member_name: string;
  schedule_date: string;
  action: string;
  title: string | null;
  previous_status: string | null;
  created_at: string | null;
}

export interface PendingSchedule {
  id: number;
  member_uid: number;
  member_name: string;
  date: string;
  start_time: string | null;
  title: string | null;
  status: string;
  action_type: "create" | "update";
  existing_schedule_id: number | null;
  previous_status: string | null;
  previous_title: string | null;
  vod_id: string | null;
  created_at: string | null;
}

export async function fetchSettings(): Promise<AutoUpdateSettings> {
  return apiFetch<AutoUpdateSettings>("/api/settings");
}

export async function updateSettings(
  settings: Partial<
    Pick<
      AutoUpdateSettings,
      | "auto_update_enabled"
      | "auto_update_interval_hours"
      | "auto_update_range_days"
    >
  >,
): Promise<void> {
  await apiFetch("/api/settings", {
    method: "PUT",
    json: settings,
  });
}

export async function runAutoUpdateNow(): Promise<AutoUpdateRunResult> {
  return apiFetch<AutoUpdateRunResult>("/api/settings/run-now", {
    method: "POST",
  });
}

export async function fetchAutoUpdateLogs(
  limit: number = 50,
): Promise<AutoUpdateLog[]> {
  return apiFetch<AutoUpdateLog[]>(`/api/settings/logs?limit=${limit}`);
}

export async function deleteAutoUpdateLog(
  logId: number,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/settings/logs/${logId}`, {
    method: "DELETE",
  });
}

// 대기 스케줄 API
export async function fetchPendingSchedules(): Promise<PendingSchedule[]> {
  return apiFetch<PendingSchedule[]>("/api/settings/pending");
}

export async function approvePendingSchedule(
  pendingId: number,
): Promise<{ success: boolean; action: string }> {
  return apiFetch(`/api/settings/pending/${pendingId}/approve`, {
    method: "POST",
  });
}

export async function rejectPendingSchedule(
  pendingId: number,
): Promise<{ success: boolean }> {
  return apiFetch(`/api/settings/pending/${pendingId}/reject`, {
    method: "POST",
  });
}

export async function approveAllPendingSchedules(): Promise<{
  success: boolean;
  approvedCount: number;
}> {
  return apiFetch("/api/settings/pending/approve-all", {
    method: "POST",
  });
}

export async function rejectAllPendingSchedules(): Promise<{
  success: boolean;
  rejectedCount: number;
}> {
  return apiFetch("/api/settings/pending/reject-all", {
    method: "POST",
  });
}
