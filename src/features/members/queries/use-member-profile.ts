import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchMemberProfile } from "../api/members";

export function useMemberProfile(code: string, includeArchived = false) {
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: includeArchived ? [...queryKeys.members.admin(), "profile", code] : queryKeys.members.profile(code),
    queryFn: () => fetchMemberProfile(code, includeArchived),

  }));
}
