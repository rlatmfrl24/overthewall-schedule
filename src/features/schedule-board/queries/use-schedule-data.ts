import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDDays, type DDayItem } from "@/features/ddays";
import { fetchActiveMembers, type Member } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";

export function useScheduleData() {
  const queryClient = useQueryClient();
  const membersQuery = currentContentQuery(useQuery<Member[]>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,

  }));
  const ddaysQuery = currentContentQuery(useQuery<DDayItem[]>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.ddays.list(),
    queryFn: () => fetchDDays(),

  }));

  const reloadMembers = useCallback(async () => {
    await membersQuery.refetch();
  }, [membersQuery]);

  const reloadDDays = useCallback(async () => {
    await ddaysQuery.refetch();
  }, [ddaysQuery]);

  const reloadAll = useCallback(async () => {
    await Promise.all([
      queryClient.fetchQuery({
        queryKey: queryKeys.members.active(),
        queryFn: fetchActiveMembers,
        staleTime: 0,
      }),
      queryClient.fetchQuery({
        queryKey: queryKeys.ddays.list(),
        queryFn: () => fetchDDays(),
        staleTime: 0,
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
