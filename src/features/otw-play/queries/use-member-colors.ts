import { useQuery } from "@tanstack/react-query";
import { fetchActiveMembers } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";

export function useOtwPlayMemberColors() {
  return useQuery({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
    select: members => new Map(members.map(member => [member.uid, member.main_color])),
  });
}
