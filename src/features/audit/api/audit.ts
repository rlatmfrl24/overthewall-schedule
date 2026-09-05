import type { LogFilters } from "@contracts/audit";
import { apiRoutes, withRouteSearch } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";
import type {
  AdminAuditLogPageResponse,
  UpdateLogPageResponse,
  UpdateLogQuery,
} from "../model/types";

function buildQueryString(params: Record<string, string | number | undefined>) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  return searchParams.toString();
}

export async function fetchUpdateLogs(
  options: UpdateLogQuery = {},
): Promise<UpdateLogPageResponse> {
  const queryString = buildQueryString({
    q: options.q, action: options.action, target: options.target, status: options.status, from: options.from, until: options.until,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 50,
    sort: options.sort ?? "created_desc",
  });
  return apiFetch<UpdateLogPageResponse>(
    withRouteSearch(apiRoutes.schedules.updateLogs.build(), queryString),
    { cache: "no-store" },
  );
}

export async function fetchAdminAuditLogs(
  options: LogFilters & { page?: number; pageSize?: number } = {},
): Promise<AdminAuditLogPageResponse> {
  const queryString = buildQueryString({
    q: options.q, action: options.action, target: options.target, status: options.status, from: options.from, until: options.until,
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 50,
  });
  return apiFetch<AdminAuditLogPageResponse>(
    withRouteSearch(apiRoutes.audit.adminLogs.build(), queryString),
    { cache: "no-store" },
  );
}
