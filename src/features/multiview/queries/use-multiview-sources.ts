import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchLiveStatusesForMembers,
  type ChzzkLiveStatusMap,
} from "@/features/chzzk";
import { queryKeys } from "@/shared/query/query-keys";
import type { Member } from "@/features/members";
import { extractMultiviewChzzkChannelId } from "../model/multiview-utils";
import type { MultiviewSource } from "../model/types";
import type { SavedMultiviewChannel, MultiviewLiveStatusItemDto } from "@contracts/multiview";

const UNIT_ORDER = [
  ["스타데이즈", "stardays", "star days"],
  ["러브다이아", "럽다", "리브다이아", "luvdia", "luv dia"],
  ["하이블루밍", "하블", "hiblueming", "hi blueming", "hi-blueming"],
];
const MULTIVIEW_LIVE_STATUS_REFETCH_INTERVAL_MS = 90_000;

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
    if (!a.member && !b.member) return (a.saved?.addedAt ?? 0) - (b.saved?.addedAt ?? 0) || a.channelId.localeCompare(b.channelId);
    if (Boolean(a.member) !== Boolean(b.member)) return a.member ? -1 : 1;

    const unitRankDiff =
      getUnitRank(a.member?.unit_name) - getUnitRank(b.member?.unit_name);
    if (unitRankDiff !== 0) return unitRankDiff;

    return (a.member?.name ?? a.channelId).localeCompare(
      b.member?.name ?? b.channelId,
      "ko-KR",
    );
  });

export function useMultiviewSources(members: Member[], personal?: { channels: SavedMultiviewChannel[]; statuses: MultiviewLiveStatusItemDto[]; loading: boolean; isError: boolean }) {
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

  const query = currentContentQuery(useQuery<ChzzkLiveStatusMap>({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.liveStatus.statuses(channelIdsKey, "multiview"),
    queryFn: () => fetchLiveStatusesForMembers(membersWithChzzk),
    enabled: membersWithChzzk.length > 0,
    refetchInterval: MULTIVIEW_LIVE_STATUS_REFETCH_INTERVAL_MS,
    refetchIntervalInBackground: false,

  }));

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
          statusError: query.isError,
          liveStatus,
          isLive: liveStatus?.status === "OPEN",
        };
      })
      .filter((source): source is MultiviewSource => source !== null);

    const combined = new Map(nextSources.map(source => [source.channelId, source]));
    const statuses = new Map(personal?.statuses.map(item => [item.channelId, item.content]));
    for (const saved of personal?.channels ?? []) {
      const existing = combined.get(saved.channelId);
      const liveStatus = existing?.liveStatus ?? (personal?.isError ? null : statuses.get(saved.channelId) ?? null);
      combined.set(saved.channelId, existing ? { ...existing, saved, liveStatus, isLive: liveStatus?.status === "OPEN", statusError: liveStatus ? false : existing.statusError } : { channelId: saved.channelId, saved, liveStatus, isLive: liveStatus?.status === "OPEN", statusError: personal?.isError ?? false });
    }
    return sortMultiviewSources([...combined.values()]);
  }, [membersWithChzzk, query.data, query.isError, personal]);

  return {
    sources,
    loading: query.isFetching || Boolean(personal?.loading),
    isError: query.isError || Boolean(personal?.isError),
    hasLoaded: (membersWithChzzk.length === 0 || query.isFetched) && !personal?.loading,
    reload: query.refetch,
  };
}
