import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { MemberDto } from "@contracts/members";
import { fetchAllMembersClips } from "../api/clips";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { extractChzzkChannelId } from "../model/chzzk-url";

type UseAllMembersClipsOptions = {
  enabled?: boolean;
};

const getChzzkChannelIdsKey = (members: MemberDto[]) =>
  members
    .map((member) => extractChzzkChannelId(member.url_chzzk))
    .filter((channelId): channelId is string => Boolean(channelId))
    .sort()
    .join(",");

export function useAllMembersClips(
  members: MemberDto[],
  clipsPerMember = 10,
  options: UseAllMembersClipsOptions = {},
) {
  const { enabled = true } = options;
  const channelIdsKey = useMemo(() => getChzzkChannelIdsKey(members), [members]);
  const queryEnabled = enabled && channelIdsKey.length > 0;
  const query = useQuery({
    queryKey: queryKeys.media.chzzkClips(channelIdsKey, clipsPerMember),
    queryFn: () => fetchAllMembersClips(members, clipsPerMember),
    enabled: queryEnabled,
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  const reload = useCallback(async () => {
    if (!queryEnabled) return;
    await query.refetch();
  }, [query, queryEnabled]);

  return {
    clips: queryEnabled ? query.data ?? [] : [],
    loading: queryEnabled ? query.isFetching : false,
    hasLoaded: queryEnabled ? query.isFetched : false,
    reload,
  };
}
