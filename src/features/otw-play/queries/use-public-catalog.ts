import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { OtwPlayPublicCatalogQuery } from "@contracts/otw-play";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchOtwPlayCatalog,
  fetchOtwPlayConfig,
  fetchOtwPlayFacets,
  fetchOtwPlayPerformance,
  fetchOtwPlaySong,
  getOtwPlayCatalogQueryKey,
} from "../api/public";

const PUBLIC_QUERY_STALE_TIME_MS = 60_000;
const SEARCH_QUERY_STALE_TIME_MS = 30_000;

type PublicQueryOptions = {
  enabled?: boolean;
};

export type OtwPlayCatalogBaseQuery = Omit<
  OtwPlayPublicCatalogQuery,
  "cursor"
>;

export function useOtwPlayConfig(options: PublicQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.otwPlay.config(),
    queryFn: fetchOtwPlayConfig,
    enabled: options.enabled ?? true,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlayCatalog(
  query: OtwPlayCatalogBaseQuery = {},
  options: PublicQueryOptions = {},
) {
  const canonicalQuery = getOtwPlayCatalogQueryKey(query);
  const hasSearch = Boolean(query.q?.trim());

  return useInfiniteQuery({
    queryKey: queryKeys.otwPlay.catalog(canonicalQuery),
    queryFn: ({ pageParam }) =>
      fetchOtwPlayCatalog({
        ...query,
        cursor: pageParam ?? undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options.enabled ?? true,
    staleTime: hasSearch
      ? SEARCH_QUERY_STALE_TIME_MS
      : PUBLIC_QUERY_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function useOtwPlayFacets(options: PublicQueryOptions = {}) {
  return useQuery({
    queryKey: queryKeys.otwPlay.facets(),
    queryFn: fetchOtwPlayFacets,
    enabled: options.enabled ?? true,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlaySong(
  slug: string,
  options: PublicQueryOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.otwPlay.song(slug),
    queryFn: () => fetchOtwPlaySong(slug),
    enabled: (options.enabled ?? true) && slug.trim().length > 0,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlayPerformance(
  id: string,
  options: PublicQueryOptions = {},
) {
  return useQuery({
    queryKey: queryKeys.otwPlay.performance(id),
    queryFn: () => fetchOtwPlayPerformance(id),
    enabled: (options.enabled ?? true) && id.trim().length > 0,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}
