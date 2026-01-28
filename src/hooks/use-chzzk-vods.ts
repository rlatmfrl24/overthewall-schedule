import { useCallback, useEffect, useState } from "react";
import { fetchAllMembersLatestVideos } from "@/lib/api/vods";
import type { ChzzkVideo, Member } from "@/lib/types";

type UseAllMembersLatestVodsOptions = {
  enabled?: boolean;
};

/**
 * 모든 멤버의 최신 VOD를 조회하는 훅
 */
export function useAllMembersLatestVods(
  members: Member[],
  options: UseAllMembersLatestVodsOptions = {},
) {
  const [vods, setVods] = useState<Record<number, ChzzkVideo | null>>({});
  const [loading, setLoading] = useState(false);
  const { enabled = true } = options;

  const reload = useCallback(async () => {
    if (!enabled || members.length === 0) return;

    setLoading(true);
    try {
      const data = await fetchAllMembersLatestVideos(members);
      setVods(data);
    } finally {
      setLoading(false);
    }
  }, [enabled, members]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return {
    vods,
    loading,
    reload,
  };
}
