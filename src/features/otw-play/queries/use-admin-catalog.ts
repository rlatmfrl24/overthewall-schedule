import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchOtwPlayAdminCatalog,
  fetchOtwPlayAdminObservability,
  fetchOtwPlayAdminProposals,
  fetchOtwPlayAdminRelease,
  fetchOtwPlayAdminSourceHealth,
} from "../api/admin";

export const useOtwPlayAdminCatalog = () => useQuery({
  queryKey: queryKeys.otwPlay.adminCatalog(),
  queryFn: fetchOtwPlayAdminCatalog,
  staleTime: 15_000,
});

export const useOtwPlayAdminProposals = (status = "pending_review") => useQuery({
  queryKey: queryKeys.otwPlay.adminProposals(status),
  queryFn: () => fetchOtwPlayAdminProposals(status),
  staleTime: 15_000,
});

export const useOtwPlayAdminSourceHealth = (enabled: boolean) => useQuery({
  queryKey: queryKeys.otwPlay.adminSourceHealth(),
  queryFn: fetchOtwPlayAdminSourceHealth,
  enabled,
  staleTime: 15_000,
});

export const useOtwPlayAdminObservability = (enabled: boolean) => useQuery({
  queryKey: queryKeys.otwPlay.adminObservability(),
  queryFn: fetchOtwPlayAdminObservability,
  enabled,
  staleTime: 30_000,
});

export const useOtwPlayAdminRelease = (enabled: boolean) => useQuery({
  queryKey: queryKeys.otwPlay.adminRelease(),
  queryFn: fetchOtwPlayAdminRelease,
  enabled,
  staleTime: 15_000,
});
