import type { AdminStatusResponse } from "@contracts/auth";
import { apiRoutes } from "@contracts/api-routes";
import { apiFetch } from "@/shared/api/client";

export const fetchAdminStatus = () =>
  apiFetch<AdminStatusResponse>(apiRoutes.auth.adminStatus.build(), {
    auth: "required",
    cache: "no-store",
  });
