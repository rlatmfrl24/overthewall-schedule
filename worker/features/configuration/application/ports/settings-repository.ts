import type {
  SettingWrite,
  SettingsKey,
} from "../../../../../contracts/configuration";

export interface SettingsRepository {
  read(keys: readonly SettingsKey[]): Promise<Record<string, string | null>>;
  write(updates: readonly SettingWrite[]): Promise<void>;
}
