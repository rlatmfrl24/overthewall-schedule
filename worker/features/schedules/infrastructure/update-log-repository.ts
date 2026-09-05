import { and, asc, desc, eq, sql } from "drizzle-orm";
import { updateLogs } from "@db/schema";
import type { DbInstance } from "../../../platform/db";
import type {
  UpdateLogReadOptions,
  UpdateLogRepository,
} from "../application/ports/update-log-repository";

export const readUpdateLogs = async (
  db: DbInstance,
  options: UpdateLogReadOptions,
) => {
  const where = and(
    options.action ? eq(updateLogs.action, options.action) : undefined,
    options.target ? sql`cast(${updateLogs.member_uid} as text) = ${options.target}` : undefined,
    options.q ? sql`instr(lower(coalesce(${updateLogs.title}, '') || ' ' || coalesce(${updateLogs.member_name}, '') || ' ' || coalesce(${updateLogs.actor_name}, '')), lower(${options.q})) > 0` : undefined,
    options.from ? sql`datetime(${updateLogs.created_at}) >= datetime(${options.from})` : undefined,
    options.until ? sql`datetime(${updateLogs.created_at}) < datetime(${options.until}, '+1 day')` : undefined,
  );
  const logQuery = db.select().from(updateLogs).where(where).$dynamic();

  if (options.page === null && options.pageSize === null) {
    return logQuery
      .orderBy(desc(updateLogs.created_at), desc(updateLogs.id))
      .limit(options.limit);
  }

  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 50;
  const offset = (page - 1) * pageSize;
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(updateLogs).where(where);
  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);

  let pagedQuery = logQuery;
  if (options.sort === "created_asc") {
    pagedQuery = pagedQuery.orderBy(
      asc(updateLogs.created_at),
      asc(updateLogs.id),
    );
  } else if (options.sort === "schedule_desc") {
    pagedQuery = pagedQuery.orderBy(
      desc(updateLogs.schedule_date),
      desc(updateLogs.created_at),
      desc(updateLogs.id),
    );
  } else if (options.sort === "schedule_asc") {
    pagedQuery = pagedQuery.orderBy(
      asc(updateLogs.schedule_date),
      asc(updateLogs.created_at),
      asc(updateLogs.id),
    );
  } else if (options.sort === "action_asc") {
    pagedQuery = pagedQuery.orderBy(
      asc(updateLogs.action),
      desc(updateLogs.created_at),
      desc(updateLogs.id),
    );
  } else {
    pagedQuery = pagedQuery.orderBy(
      desc(updateLogs.created_at),
      desc(updateLogs.id),
    );
  }

  const items = await pagedQuery.limit(pageSize).offset(offset);
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
};

export const deleteUpdateLog = async (db: DbInstance, id: number) => {
  await db.delete(updateLogs).where(eq(updateLogs.id, id));
};

export class DrizzleUpdateLogRepository implements UpdateLogRepository {
  private readonly database: DbInstance;

  constructor(database: DbInstance) {
    this.database = database;
  }

  read(options: UpdateLogReadOptions) {
    return readUpdateLogs(this.database, options);
  }

  delete(id: number) {
    return deleteUpdateLog(this.database, id);
  }
}
