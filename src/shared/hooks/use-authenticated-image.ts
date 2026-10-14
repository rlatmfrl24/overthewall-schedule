import { useEffect, useMemo, useState } from "react";
import { apiFetch,apiFetchBlob } from "@/shared/api/client";
import {apiRoutes} from "@contracts/api-routes";
import type {ProtectedAssetReferenceResponse,ProtectedAssetReferenceContext} from "@contracts/assets";
const resolvable=(src:string)=>src.trim().startsWith("/") || src.trim().startsWith("\\") || /^https?:/i.test(src.trim());

export function useAuthenticatedImages(sources: readonly string[], protectedImage: boolean,context?:ProtectedAssetReferenceContext) {
  const key = JSON.stringify(sources);
  const contextKey=JSON.stringify(context??null);
  const identity = useMemo(() => ({ key, protectedImage,contextKey }), [key, protectedImage,contextKey]);
  const [loaded, setLoaded] = useState<{ identity: typeof identity; urls: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!identity.protectedImage) return;
    const controller = new AbortController();
    const urls: Record<string, string> = {};
    const objectUrls:string[]=[];
    for (const src of new Set(JSON.parse(identity.key) as string[])) {
      if(!resolvable(src)) continue;
      void (async()=>{
        const value=src.trim();
        const path=value.startsWith("/")&&!value.startsWith("//")?value:(await apiFetch<ProtectedAssetReferenceResponse>(`${apiRoutes.assets.protectedReference.build()}?url=${encodeURIComponent(src)}${identity.contextKey==="null"?"":`&context=${encodeURIComponent(identity.contextKey)}`}`,{signal:controller.signal})).path;
        if(controller.signal.aborted) return;
        if(path===null) {urls[src]=src;setLoaded({identity,urls:{...urls}});return;}
        if(!path.startsWith("/") || path.startsWith("//") || new URL(path,window.location.origin).origin!==window.location.origin) throw new Error("Protected image requires a same-site path");
        const blob=await apiFetchBlob(`${path}${path.includes("?") ? "&" : "?"}archive=1`, { signal: controller.signal,redirect:"error" });
        if (controller.signal.aborted) return;
        urls[src] = URL.createObjectURL(blob);
        objectUrls.push(urls[src]);
        setLoaded({ identity, urls: { ...urls } });
      })().catch(() => { /* Failed protected bytes remain unavailable. */ });
    }
    return () => { controller.abort(); objectUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [identity]);
  return (src: string | undefined) => protectedImage && src && resolvable(src)
    ? loaded?.identity === identity ? loaded.urls[src] : undefined : src;
}

export const useAuthenticatedImage = (src: string | undefined, protectedImage: boolean,context?:ProtectedAssetReferenceContext) => useAuthenticatedImages(src ? [src] : [], protectedImage,context)(src);
