import { useCallback, useEffect, useState } from "react";
import { fetchNaverCafePostsConfig } from "@/lib/api/naver-cafe";
import type { NaverCafePostsVisibility } from "@/lib/types";

export const NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT =
  "otw:naver-cafe-posts-config-updated";

type NaverCafePostsConfigState = {
  enabled: boolean;
  visibility: NaverCafePostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const isVisibility = (value: unknown): value is NaverCafePostsVisibility =>
  value === "public" || value === "members" || value === "private";

export function useNaverCafePostsConfig(): NaverCafePostsConfigState {
  const [enabled, setEnabled] = useState(true);
  const [visibility, setVisibility] =
    useState<NaverCafePostsVisibility>("members");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const config = await fetchNaverCafePostsConfig({ force });
      setEnabled(config.enabled);
      setVisibility(config.visibility);
      setError(null);
    } catch (loadError) {
      console.error("Failed to load Naver Cafe posts config:", loadError);
      setEnabled(true);
      setVisibility("members");
      setError("카페 최신글 공개 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          enabled?: unknown;
          visibility?: unknown;
        }>
      ).detail;

      if (typeof detail?.enabled === "boolean") {
        setEnabled(detail.enabled);
      }
      if (isVisibility(detail?.visibility)) {
        setVisibility(detail.visibility);
      }
      if (
        typeof detail?.enabled === "boolean" ||
        isVisibility(detail?.visibility)
      ) {
        setError(null);
        setLoading(false);
        return;
      }
      void load(true);
    };

    window.addEventListener(
      NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT,
      handleConfigUpdate,
    );
    return () =>
      window.removeEventListener(
        NAVER_CAFE_POSTS_CONFIG_UPDATED_EVENT,
        handleConfigUpdate,
      );
  }, [load]);

  return {
    enabled,
    visibility,
    loading,
    error,
    reload: () => load(true),
  };
}
