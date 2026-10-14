import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useUser } from "@clerk/clerk-react";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchMyOtwPlaySubmission,
  fetchMyOtwPlaySubmissions,
} from "../api/submissions";

export const useMyOtwPlaySubmissions = () => {
  const { user } = useUser();
  const userId = user?.id ?? "";
  return currentContentQuery(useInfiniteQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.memberSubmissions(userId),
    queryFn: ({ pageParam }) =>
      fetchMyOtwPlaySubmissions({ limit: 20, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: userId.length > 0,
  }));
};

export const useMyOtwPlaySubmission = (id: string | null) => {
  const { user } = useUser();
  const userId = user?.id ?? "";
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.memberSubmission(userId, id ?? ""),
    queryFn: () => fetchMyOtwPlaySubmission(id!),
    enabled: userId.length > 0 && Boolean(id),
  }));
};
