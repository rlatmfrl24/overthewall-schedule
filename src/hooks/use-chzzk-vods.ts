import { useCallback, useEffect, useState } from "react";
import { fetchAllMembersLatestVideos, fetchChzzkVideos } from "@/lib/api/vods";
import { extractChzzkChannelId } from "@/lib/utils";
import type { ChzzkVideo, Member } from "@/lib/types";

/**
 * 모든 멤버의 최신 VOD를 조회하는 훅
 */
export function useAllMembersLatestVods(members: Member[]) {
  const [vods, setVods] = useState<Record<number, ChzzkVideo | null>>({});
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (members.length === 0) return;

    setLoading(true);
    try {
      const data = await fetchAllMembersLatestVideos(members);
      setVods(data);
    } finally {
      setLoading(false);
    }
  }, [members]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    vods,
    loading,
    reload,
  };
}

/**
 * 단일 멤버의 VOD 리스트를 조회하는 훅 (페이지네이션 지원)
 */
export function useMemberVods(member: Member | null) {
  const [videos, setVideos] = useState<ChzzkVideo[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const channelId = member ? extractChzzkChannelId(member.url_chzzk) : null;

  const fetchPage = useCallback(
    async (pageNum: number) => {
      if (!channelId) return;

      setLoading(true);
      try {
        const data = await fetchChzzkVideos(channelId, {
          page: pageNum,
          size: 12,
        });
        if (data) {
          setVideos(data.data);
          setPage(data.page);
          setTotalPages(data.totalPages);
          setTotalCount(data.totalCount);
        }
      } finally {
        setLoading(false);
      }
    },
    [channelId]
  );

  const reload = useCallback(() => fetchPage(0), [fetchPage]);

  const nextPage = useCallback(() => {
    if (page < totalPages - 1) {
      void fetchPage(page + 1);
    }
  }, [page, totalPages, fetchPage]);

  const prevPage = useCallback(() => {
    if (page > 0) {
      void fetchPage(page - 1);
    }
  }, [page, fetchPage]);

  const goToPage = useCallback(
    (pageNum: number) => {
      if (pageNum >= 0 && pageNum < totalPages) {
        void fetchPage(pageNum);
      }
    },
    [totalPages, fetchPage]
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    videos,
    page,
    totalPages,
    totalCount,
    loading,
    reload,
    nextPage,
    prevPage,
    goToPage,
    hasNextPage: page < totalPages - 1,
    hasPrevPage: page > 0,
  };
}
