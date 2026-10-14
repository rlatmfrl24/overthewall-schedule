import React, { type ImgHTMLAttributes } from "react";
import { useAuthenticatedImage } from "@/shared/hooks/use-authenticated-image";

export function AuthenticatedImage({ src, srcSet, protectedImage = true, ...props }: ImgHTMLAttributes<HTMLImageElement> & { protectedImage?: boolean }) {
  const resolved = useAuthenticatedImage(src, protectedImage);
  return React.createElement("img", { ...props, src: resolved, srcSet: protectedImage ? undefined : srcSet });
}
