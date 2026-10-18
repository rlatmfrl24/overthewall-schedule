import React, { useCallback, useState, type ImgHTMLAttributes } from "react";
import { useAuthenticatedImageStates } from "@/shared/hooks/use-authenticated-image";
import type {ProtectedAssetReferenceContext} from "@contracts/assets";
import { useContentSession } from "@/shared/hooks/content-session";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "./skeleton";

export function AuthenticatedImage({ src, srcSet, protectedImage = true,referenceContext, showPlaceholder = false, className, style, onLoad, onError, alt, ...props }: ImgHTMLAttributes<HTMLImageElement> & { protectedImage?: boolean;referenceContext?:ProtectedAssetReferenceContext;showPlaceholder?: boolean }) {
  const resource = useAuthenticatedImageStates(src ? [src] : [], protectedImage, referenceContext)(src);
  const session=useContentSession();
  const resolvedSrcSet = protectedImage || session ? undefined : srcSet;
  const identity = JSON.stringify([src, resource.src, resolvedSrcSet, protectedImage, referenceContext, session]);
  const [settled, setSettled] = useState<{ identity: string; failed: boolean } | null>(null);
  const loaded = settled?.identity === identity && !settled.failed;
  const failed = resource.failed || settled?.identity === identity && settled.failed;
  const checkCachedImage = useCallback((image: HTMLImageElement | null) => {
    if (resource.src && image?.complete) setSettled({ identity, failed: image.naturalWidth === 0 });
  }, [identity, resource.src]);

  if (!showPlaceholder) {
    return React.createElement("img", { ...props, className, style, onLoad, onError, alt, src: resource.src, srcSet: resolvedSrcSet });
  }

  return (
    <span className={cn("relative inline-block overflow-hidden object-cover", className)} style={style} aria-busy={!loaded && !failed}
      role={!loaded && alt ? "img" : undefined}
      aria-label={!loaded && alt ? `${alt} ${failed ? "이미지를 불러올 수 없습니다" : "이미지 불러오는 중"}` : undefined}>
      {!loaded && <Skeleton aria-hidden="true" className={cn("absolute inset-0 size-full rounded-[inherit]", failed && "animate-none")} />}
      <img {...props} key={identity} ref={checkCachedImage} src={resource.src} srcSet={resolvedSrcSet} alt={alt}
        aria-hidden={!loaded ? true : undefined} className={cn("size-full rounded-[inherit]", !loaded && "invisible")}
        style={{ objectFit: "inherit", objectPosition: "inherit" }}
        onLoad={event => { setSettled({ identity, failed: false }); onLoad?.(event); }}
        onError={event => { setSettled({ identity, failed: true }); onError?.(event); }} />
    </span>
  );
}
