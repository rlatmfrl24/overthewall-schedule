import React, { type ImgHTMLAttributes } from "react";
import { useAuthenticatedImage } from "@/shared/hooks/use-authenticated-image";
import type {ProtectedAssetReferenceContext} from "@contracts/assets";
import { useContentSession } from "@/shared/hooks/content-session";

export function AuthenticatedImage({ src, srcSet, protectedImage = true,referenceContext, ...props }: ImgHTMLAttributes<HTMLImageElement> & { protectedImage?: boolean;referenceContext?:ProtectedAssetReferenceContext }) {
  const resolved = useAuthenticatedImage(src, protectedImage,referenceContext);
  const session=useContentSession();
  return React.createElement("img", { ...props, src: resolved, srcSet: protectedImage || session ? undefined : srcSet });
}
