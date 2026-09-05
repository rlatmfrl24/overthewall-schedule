import type { LogFilters } from "@contracts/audit";
import type { AdminAuditLogReader } from "./ports/admin-audit-log-reader";

export const readAdminAuditLogs = (
  reader: AdminAuditLogReader,
  page: number,
  pageSize: number,
  filters?: LogFilters,
) => filters && Object.keys(filters).length ? reader.readPage(page, pageSize, filters) : reader.readPage(page, pageSize);
