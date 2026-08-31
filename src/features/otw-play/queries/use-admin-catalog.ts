import { useEffect, useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
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

export const useOtwPlayImportJob = (jobId: string | null) => {
  const queryClient = useQueryClient();
  const previousStatus = useRef<string | null>(null);
  const query = useQuery({
    queryKey: queryKeys.otwPlay.importJob(jobId ?? "none"),
    queryFn: () => fetchOtwPlayImportJob(jobId!),
    enabled: Boolean(jobId),
    refetchInterval: (currentQuery) => {
      const job = currentQuery.state.data;
      if (job?.status !== "queued" && job?.status !== "collecting") {
        return false;
      }
      const age = Date.now() - job.createdAt;
      if (age < 10_000) return 2_000;
      if (age < 60_000) return 5_000;
      return 15_000;
    },
    refetchIntervalInBackground: false,
    networkMode: "online",
  });

  useEffect(() => {
    const status = query.data?.status ?? null;
    if (previousStatus.current && status && previousStatus.current !== status) {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.otwPlay.importJobs(),
      });
    }
    previousStatus.current = status;
  }, [query.data?.status, queryClient]);

  return query;
};

export const useOtwPlayImportJobs = () => useQuery({
  queryKey: queryKeys.otwPlay.importJobs(),
  queryFn: fetchOtwPlayImportJobs,
  staleTime: 5_000,
});

export const useOtwPlayChannelMonitors = () => useQuery({
  queryKey: queryKeys.otwPlay.channelMonitors(),
  queryFn: fetchOtwPlayChannelMonitors,
  staleTime: 15_000,
});

export const useOtwPlayChannelMonitorCandidates = (monitorId: string | null) => useInfiniteQuery({
  queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId ?? "none", "current"),
  queryFn: ({ pageParam }) => fetchOtwPlayChannelMonitorCandidates(monitorId!, {
    limit: 50,
    cursor: pageParam,
  }),
  initialPageParam: null as string | null,
  getNextPageParam: (page) => page.nextCursor,
  enabled: Boolean(monitorId),
  staleTime: 5_000,
});

export const useOtwPlayPreviousGenerationCandidates = (
  monitorId: string | null,
) => useInfiniteQuery({
  queryKey: queryKeys.otwPlay.channelMonitorCandidates(monitorId ?? "none", "previous"),
  queryFn: ({ pageParam }) => fetchOtwPlayChannelMonitorCandidates(monitorId!, {
    limit: 50,
    cursor: pageParam,
    scope: "previous",
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
