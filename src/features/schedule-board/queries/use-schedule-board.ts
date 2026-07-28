import { useQuery } from "@tanstack/react-query";
import { QUERY_STALE_TIME_MS } from "@/shared/query/query-client";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchScheduleBoard } from "../api/schedule-board";

export function useScheduleBoard(startDate: string, endDate: string) {
  const query = useQuery({
    queryKey: queryKeys.schedules.board(startDate, endDate),
    queryFn: () => fetchScheduleBoard(startDate, endDate),
    staleTime: QUERY_STALE_TIME_MS,
  });

  return {
    board: query.data ?? null,
    members: query.data?.members ?? [],
    ddays: query.data?.ddays ?? [],
    notices: query.data?.notices ?? [],
    schedules: query.data?.schedules ?? [],
    loading: query.isLoading,
    fetching: query.isFetching,
    hasLoaded: query.isFetched,
    error: query.error,
    refetch: query.refetch,
  };
}
