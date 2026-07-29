import type { AdminAuditLogReader } from "./ports/admin-audit-log-reader";

export const readAdminAuditLogs = (
  reader: AdminAuditLogReader,
  page: number,
  pageSize: number,
) => reader.readPage(page, pageSize);
