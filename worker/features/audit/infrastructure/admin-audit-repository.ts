import type { LogFilters } from "@contracts/audit";
import { and, desc, eq, sql } from "drizzle-orm";
import { adminAuditLogs } from "@db/schema";
import type { AdminAuditLogPageResponseDto } from "../../../../contracts/audit";
import type { DbInstance } from "../../../platform/db";
import type { AdminAuditLogReader } from "../application/ports/admin-audit-log-reader";

export const readAdminAuditLogPage = async (
  db: DbInstance,
  page: number,
  pageSize: number,
  filters: LogFilters = {},
): Promise<AdminAuditLogPageResponseDto> => {
  const where = and(
    filters.action ? eq(adminAuditLogs.action, filters.action) : undefined,
    filters.status ? eq(adminAuditLogs.status, filters.status) : undefined,
    filters.target ? eq(adminAuditLogs.resource_type, filters.target) : undefined,
    filters.q ? sql`instr(lower(coalesce(${adminAuditLogs.detail}, '') || ' ' || coalesce(${adminAuditLogs.actor_name}, '') || ' ' || ${adminAuditLogs.event_type}), lower(${filters.q})) > 0` : undefined,
    filters.from ? sql`${adminAuditLogs.created_at} >= ${Date.parse(filters.from)}` : undefined,
    filters.until ? sql`${adminAuditLogs.created_at} < ${Date.parse(filters.until) + 86400000}` : undefined,
  );
  const offset = (page - 1) * pageSize;
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminAuditLogs).where(where);
  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const items = await db
    .select()
    .from(adminAuditLogs)
    .where(where)
    .orderBy(desc(adminAuditLogs.created_at), desc(adminAuditLogs.id))
    .limit(pageSize)
    .offset(offset);

  return {
    items: items as AdminAuditLogPageResponseDto["items"],
    total,
    page,
    pageSize,
    totalPages,
    hasPrevPage: page > 1,
    hasNextPage: page < totalPages,
  };
};

export class D1AdminAuditLogReader implements AdminAuditLogReader {
  private readonly db: DbInstance;

  constructor(db: DbInstance) {
    this.db = db;
  }

  readPage(page: number, pageSize: number, filters?: LogFilters) {
    return readAdminAuditLogPage(this.db, page, pageSize, filters);
  }
}
