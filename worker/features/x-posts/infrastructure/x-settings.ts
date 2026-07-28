export const readXSetting = async (db: D1Database, key: string) => {
  const row = await db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .bind(key)
    .first<{ value: string | null }>();
  return row?.value ?? null;
};
