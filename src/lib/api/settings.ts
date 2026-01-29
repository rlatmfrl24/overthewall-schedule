import { apiFetch } from "./client";

export interface AutoUpdateSettings {
  auto_update_enabled: string | null;
  auto_update_interval_hours: string | null;
  auto_update_last_run: string | null;
}

export interface AutoUpdateRunResult {
  success: boolean;
  updated: number;
  checked: number;
  details: Array<{
    memberUid: number;
    action: string;
    title?: string;
  }>;
}

export async function fetchSettings(): Promise<AutoUpdateSettings> {
  return apiFetch<AutoUpdateSettings>("/api/settings");
}

export async function updateSettings(
  settings: Partial<
    Pick<
      AutoUpdateSettings,
      "auto_update_enabled" | "auto_update_interval_hours"
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
