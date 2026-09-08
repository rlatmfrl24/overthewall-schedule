import { OTW_PLAY_AUTOMATION_PAUSED_SETTING_KEY } from "@contracts/configuration";

export const OTW_PLAY_AUTOMATION_RUNNING_SQL = `NOT EXISTS (
  SELECT 1 FROM settings WHERE key = '${OTW_PLAY_AUTOMATION_PAUSED_SETTING_KEY}' AND value = 'true'
)`;

export const readOtwPlayAutomationPaused = async (db: D1Database): Promise<boolean> => {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = ?")
    .bind(OTW_PLAY_AUTOMATION_PAUSED_SETTING_KEY).first<{ value: string | null }>();
  return setting?.value === "true";
};
