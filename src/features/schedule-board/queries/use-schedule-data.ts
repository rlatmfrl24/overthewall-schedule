import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveMembers, type Member } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";

export function useScheduleData() {
  const membersQuery = currentContentQuery(useQuery<Member[]>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,

  }));
  const reloadMembers = useCallback(async () => {
    await membersQuery.refetch();
  }, [membersQuery]);

  return {
    members: membersQuery.data ?? [],
    loading: membersQuery.isLoading,
    hasLoaded: membersQuery.isFetched,
    reloadMembers,
    reloadAll: reloadMembers,
  };
}
