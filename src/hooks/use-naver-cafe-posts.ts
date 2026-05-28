import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchNaverCafePosts } from "@/lib/api/naver-cafe";
import type { NaverCafePost, NaverCafePostsResponse } from "@/lib/types";

interface UseNaverCafePostsReturn {
  posts: NaverCafePost[];
  sources: NaverCafePostsResponse["sources"];
  updatedAt: string | null;
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

export function useNaverCafePosts(
  options: { enabled?: boolean; size?: number; admin?: boolean } = {},
): UseNaverCafePostsReturn {
  const [data, setData] = useState<NaverCafePostsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const dataRef = useRef<NaverCafePostsResponse | null>(null);

  const { enabled = true, size = 10, admin = false } = options;

  const load = useCallback(
    async (force: boolean) => {
      const currentData = dataRef.current;
      if (!enabled) {
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchNaverCafePosts({ force, size, admin });
        setData(response);
        setError(
          response.clientStale
            ? "새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
            : null,
        );
      } catch (err) {
        console.error("Failed to fetch Naver Cafe posts:", err);
        setError(
          currentData
            ? "새 카페글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
            : "카페 최신글을 불러오는데 실패했습니다.",
        );
      } finally {
        setLoading(false);
        setHasLoaded(true);
      }
    },
    [admin, enabled, size],
  );

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }
    void load(false);
  }, [enabled, load]);

  return {
    posts: data?.posts ?? [],
    sources: data?.sources ?? [],
    updatedAt: data?.updatedAt ?? null,
    loading,
    error,
    stale:
      Boolean(data?.clientStale) ||
      Boolean(data?.sources.some((source) => source.stale)),
    hasLoaded,
    reload,
  };
}

export function filterNaverCafePostsByMembers(
  posts: NaverCafePost[],
  selectedMemberUids: number[] | null,
) {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return posts;
  }

  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== null && uidSet.has(post.memberUid),
  );
}

export function useFilteredNaverCafePosts(
  posts: NaverCafePost[],
  selectedMemberUids: number[] | null,
) {
  return useMemo(
    () => filterNaverCafePostsByMembers(posts, selectedMemberUids),
    [posts, selectedMemberUids],
  );
}
