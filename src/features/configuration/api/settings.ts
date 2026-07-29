import type {
  AdminSettingsDto,
  SettingsUpdatePayload,
} from "@contracts/configuration";
import { apiRoutes } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";

export type AutoUpdateSettings = AdminSettingsDto;

export async function fetchSettings(): Promise<AutoUpdateSettings> {
  return apiFetch<AutoUpdateSettings>(
    apiRoutes.configuration.settings.build(),
    { cache: "no-store" },
  );
}

export async function updateSettings(
  settings: SettingsUpdatePayload,
): Promise<void> {
  await apiFetch(apiRoutes.configuration.settings.build(), {
    method: "PUT",
    json: settings,
  });
}
