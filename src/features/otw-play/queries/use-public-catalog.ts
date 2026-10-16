import { CONTENT_READ_QUERY_OPTIONS, currentContentQuery } from "@/shared/query/content-read-policy";
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";
import {
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type { OtwPlayPublicCatalogQuery } from "@contracts/otw-play";
import { queryKeys } from "@/shared/query/query-keys";
import {
  fetchOtwPlayMembers,
  fetchOtwPlayCatalog,
  fetchOtwPlayConfig,
  fetchOtwPlayFacets,
  fetchOtwPlayPerformance,
  fetchOtwPlaySong,
  getOtwPlayCatalogQueryKey,
} from "../api/public";


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

export const usePublicRequestOptions = (options: PublicQueryOptions = {}) => {
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
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.config(request.audience),
    queryFn: () => fetchOtwPlayConfig({ adminPreview: request.adminPreview }),
    enabled: options.enabled ?? true,

  }));
}

export function useOtwPlayCatalog(
  query: OtwPlayCatalogBaseQuery = {},
  options: PublicQueryOptions = {},
) {
  const request = usePublicRequestOptions(options);
  const canonicalQuery = getOtwPlayCatalogQueryKey(query);

  return currentContentQuery(useInfiniteQuery({ ...CONTENT_READ_QUERY_OPTIONS,
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


  }));
}

export function useOtwPlayFacets(options: PublicQueryOptions = {}) {
  const request = usePublicRequestOptions(options);
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.facets(request.audience),
    queryFn: () => fetchOtwPlayFacets({ adminPreview: request.adminPreview }),
    enabled: options.enabled ?? true,

  }));
}

export function useOtwPlaySong(
  slug: string,
  options: PublicQueryOptions = {},
  scope: "official" | "all" = "official",
) {
  const request = usePublicRequestOptions(options);
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: [...queryKeys.otwPlay.song(slug, request.audience), scope],
    queryFn: () =>
      scope === "all" ? fetchOtwPlaySong(slug, { adminPreview: request.adminPreview }, scope) : fetchOtwPlaySong(slug, { adminPreview: request.adminPreview }),
    enabled: (options.enabled ?? true) && slug.trim().length > 0,

  }));
}

export function useOtwPlayPerformance(
  id: string,
  options: PublicQueryOptions = {},
) {
  const request = usePublicRequestOptions(options);
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.performance(id, request.audience),
    queryFn: () =>
      fetchOtwPlayPerformance(id, { adminPreview: request.adminPreview }),
    enabled: (options.enabled ?? true) && id.trim().length > 0,

  }));
}

export function useOtwPlayMembers(options: PublicQueryOptions = {}) {
  const request = usePublicRequestOptions(options);
  return currentContentQuery(useQuery({ ...CONTENT_READ_QUERY_OPTIONS,
    queryKey: queryKeys.otwPlay.members(request.audience),
    queryFn: () => fetchOtwPlayMembers(request),
    enabled: options.enabled ?? true,

    retry: false,
  }));
}
