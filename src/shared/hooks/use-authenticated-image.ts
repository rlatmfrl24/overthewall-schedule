import { useEffect, useMemo, useState } from "react";
import { apiFetchBlob } from "@/shared/api/client";

export function useAuthenticatedImages(sources: readonly string[], protectedImage: boolean) {
  const key = JSON.stringify(sources);
  const identity = useMemo(() => ({ key, protectedImage }), [key, protectedImage]);
  const [loaded, setLoaded] = useState<{ identity: typeof identity; urls: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!identity.protectedImage) return;
    const controller = new AbortController();
    const urls: Record<string, string> = {};
    for (const src of new Set(JSON.parse(identity.key) as string[])) {
      if (!src.startsWith("/") || src.startsWith("//")) continue;
      void apiFetchBlob(`${src}${src.includes("?") ? "&" : "?"}archive=1`, { signal: controller.signal }).then(blob => {
        if (controller.signal.aborted) return;
        urls[src] = URL.createObjectURL(blob);
        setLoaded({ identity, urls: { ...urls } });
      }).catch(() => { /* Failed protected bytes remain unavailable. */ });
    }
    return () => { controller.abort(); Object.values(urls).forEach(url => URL.revokeObjectURL(url)); };
  }, [identity]);
  return (src: string | undefined) => protectedImage && src?.startsWith("/") && !src.startsWith("//")
    ? loaded?.identity === identity ? loaded.urls[src] : undefined : src;
}

export const useAuthenticatedImage = (src: string | undefined, protectedImage: boolean) => useAuthenticatedImages(src ? [src] : [], protectedImage)(src);
