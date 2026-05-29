import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchAllMembersLatestVideos,
  fetchAllMembersVodVideos,
} from "@/lib/api/vods";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { ChzzkVideo, Member } from "@/lib/types";
import { extractChzzkChannelId } from "@/lib/utils";

type UseAllMembersVodsOptions = {
  enabled?: boolean;
};

const getChzzkChannelIdsKey = (members: Member[]) =>
  members
    .map((member) => extractChzzkChannelId(member.url_chzzk))
    .filter((channelId): channelId is string => Boolean(channelId))
    .sort()
    .join(",");

export function useAllMembersVods(
  members: Member[],
  videosPerMember = 10,
  options: UseAllMembersVodsOptions = {},
) {
  const { enabled = true } = options;
  const channelIdsKey = useMemo(() => getChzzkChannelIdsKey(members), [members]);
  const queryEnabled = enabled && channelIdsKey.length > 0;
  const query = useQuery({
    queryKey: queryKeys.media.chzzkVods(channelIdsKey, videosPerMember),
    queryFn: () => fetchAllMembersVodVideos(members, videosPerMember),
    enabled: queryEnabled,
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  const reload = useCallback(async () => {
    if (!queryEnabled) return;
    await query.refetch();
  }, [query, queryEnabled]);

  return {
    vods: queryEnabled ? query.data ?? [] : [],
    loading: queryEnabled ? query.isFetching : false,
    hasLoaded: queryEnabled ? query.isFetched : false,
    reload,
  };
}

export function useAllMembersLatestVods(
  members: Member[],
  options: UseAllMembersVodsOptions = {},
) {
  const { enabled = true } = options;
  const channelIdsKey = useMemo(() => getChzzkChannelIdsKey(members), [members]);
  const queryEnabled = enabled && channelIdsKey.length > 0;
  const query = useQuery({
    queryKey: queryKeys.media.chzzkLatestVods(channelIdsKey),
    queryFn: () => fetchAllMembersLatestVideos(members),
    enabled: queryEnabled,
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  const reload = useCallback(async () => {
    if (!queryEnabled) return;
    await query.refetch();
  }, [query, queryEnabled]);

  return {
    vods: queryEnabled ? query.data ?? {} : ({} as Record<number, ChzzkVideo | null>),
    loading: queryEnabled ? query.isFetching : false,
    hasLoaded: queryEnabled ? query.isFetched : false,
    reload,
  };
}
