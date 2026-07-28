import { desc, sql } from "drizzle-orm";
import { adminAuditLogs } from "@db/schema";
import type { AdminAuditLogPageResponseDto } from "../../../../contracts/audit";
import type { DbInstance } from "../../../platform/db";
import type { AdminAuditLogReader } from "../application/ports/admin-audit-log-reader";

export const readAdminAuditLogPage = async (
  db: DbInstance,
  page: number,
  pageSize: number,
): Promise<AdminAuditLogPageResponseDto> => {
  const offset = (page - 1) * pageSize;
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminAuditLogs);
  const total = Number(countResult[0]?.count ?? 0);
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const items = await db
    .select()
    .from(adminAuditLogs)
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

  readPage(page: number, pageSize: number) {
    return readAdminAuditLogPage(this.db, page, pageSize);
  }
}
