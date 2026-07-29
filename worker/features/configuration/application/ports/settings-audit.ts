import type { WritableSettingsKey } from "../../../../../contracts/configuration";

export type SettingsActor = {
  actorId: string | null;
  actorName: string | null;
  actorIp: string | null;
};

export type SettingsChange = {
  key: WritableSettingsKey;
  previousValue: string | null;
  nextValue: string;
};

export interface SettingsAudit {
  recordUpdate(
    actor: SettingsActor,
    changes: readonly SettingsChange[],
  ): Promise<void>;
}
