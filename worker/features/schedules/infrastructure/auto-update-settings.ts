import { eq } from "drizzle-orm";
import { settings } from "@db/schema";
import type { DbInstance } from "../../../platform/db";

export const readAutoUpdateRangeDays = async (db: DbInstance) => {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "auto_update_range_days"))
    .limit(1);
  return rows[0]?.value ?? null;
};
