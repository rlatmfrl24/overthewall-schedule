import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchActiveMembers,
  fetchMemberProfile,
  type Member,
} from "@/features/members";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchNotices } from "../api/notices";
import type { Notice } from "../model/types";

export function useNoticePageData() {
  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),
    staleTime: 0,
  });
  const notices = useMemo(() => noticesQuery.data ?? [], [noticesQuery.data]);
  const hasMemberPublisher = useMemo(
    () => notices.some((notice) => notice.publisher_type === "member"),
    [notices],
  );
  const membersQuery = useQuery<Member[]>({
    queryKey: queryKeys.members.active(),
    queryFn: fetchActiveMembers,
    staleTime: QUERY_STALE_TIME_MS,
    enabled: hasMemberPublisher,
  });
  const memberMap = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.uid, member])),
    [membersQuery.data],
  );
  const publisherMemberUids = useMemo(
    () =>
      Array.from(
        new Set(
          notices
            .map((notice) =>
              notice.publisher_type === "member"
                ? notice.publisher_member_uid
                : null,
            )
            .filter((uid): uid is number => typeof uid === "number" && uid > 0),
        ),
      ).sort((a, b) => a - b),
    [notices],
  );
  const publisherProfilesQuery = useQuery<Array<[number, string]>>({
    queryKey: queryKeys.members.noticePublisherProfiles(
      publisherMemberUids.join(","),
    ),
    queryFn: async () => {
      const membersByUid = new Map(
        (membersQuery.data ?? []).map((member) => [member.uid, member]),
      );
      const profiles = await Promise.all(
        publisherMemberUids.map(async (uid) => {
          const member = membersByUid.get(uid);
          if (!member) return null;
          try {
            const profile = await fetchMemberProfile(member.code);
            const imageUrl = profile.profileImages[0]?.imageUrl;
            return imageUrl ? ([uid, imageUrl] as [number, string]) : null;
          } catch {
            return null;
          }
        }),
      );
      return profiles.filter((item): item is [number, string] => item !== null);
    },
    staleTime: QUERY_STALE_TIME_MS,
    enabled:
      publisherMemberUids.length > 0 && (membersQuery.data?.length ?? 0) > 0,
  });
  const profileImageMap = useMemo(
    () => new Map(publisherProfilesQuery.data ?? []),
    [publisherProfilesQuery.data],
  );

  return {
    notices,
    memberMap,
    profileImageMap,
    loading: noticesQuery.isLoading,
    error: noticesQuery.error,
    refetch: noticesQuery.refetch,
  };
}
