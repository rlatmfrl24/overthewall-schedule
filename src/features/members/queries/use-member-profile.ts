import { useQuery } from "@tanstack/react-query";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchMemberProfile } from "../api/members";

export function useMemberProfile(code: string) {
  return useQuery({
    queryKey: queryKeys.members.profile(code),
    queryFn: () => fetchMemberProfile(code),
    staleTime: QUERY_STALE_TIME_MS,
  });
}
