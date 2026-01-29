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
  scheduleId: number;
  scheduleDate: string;
  action: string;
  title?: string;
  previousStatus: string;
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
): Promise<{ success: boolean; deletedScheduleId: number | null }> {
  return apiFetch(`/api/settings/logs/${logId}`, {
    method: "DELETE",
  });
}
