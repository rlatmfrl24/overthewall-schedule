import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDDays, type DDayItem } from "@/features/ddays";
import { fetchActiveMembers, type Member } from "@/features/members";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";

export function useScheduleData() {
  const queryClient = useQueryClient();
  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
  });
  const ddaysQuery = useQuery<DDayItem[]>({
    queryKey: queryKeys.ddays.list(),
    queryFn: () => fetchDDays(),
    staleTime: QUERY_STALE_TIME_MS,
  });

  const reloadMembers = useCallback(async () => {
    await membersQuery.refetch();
  }, [membersQuery]);

  const reloadDDays = useCallback(async () => {
    await ddaysQuery.refetch();
  }, [ddaysQuery]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: queryKeys.members.active(),
        queryFn: fetchActiveMembers,
        staleTime: QUERY_STALE_TIME_MS,
      }),
      queryClient.ensureQueryData({
        queryKey: queryKeys.ddays.list(),
        queryFn: () => fetchDDays(),
        staleTime: QUERY_STALE_TIME_MS,
      }),
    ]);
  }, [queryClient]);

  return {
    members: membersQuery.data ?? [],
    ddays: ddaysQuery.data ?? [],
    loading: membersQuery.isLoading || ddaysQuery.isLoading,
    hasLoaded: membersQuery.isFetched && ddaysQuery.isFetched,
    reloadMembers,
    reloadDDays,
    reloadAll,
  };
}
