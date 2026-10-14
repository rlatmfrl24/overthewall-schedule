import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveMembers,
  type Member,
} from "@/features/members";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchNotices } from "../api/notices";
import type { Notice } from "../model/types";
import { getNoticeRelatedMemberUids } from "../model/notice-content";

export function useNoticePageData() {
  const noticesQuery = currentContentQuery(useQuery<Notice[]>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),

  }));
  const notices = useMemo(() => noticesQuery.data ?? [], [noticesQuery.data]);
  const hasRelatedMembers = useMemo(
    () => notices.some((notice) => getNoticeRelatedMemberUids(notice).length > 0),
    [notices],
  );
  const membersQuery = currentContentQuery(useQuery<Member[]>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,

    enabled: hasRelatedMembers,
  }));
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
