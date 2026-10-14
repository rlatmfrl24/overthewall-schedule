import React, { type ImgHTMLAttributes } from "react";
import { useAuthenticatedImage } from "@/shared/hooks/use-authenticated-image";
import type {ProtectedAssetReferenceContext} from "@contracts/assets";

export function AuthenticatedImage({ src, srcSet, protectedImage = true,referenceContext, ...props }: ImgHTMLAttributes<HTMLImageElement> & { protectedImage?: boolean;referenceContext?:ProtectedAssetReferenceContext }) {
  const resolved = useAuthenticatedImage(src, protectedImage,referenceContext);
  return React.createElement("img", { ...props, src: resolved, srcSet: protectedImage ? undefined : srcSet });
}
