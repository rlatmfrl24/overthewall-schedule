import { useQuery } from "@tanstack/react-query";
import { fetchScheduleBoard } from "@/lib/api/schedule-board";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

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
