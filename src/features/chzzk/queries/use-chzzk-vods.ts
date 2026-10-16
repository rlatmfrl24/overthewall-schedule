import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { queryKeys } from "@/shared/query/query-keys";
import type { MemberDto } from "@contracts/members";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  fetchAllMembersVodVideos
} from "../api/vods";
import { extractChzzkChannelId } from "../model/chzzk-url";

type UseAllMembersVodsOptions = {
  enabled?: boolean;
};

const getChzzkChannelIdsKey = (members: MemberDto[]) =>
  members
    .map((member) => extractChzzkChannelId(member.url_chzzk))
    .filter((channelId): channelId is string => Boolean(channelId))
    .sort()
    .join(",");

export function useAllMembersVods(
  members: MemberDto[],
  videosPerMember = 10,
  options: UseAllMembersVodsOptions = {},
) {
  const { enabled = true } = options;
  const channelIdsKey = useMemo(() => getChzzkChannelIdsKey(members), [members]);
  const queryEnabled = enabled && channelIdsKey.length > 0;
  const query = currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.media.chzzkVods(channelIdsKey, videosPerMember),
    queryFn: () => fetchAllMembersVodVideos(members, videosPerMember),
    enabled: queryEnabled,

  }));

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
