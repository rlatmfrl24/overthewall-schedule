import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchMyOtwPlaySubmission,
  fetchMyOtwPlaySubmissions,
} from "../api/submissions";

export const useMyOtwPlaySubmissions = () =>
  useInfiniteQuery({
    queryKey: queryKeys.otwPlay.memberSubmissions(),
    queryFn: ({ pageParam }) =>
      fetchMyOtwPlaySubmissions({ limit: 20, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useMyOtwPlaySubmission = (id: string | null) =>
  useQuery({
    queryKey: queryKeys.otwPlay.memberSubmission(id ?? ""),
    queryFn: () => fetchMyOtwPlaySubmission(id!),
    enabled: Boolean(id),
  });
