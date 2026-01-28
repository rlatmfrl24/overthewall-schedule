import { useCallback, useEffect, useState } from "react";
import { fetchAllMembersLatestVideos } from "@/lib/api/vods";
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
