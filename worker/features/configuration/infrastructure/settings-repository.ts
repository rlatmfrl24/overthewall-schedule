import { inArray } from "drizzle-orm";
import { settings } from "@db/schema";
import type { DbInstance } from "../../../platform/db";
import type { SettingWrite } from "@contracts/configuration";
import type { SettingsRepository } from "../application/ports/settings-repository";

export const readAdminSettingValues = async (
  db: DbInstance,
  keys: readonly string[],
) => {
  if (keys.length === 0) return {};
  const rows = await db
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...keys]));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
};

export const readPreviousSettingValues = async (
  db: DbInstance,
  keys: readonly string[],
) => {
  const values = await readAdminSettingValues(db, keys);
  return new Map(Object.entries(values));
};

export const writeSettingUpdates = async (
  db: DbInstance,
  updates: readonly SettingWrite[],
) => {
  await Promise.all(
    updates.map(({ key, value }) => {
      const updatedAt = Date.now().toString();
      return db
        .insert(settings)
        .values({ key, value, updated_at: updatedAt })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updated_at: updatedAt },
        });
    }),
  );
};

export class DrizzleSettingsRepository implements SettingsRepository {
  private readonly database: DbInstance;

  constructor(database: DbInstance) {
    this.database = database;
  }

  read(keys: Parameters<SettingsRepository["read"]>[0]) {
    return readAdminSettingValues(this.database, keys);
  }

  write(updates: readonly SettingWrite[]) {
    return writeSettingUpdates(this.database, updates);
  }
}
