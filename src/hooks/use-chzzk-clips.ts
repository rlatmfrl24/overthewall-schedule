import { useCallback, useEffect, useState } from "react";
import { fetchAllMembersClips } from "@/lib/api/clips";
import type { ChzzkClip, Member } from "@/lib/types";

type UseAllMembersClipsOptions = {
  enabled?: boolean;
};

/**
 * 모든 멤버의 최신 클립을 조회하는 훅
 * @param members 멤버 목록
 * @param clipsPerMember 멤버당 가져올 클립 수 (기본 10개)
 */
export function useAllMembersClips(
  members: Member[],
  clipsPerMember = 10,
  options: UseAllMembersClipsOptions = {},
) {
  const [clips, setClips] = useState<ChzzkClip[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const { enabled = true } = options;

  const reload = useCallback(async () => {
    if (!enabled || members.length === 0) return;

    setLoading(true);
    try {
      const data = await fetchAllMembersClips(members, clipsPerMember);
      setClips(data);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [enabled, members, clipsPerMember]);

  useEffect(() => {
    if (!enabled) return;
    void reload();
  }, [enabled, reload]);

  return {
    clips,
    loading,
    hasLoaded,
    reload,
  };
}
