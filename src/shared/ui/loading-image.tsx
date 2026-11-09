import { useCallback, useState, type ImgHTMLAttributes, type ReactNode } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "./skeleton";

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  fallback?: ReactNode;
  pending?: boolean;
};

export function LoadingImage(props: LoadingImageProps) {
  return <ImageFrame key={JSON.stringify([props.src, props.srcSet, props.sizes])} {...props} />;
}

function ImageFrame({ src, srcSet, alt, className, style, fallback, pending, onLoad, onError, ...props }: LoadingImageProps) {
  const [settled, setSettled] = useState<"loaded" | "failed">();
  const state = settled ?? (src || srcSet || pending ? "loading" : "failed");
  const checkCachedImage = useCallback((image: HTMLImageElement | null) => {
    if (!onLoad && (src || srcSet) && image?.complete) {
      if (image.naturalWidth > 0) setSettled("loaded");
      else if (src && !onError) setSettled("failed");
    }
  }, [onLoad, onError, src, srcSet]);
  return (
    <span
      className={cn("relative inline-block overflow-hidden object-cover", className)}
      style={style}
      data-image-state={state}
      aria-busy={state === "loading"}
      role={state !== "loaded" && alt ? "img" : undefined}
      aria-label={state !== "loaded" && alt ? `${alt} ${state === "failed" ? "이미지를 불러올 수 없습니다" : "이미지 불러오는 중"}` : undefined}
    >
      {state === "loading" && <Skeleton aria-hidden="true" className="absolute inset-0 size-full rounded-[inherit] motion-reduce:animate-none" />}
      {state === "failed" && (
        <span className="absolute inset-0 grid place-items-center bg-muted" aria-hidden="true">
          {fallback ?? <ImageOff className="size-2/5 max-h-6 max-w-6 text-muted-foreground" />}
        </span>
      )}
      <img
        {...props}
        src={src || undefined}
        srcSet={srcSet}
        alt={alt}
        ref={checkCachedImage}
        className={cn("block size-full max-h-[inherit] rounded-[inherit] [object-fit:inherit] [object-position:inherit]", state !== "loaded" && "invisible")}
        style={{ objectFit: style?.objectFit && "inherit", objectPosition: style?.objectPosition && "inherit" }}
        aria-hidden={state !== "loaded" ? true : props["aria-hidden"]}
        onLoad={event => { setSettled("loaded"); onLoad?.(event); }}
        onError={event => { setSettled("failed"); onError?.(event); }}
      />
    </span>
  );
}
