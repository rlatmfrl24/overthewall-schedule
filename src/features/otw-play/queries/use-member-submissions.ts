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
  return useInfiniteQuery({
    queryKey: queryKeys.otwPlay.memberSubmissions(userId),
    queryFn: ({ pageParam }) =>
      fetchMyOtwPlaySubmissions({ limit: 20, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: userId.length > 0,
  });
};

export const useMyOtwPlaySubmission = (id: string | null) => {
  const { user } = useUser();
  const userId = user?.id ?? "";
  return useQuery({
    queryKey: queryKeys.otwPlay.memberSubmission(userId, id ?? ""),
    queryFn: () => fetchMyOtwPlaySubmission(id!),
    enabled: userId.length > 0 && Boolean(id),
  });
};
