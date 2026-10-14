import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveMembers } from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";

export function useOtwPlayMemberColors() {
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,

    select: members => new Map(members.map(member => [member.uid, member.main_color])),
  }));
}
