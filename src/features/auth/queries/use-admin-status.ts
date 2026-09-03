import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchAdminStatus } from "../api/auth";

export const useAdminStatus = (userId?: string | null) =>
  useQuery({
    queryKey: queryKeys.auth.adminStatus(userId ?? "signed-out"),
    queryFn: fetchAdminStatus,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });
