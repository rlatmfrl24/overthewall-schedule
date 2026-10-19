import { useEffect, useRef, useState } from "react";
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

export const useOtwPlayAdminCatalog = (enabled = true) => useQuery({
  queryKey: queryKeys.otwPlay.adminCatalog(),
  queryFn: ()=>fetchOtwPlayAdminCatalog(),
  refetchOnWindowFocus: false,
  enabled,
  staleTime: 15_000,
});

export const useOtwPlayAdminCatalogPages = (query:import("@contracts/otw-play").OtwPlayAdminCatalogQuery,enabled=true)=>useInfiniteQuery({
  queryKey:[...queryKeys.otwPlay.adminCatalog(),"pages",query],
  queryFn:({pageParam})=>fetchOtwPlayAdminCatalog({...query,limit:25,cursor:pageParam}),
  placeholderData:previous=>previous,
  initialPageParam:null as string|null,getNextPageParam:page=>page.nextCursor,enabled,staleTime:15_000,
});

export const useOtwPlayAdminCatalogLookup = (lookup: "songs" | "entities" | "channels", query: string, enabled: boolean) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(timer);
  }, [query]);
  const result = useInfiniteQuery({
    queryKey: [...queryKeys.otwPlay.adminCatalog(), "lookup", lookup, debouncedQuery],
    queryFn: ({ pageParam }) => fetchOtwPlayAdminCatalog({ lookup, q: debouncedQuery, limit: 25, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: page => page.nextCursor,
    enabled: enabled && debouncedQuery === query,
    staleTime: 15_000,
  });
  const pages = enabled && debouncedQuery === query ? result.data?.pages : undefined;
  const data = pages?.length ? {
    ...pages.at(-1)!,
    songs: pages.flatMap(page => page.songs), entities: pages.flatMap(page => page.entities),
    channels: pages.flatMap(page => page.channels), exactSongExists: pages.some(page => page.exactSongExists),
  } : undefined;
  return { ...result, data, hasNextPage: Boolean(data && result.hasNextPage), ready: !enabled || debouncedQuery === query && result.isSuccess };
};

export const mergeAdminCatalogRows = <T extends { id: string; version: number }>(catalog: T[], lookup: T[] = []) => {
  const rows = new Map(catalog.map(row => [row.id, row]));
  for (const row of lookup) {
    const current = rows.get(row.id);
    if (!current || row.version > current.version) rows.set(row.id, row);
  }
  return [...rows.values()];
};

export const useOtwPlayAdminProposals = (status = "pending_review", enabled = true) => useQuery({
  queryKey: queryKeys.otwPlay.adminProposals(status),
  queryFn: () => fetchOtwPlayAdminProposals(status),
  enabled,
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

export const useOtwPlayImportJob = (jobId: string | null, enabled = true, budgetBlocked = false) => {
  const queryClient = useQueryClient();
  const previousStatus = useRef<string | null>(null);
  const query = useQuery({
    queryKey: queryKeys.otwPlay.importJob(jobId ?? "none"),
    queryFn: () => fetchOtwPlayImportJob(jobId!),
    enabled: enabled && Boolean(jobId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchInterval: (currentQuery) => {
      if (!enabled || budgetBlocked) return false;
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
        queryKey: queryKeys.otwPlay.importJobs(), exact: true,
      });
    }
    previousStatus.current = status;
  }, [query.data?.status, queryClient]);

  return query;
};

export const useOtwPlayImportJobs = (enabled = true) => useQuery({
  queryKey: queryKeys.otwPlay.importJobs(),
  queryFn: fetchOtwPlayImportJobs,
  enabled,
  staleTime: 5_000,
});

export const useOtwPlayChannelMonitors = (enabled = true) => useQuery({
  enabled,
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
