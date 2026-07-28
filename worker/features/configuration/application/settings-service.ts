import {
  SETTINGS_KEYS,
  normalizeAdminSettings,
  type SettingWrite,
} from "../../../../contracts/configuration";
import type {
  SettingsActor,
  SettingsAudit,
} from "./ports/settings-audit";
import type { SettingsRepository } from "./ports/settings-repository";

export class SettingsService {
  private readonly repository: SettingsRepository;
  private readonly audit: SettingsAudit;

  constructor(
    repository: SettingsRepository,
    audit: SettingsAudit,
  ) {
    this.repository = repository;
    this.audit = audit;
  }

  async read() {
    const storedSettings = await this.repository.read(SETTINGS_KEYS);
    return normalizeAdminSettings(storedSettings).settings;
  }

  async update(updates: readonly SettingWrite[], actor: SettingsActor) {
    const previousValues = await this.repository.read(
      updates.map((update) => update.key),
    );
    await this.repository.write(updates);
    await this.audit.recordUpdate(
      actor,
      updates.map((update) => ({
        key: update.key,
        previousValue: previousValues[update.key] ?? null,
        nextValue: update.value,
      })),
    );
  }
}
