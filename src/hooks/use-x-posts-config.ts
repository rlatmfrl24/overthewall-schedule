import { useCallback, useEffect, useState } from "react";
import { fetchXPostsConfig } from "@/lib/api/x";
import type { XPostsVisibility } from "@/lib/types";

export const X_POSTS_CONFIG_UPDATED_EVENT = "otw:x-posts-config-updated";

type XPostsConfigState = {
  visibility: XPostsVisibility;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

const isXPostsVisibility = (value: unknown): value is XPostsVisibility =>
  value === "public" || value === "members" || value === "private";

export function useXPostsConfig(): XPostsConfigState {
  const [visibility, setVisibility] = useState<XPostsVisibility>("members");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const config = await fetchXPostsConfig({ force });
      setVisibility(config.visibility);
      setError(null);
    } catch (loadError) {
      console.error("Failed to load X posts config:", loadError);
      setVisibility("members");
      setError("멤버 게시글 공개 설정을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    const handleConfigUpdate = (event: Event) => {
      const visibility = (event as CustomEvent<{ visibility?: unknown }>).detail
        ?.visibility;
      if (isXPostsVisibility(visibility)) {
        setVisibility(visibility);
        setError(null);
        setLoading(false);
        return;
      }
      void load(true);
    };

    window.addEventListener(X_POSTS_CONFIG_UPDATED_EVENT, handleConfigUpdate);
    return () =>
      window.removeEventListener(
        X_POSTS_CONFIG_UPDATED_EVENT,
        handleConfigUpdate,
      );
  }, [load]);

  return {
    visibility,
    loading,
    error,
    reload: () => load(true),
  };
}
