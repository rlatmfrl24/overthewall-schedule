import type { AdminAuditLogPageResponseDto } from "../../../../../contracts/audit";

export interface AdminAuditLogReader {
  readPage(
    page: number,
    pageSize: number,
  ): Promise<AdminAuditLogPageResponseDto>;
}
