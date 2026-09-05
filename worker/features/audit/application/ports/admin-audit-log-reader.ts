import type { LogFilters } from "@contracts/audit";
import type { AdminAuditLogPageResponseDto } from "../../../../../contracts/audit";

export interface AdminAuditLogReader {
  readPage(
    page: number,
    pageSize: number,
    filters?: LogFilters,
  ): Promise<AdminAuditLogPageResponseDto>;
}
