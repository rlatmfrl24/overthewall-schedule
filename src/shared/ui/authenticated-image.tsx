import type { ImgHTMLAttributes, ReactNode } from "react";
import { useAuthenticatedImageStates } from "@/shared/hooks/use-authenticated-image";
import type {ProtectedAssetReferenceContext} from "@contracts/assets";
import { useContentSession } from "@/shared/hooks/content-session";
import { LoadingImage } from "./loading-image";

export function AuthenticatedImage({ src, srcSet, protectedImage = true,referenceContext, showPlaceholder = false, fallback, ...props }: ImgHTMLAttributes<HTMLImageElement> & { protectedImage?: boolean;referenceContext?:ProtectedAssetReferenceContext;showPlaceholder?: boolean;fallback?: ReactNode }) {
  const resource = useAuthenticatedImageStates(src ? [src] : [], protectedImage, referenceContext)(src);
  const session=useContentSession();
  const resolvedSrcSet = protectedImage || session ? undefined : srcSet;
  if (!showPlaceholder) {
    return <img {...props} src={resource.src} srcSet={resolvedSrcSet} />;
  }

  return (
    <LoadingImage {...props} src={resource.src} srcSet={resolvedSrcSet} fallback={fallback}
      pending={Boolean(src && !resource.src && !resource.failed)} />
  );
}
