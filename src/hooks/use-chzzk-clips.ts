import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllMembersClips } from "@/lib/api/clips";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { Member } from "@/lib/types";
import { extractChzzkChannelId } from "@/lib/utils";

type UseAllMembersClipsOptions = {
  enabled?: boolean;
};

const getChzzkChannelIdsKey = (members: Member[]) =>
  members
    .map((member) => extractChzzkChannelId(member.url_chzzk))
    .filter((channelId): channelId is string => Boolean(channelId))
    .sort()
    .join(",");

export function useAllMembersClips(
  members: Member[],
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
