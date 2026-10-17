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
type ImageRequest = { users: number; controller: AbortController; promise: Promise<string>; objectUrl?: string };
// Private bytes live only while mounted consumers in the same content session own them.
const imageRequests = new Map<string | symbol, ImageRequest>();

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
    const releases: (() => void)[] = [];
    for (const src of new Set(JSON.parse(identity.key) as string[])) {
      if(!resolvable(src)) continue;
      if(!identity.protectedImage && !ownPath(src)) continue;
      const requestKey = identity.session ? JSON.stringify([window.location.origin, identity.session, identity.protectedImage, identity.contextKey, src]) : Symbol();
      let request = imageRequests.get(requestKey);
      if (!request) {
        const resource: ImageRequest = { users: 0, controller: new AbortController(), promise: Promise.resolve("") };
        const signal = resource.controller.signal;
        resource.promise = (async()=>{
        const value=src.trim();
        const path=!identity.protectedImage?ownPath(src):value.startsWith("/")&&!value.startsWith("//")?value:(await apiFetch<ProtectedAssetReferenceResponse>(`${apiRoutes.assets.protectedReference.build()}?url=${encodeURIComponent(src)}${identity.contextKey==="null"?"":`&context=${encodeURIComponent(identity.contextKey)}`}`,{signal})).path;
        signal.throwIfAborted();
        if(path===null) return src;
        if(!path.startsWith("/") || path.startsWith("//") || new URL(path,window.location.origin).origin!==window.location.origin) throw new Error("Protected image requires a same-site path");
        const blob=await apiFetchBlob(identity.protectedImage?`${path}${path.includes("?") ? "&" : "?"}archive=1`:path, { signal,redirect:"error" });
        signal.throwIfAborted();
        resource.objectUrl = URL.createObjectURL(blob);
        return resource.objectUrl;
        })().catch(error => {
          if (imageRequests.get(requestKey) === resource) imageRequests.delete(requestKey);
          throw error;
        });
        request = resource;
        imageRequests.set(requestKey, resource);
      }
      const resource = request;
      resource.users++;
      releases.push(() => {
        if (--resource.users) return;
        if (imageRequests.get(requestKey) === resource) imageRequests.delete(requestKey);
        resource.controller.abort();
        if (resource.objectUrl) URL.revokeObjectURL(resource.objectUrl);
      });
      void resource.promise.then(url => {
        if (controller.signal.aborted) return;
        urls[src] = url;
        setLoaded({ identity, urls: { ...urls } });
      }).catch(() => { /* Failed protected bytes remain unavailable. */ });
    }
    return () => { controller.abort(); releases.forEach(release => release()); };
  }, [identity]);
  return (src: string | undefined) => src && (protectedImage && resolvable(src) || Boolean(session) && ownPath(src))
    ? loaded?.identity === identity ? loaded.urls[src] : undefined : src;
}

export const useAuthenticatedImage = (src: string | undefined, protectedImage: boolean,context?:ProtectedAssetReferenceContext) => useAuthenticatedImages(src ? [src] : [], protectedImage,context)(src);
