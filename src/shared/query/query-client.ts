import { QueryClient } from "@tanstack/react-query";

export const QUERY_STALE_TIME_MS = 60_000;
export const QUERY_GC_TIME_MS = 10 * 60_000;
export const MEDIA_QUERY_STALE_TIME_MS = 5 * 60_000;
export const MEMBER_POSTS_QUERY_STALE_TIME_MS = 30 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: QUERY_STALE_TIME_MS,
      gcTime: QUERY_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});
