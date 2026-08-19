import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
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
  adminPreview?: boolean;
};

const OtwPlayCatalogRequestContext = createContext({ adminPreview: false });

export function OtwPlayCatalogRequestProvider({
  adminPreview = false,
  children,
}: {
  adminPreview?: boolean;
  children: ReactNode;
}) {
  return createElement(
    OtwPlayCatalogRequestContext.Provider,
    { value: { adminPreview } },
    children,
  );
}

const usePublicRequestOptions = (options: PublicQueryOptions) => {
  const context = useContext(OtwPlayCatalogRequestContext);
  const adminPreview = options.adminPreview ?? context.adminPreview;
  return {
    adminPreview,
    audience: adminPreview ? "admin-preview" as const : "public" as const,
  };
};

export type OtwPlayCatalogBaseQuery = Omit<
  OtwPlayPublicCatalogQuery,
  "cursor"
>;

export function useOtwPlayConfig(options: PublicQueryOptions = {}) {
  const request = usePublicRequestOptions(options);
  return useQuery({
    queryKey: queryKeys.otwPlay.config(request.audience),
    queryFn: () => fetchOtwPlayConfig({ adminPreview: request.adminPreview }),
    enabled: options.enabled ?? true,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlayCatalog(
  query: OtwPlayCatalogBaseQuery = {},
  options: PublicQueryOptions = {},
) {
  const request = usePublicRequestOptions(options);
  const canonicalQuery = getOtwPlayCatalogQueryKey(query);
  const hasSearch = Boolean(query.q?.trim());

  return useInfiniteQuery({
    queryKey: queryKeys.otwPlay.catalog(canonicalQuery, request.audience),
    queryFn: ({ pageParam }) =>
      fetchOtwPlayCatalog(
        {
          ...query,
          cursor: pageParam ?? undefined,
        },
        { adminPreview: request.adminPreview },
      ),
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
  const request = usePublicRequestOptions(options);
  return useQuery({
    queryKey: queryKeys.otwPlay.facets(request.audience),
    queryFn: () => fetchOtwPlayFacets({ adminPreview: request.adminPreview }),
    enabled: options.enabled ?? true,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlaySong(
  slug: string,
  options: PublicQueryOptions = {},
) {
  const request = usePublicRequestOptions(options);
  return useQuery({
    queryKey: queryKeys.otwPlay.song(slug, request.audience),
    queryFn: () =>
      fetchOtwPlaySong(slug, { adminPreview: request.adminPreview }),
    enabled: (options.enabled ?? true) && slug.trim().length > 0,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}

export function useOtwPlayPerformance(
  id: string,
  options: PublicQueryOptions = {},
) {
  const request = usePublicRequestOptions(options);
  return useQuery({
    queryKey: queryKeys.otwPlay.performance(id, request.audience),
    queryFn: () =>
      fetchOtwPlayPerformance(id, { adminPreview: request.adminPreview }),
    enabled: (options.enabled ?? true) && id.trim().length > 0,
    staleTime: PUBLIC_QUERY_STALE_TIME_MS,
  });
}
