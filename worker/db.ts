import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../src/db/schema";

type DbInstance = DrizzleD1Database<typeof schema>;

const dbCache = new WeakMap<D1Database, DbInstance>();

export function getDb(env: Env): DbInstance {
  const cached = dbCache.get(env.otw_db);
  if (cached) {
    return cached;
  }

  const db = drizzle(env.otw_db, { schema });
  dbCache.set(env.otw_db, db);
  return db;
}

