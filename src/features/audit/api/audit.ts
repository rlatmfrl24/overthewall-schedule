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
  options: { page?: number; pageSize?: number } = {},
): Promise<AdminAuditLogPageResponse> {
  const queryString = buildQueryString({
    page: options.page ?? 1,
    pageSize: options.pageSize ?? 50,
  });
  return apiFetch<AdminAuditLogPageResponse>(
    withRouteSearch(apiRoutes.audit.adminLogs.build(), queryString),
    { cache: "no-store" },
  );
}
