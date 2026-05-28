import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMembersXPosts } from "@/lib/api/x";
import type { Member, XPost, XPostsResponse } from "@/lib/types";

interface UseXPostsReturn {
  posts: XPost[];
  updatedAt: string | null;
  byHandle: XPostsResponse["byHandle"];
  loading: boolean;
  error: string | null;
  stale: boolean;
  hasLoaded: boolean;
  reload: () => Promise<void>;
}

export function useXPosts(
  members: Member[],
  options: { enabled?: boolean; maxResults?: number } = {},
): UseXPostsReturn {
  const [data, setData] = useState<XPostsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const dataRef = useRef<XPostsResponse | null>(null);

  const { enabled = true, maxResults = 5 } = options;
  const twitterUrlsKey = useMemo(
    () =>
      members
        .map((member) => member.url_twitter ?? "")
        .sort()
        .join(","),
    [members],
  );

  const load = useCallback(async (force: boolean) => {
    const currentData = dataRef.current;
    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    if (members.length === 0) {
      setData(null);
      setLoading(false);
      setError(null);
      setHasLoaded(true);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetchMembersXPosts(members, { force, maxResults });
      if (response) {
        setData(response);
        setError(
          response.clientStale
            ? "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
            : null,
        );
      } else if (!currentData) {
        setData({
          posts: [],
          updatedAt: new Date().toISOString(),
          byHandle: [],
        });
      }
    } catch (err) {
      console.error("Failed to fetch X posts:", err);
      setError(
        currentData
          ? "새 게시글을 불러오지 못해 이전 데이터를 표시하고 있습니다."
          : "X 게시글을 불러오는데 실패했습니다.",
      );
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [enabled, members, maxResults]);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (enabled) return;
    setLoading(false);
    setError(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load(false);
  }, [enabled, twitterUrlsKey, load]);

  return {
    posts: data?.posts ?? [],
    updatedAt: data?.updatedAt ?? null,
    byHandle: data?.byHandle ?? [],
    loading,
    error,
    stale:
      Boolean(data?.clientStale) ||
      Boolean(data?.byHandle.some((item) => item.stale)),
    hasLoaded,
    reload,
  };
}

export function filterXPostsByMembers(
  posts: XPost[],
  selectedMemberUids: number[] | null,
): XPost[] {
  if (!selectedMemberUids || selectedMemberUids.length === 0) {
    return posts;
  }

  const uidSet = new Set(selectedMemberUids);
  return posts.filter(
    (post) => post.memberUid !== undefined && uidSet.has(post.memberUid),
  );
}

export function useFilteredXPosts(
  posts: XPost[],
  selectedMemberUids: number[] | null,
) {
  return useMemo(
    () => filterXPostsByMembers(posts, selectedMemberUids),
    [posts, selectedMemberUids],
  );
}
