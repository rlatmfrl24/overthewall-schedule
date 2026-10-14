import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import { fetchScheduleBoard } from "../api/schedule-board";

export function useScheduleBoard(startDate: string, endDate: string, includeArchived = false) {
  const query = currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: includeArchived ? [...queryKeys.schedules.board(startDate, endDate), "admin-archive"] : queryKeys.schedules.board(startDate, endDate),
    queryFn: () => fetchScheduleBoard(startDate, endDate, includeArchived),

  }));

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
