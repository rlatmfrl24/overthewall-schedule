import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { OtwPlayIngestionClassification } from "@contracts/otw-play";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchOtwPlayAdminCatalog,
  fetchOtwPlayAdminObservability,
  fetchOtwPlayAdminProposals,
  fetchOtwPlayAdminRelease,
  fetchOtwPlayAdminSourceHealth,
  fetchOtwPlayImportJob,
  fetchOtwPlayImportJobItems,
  fetchOtwPlayImportJobs,
  fetchOtwPlayChannelMonitors,
  fetchOtwPlayChannelMonitorCandidates,
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

export const useOtwPlayImportJob = (jobId: string | null) => useQuery({
  queryKey: queryKeys.otwPlay.importJob(jobId ?? "none"),
  queryFn: () => fetchOtwPlayImportJob(jobId!),
  enabled: Boolean(jobId),
  refetchInterval: (query) => {
    const status = query.state.data?.status;
    return status === "queued" || status === "collecting" ? 2_000 : false;
  },
});

export const useOtwPlayImportJobs = () => useQuery({
  queryKey: queryKeys.otwPlay.importJobs(),
  queryFn: fetchOtwPlayImportJobs,
  refetchInterval: (query) => query.state.data?.some(
    (job) => job.status === "queued" || job.status === "collecting",
  ) ? 2_000 : false,
});

export const useOtwPlayChannelMonitors = () => useQuery({
  queryKey: queryKeys.otwPlay.channelMonitors(),
  queryFn: fetchOtwPlayChannelMonitors,
  staleTime: 15_000,
});

export const useOtwPlayChannelMonitorCandidates = (monitorId: string | null) => useInfiniteQuery({
  queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId ?? "none"),
  queryFn: ({ pageParam }) => fetchOtwPlayChannelMonitorCandidates(monitorId!, {
    limit: 50,
    cursor: pageParam,
  }),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
  enabled: Boolean(monitorId),
  staleTime: 5_000,
});

export const useOtwPlayImportJobItems = (
  jobId: string | null,
  classification?: OtwPlayIngestionClassification,
) => useQuery({
  queryKey: queryKeys.otwPlay.importJobItems(
    jobId ?? "none",
    classification ?? "all",
  ),
  queryFn: () => fetchOtwPlayImportJobItems(jobId!, {
    limit: 100,
    ...(classification ? { classification } : {}),
  }),
  enabled: Boolean(jobId),
  staleTime: 5_000,
});
