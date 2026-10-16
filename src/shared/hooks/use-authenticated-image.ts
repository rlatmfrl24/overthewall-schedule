import { useEffect, useMemo, useState } from "react";
import { apiFetch,apiFetchBlob } from "@/shared/api/client";
import {apiRoutes} from "@contracts/api-routes";
import type {ProtectedAssetReferenceResponse,ProtectedAssetReferenceContext} from "@contracts/assets";
import { useContentSession } from "./content-session";
const resolvable=(src:string)=>src.trim().startsWith("/") || src.trim().startsWith("\\") || /^https?:/i.test(src.trim());
const ownPath=(src:string)=>{
  try {const url=new URL(src.trim(),window.location.origin);return url.origin===window.location.origin && ["/profile/","/r2-assets/"].some(prefix=>url.pathname.startsWith(prefix))?`${url.pathname}${url.search}`:null;}
  catch {return null;}
};

export function useAuthenticatedImages(sources: readonly string[], protectedImage: boolean,context?:ProtectedAssetReferenceContext) {
  const session=useContentSession();
  const key = JSON.stringify(sources);
  const contextKey=JSON.stringify(context??null);
  const identity = useMemo(() => ({ key, protectedImage,contextKey,session }), [key, protectedImage,contextKey,session]);
  const [loaded, setLoaded] = useState<{ identity: typeof identity; urls: Record<string, string> } | null>(null);
  useEffect(() => {
    if (!identity.protectedImage && !identity.session) return;
    const controller = new AbortController();
    const urls: Record<string, string> = {};
    const objectUrls:string[]=[];
    for (const src of new Set(JSON.parse(identity.key) as string[])) {
      if(!resolvable(src)) continue;
      if(!identity.protectedImage && !ownPath(src)) continue;
      void (async()=>{
        const value=src.trim();
        const path=!identity.protectedImage?ownPath(src):value.startsWith("/")&&!value.startsWith("//")?value:(await apiFetch<ProtectedAssetReferenceResponse>(`${apiRoutes.assets.protectedReference.build()}?url=${encodeURIComponent(src)}${identity.contextKey==="null"?"":`&context=${encodeURIComponent(identity.contextKey)}`}`,{signal:controller.signal})).path;
        if(controller.signal.aborted) return;
        if(path===null) {urls[src]=src;setLoaded({identity,urls:{...urls}});return;}
        if(!path.startsWith("/") || path.startsWith("//") || new URL(path,window.location.origin).origin!==window.location.origin) throw new Error("Protected image requires a same-site path");
        const blob=await apiFetchBlob(identity.protectedImage?`${path}${path.includes("?") ? "&" : "?"}archive=1`:path, { signal: controller.signal,redirect:"error" });
        if (controller.signal.aborted) return;
        urls[src] = URL.createObjectURL(blob);
        objectUrls.push(urls[src]);
        setLoaded({ identity, urls: { ...urls } });
      })().catch(() => { /* Failed protected bytes remain unavailable. */ });
    }
    return () => { controller.abort(); objectUrls.forEach(url => URL.revokeObjectURL(url)); };
  }, [identity]);
  return (src: string | undefined) => src && (protectedImage && resolvable(src) || Boolean(session) && ownPath(src))
    ? loaded?.identity === identity ? loaded.urls[src] : undefined : src;
}

export const useAuthenticatedImage = (src: string | undefined, protectedImage: boolean,context?:ProtectedAssetReferenceContext) => useAuthenticatedImages(src ? [src] : [], protectedImage,context)(src);
