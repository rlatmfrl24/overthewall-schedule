import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveMembers,
  type Member,
} from "@/features/members";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchNotices } from "../api/notices";
import type { Notice } from "../model/types";
import { getNoticeRelatedMemberUids } from "../model/notice-content";

export function useNoticePageData() {
  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),
    staleTime: 0,
  });
  const notices = useMemo(() => noticesQuery.data ?? [], [noticesQuery.data]);
  const hasRelatedMembers = useMemo(
    () => notices.some((notice) => getNoticeRelatedMemberUids(notice).length > 0),
    [notices],
  );
  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
    enabled: hasRelatedMembers,
  });
  const memberMap = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.uid, member])),
    [membersQuery.data],
  );
  return {
    notices,
    memberMap,
    loading: noticesQuery.isLoading,
    error: noticesQuery.error,
    refetch: noticesQuery.refetch,
  };
}
