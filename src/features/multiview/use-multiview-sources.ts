import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLiveStatusesForMembers } from "@/lib/api/live-status";
import { MEDIA_QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import type { ChzzkLiveStatusMap, Member } from "@/lib/types";
import { extractMultiviewChzzkChannelId } from "./multiview-utils";
import type { MultiviewSource } from "./types";

const UNIT_ORDER = [
  ["스타데이즈", "stardays", "star days"],
  ["러브다이아", "럽다", "리브다이아", "luvdia", "luv dia"],
  ["하이블루밍", "하블", "hiblueming", "hi blueming", "hi-blueming"],
];

const normalizeUnitName = (value?: string | null) =>
  value?.toLowerCase().replace(/[\s_-]/g, "") ?? "";

const getUnitRank = (unitName?: string | null) => {
  const normalized = normalizeUnitName(unitName);
  if (!normalized) return UNIT_ORDER.length;

  const index = UNIT_ORDER.findIndex((aliases) =>
    aliases.some((alias) => normalized.includes(normalizeUnitName(alias))),
  );

  return index === -1 ? UNIT_ORDER.length : index;
};

export const sortMultiviewSources = (sources: MultiviewSource[]) =>
  [...sources].sort((a, b) => {
    if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;

    const unitRankDiff =
      getUnitRank(a.member?.unit_name) - getUnitRank(b.member?.unit_name);
    if (unitRankDiff !== 0) return unitRankDiff;

    return (a.member?.name ?? a.channelId).localeCompare(
      b.member?.name ?? b.channelId,
      "ko-KR",
    );
  });

export function useMultiviewSources(members: Member[]) {
  const membersWithChzzk = useMemo(
    () =>
      members.filter((member) =>
        Boolean(extractMultiviewChzzkChannelId(member.url_chzzk)),
      ),
    [members],
  );

  const channelIdsKey = useMemo(
    () =>
      membersWithChzzk
        .map((member) => extractMultiviewChzzkChannelId(member.url_chzzk))
        .filter((value): value is string => Boolean(value))
        .sort()
        .join(","),
    [membersWithChzzk],
  );

  const query = useQuery<ChzzkLiveStatusMap>({
    queryKey: queryKeys.liveStatus.statuses(channelIdsKey, "multiview"),
    queryFn: () => fetchLiveStatusesForMembers(membersWithChzzk),
    enabled: membersWithChzzk.length > 0,
    staleTime: MEDIA_QUERY_STALE_TIME_MS,
  });

  const sources = useMemo(() => {
    const liveStatuses = query.data ?? {};
    const nextSources = membersWithChzzk
      .map((member): MultiviewSource | null => {
        const channelId = extractMultiviewChzzkChannelId(member.url_chzzk);
        if (!channelId) return null;

        const liveStatus = liveStatuses[member.uid] ?? null;
        return {
          channelId,
          member,
          liveStatus,
          isLive: liveStatus?.status === "OPEN",
        };
      })
      .filter((source): source is MultiviewSource => source !== null);

    return sortMultiviewSources(nextSources);
  }, [membersWithChzzk, query.data]);

  return {
    sources,
    loading: query.isFetching,
    hasLoaded: membersWithChzzk.length === 0 ? true : query.isFetched,
    reload: query.refetch,
  };
}
