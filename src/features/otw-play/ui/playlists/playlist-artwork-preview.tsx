import { useState, type ReactNode } from "react";
import type { OtwPlayPublicPerformanceResponseDto } from "@contracts/otw-play";
import { LoadingImage } from "@/shared/ui/loading-image";

const DEFAULT_ARTWORK = "/images/otw-play/glass-note.png";

export function PlaylistArtwork({ imageUrl, className = "size-full", loading }: {
  imageUrl?: string | null; className?: string; loading?: "lazy" | "eager";
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>();
  const src = imageUrl && imageUrl !== failedUrl ? imageUrl : DEFAULT_ARTWORK;
  return <LoadingImage src={src} alt="" className={className} loading={loading}
    onError={() => { if (src !== DEFAULT_ARTWORK) setFailedUrl(src); }} />;
}

export function PlaylistArtworkPreview({ item, imageUrl, unavailable = false, children }: {
  item?: OtwPlayPublicPerformanceResponseDto; imageUrl: string | null; unavailable?: boolean; children?: ReactNode;
}) {
  return <div className="flex min-w-0 items-center gap-2 rounded-md border p-2" aria-label="대표이미지 미리보기">
    <PlaylistArtwork className="h-12 w-20 shrink-0 rounded object-cover" imageUrl={imageUrl} />
    <div className="min-w-0 text-xs"><p className="truncate font-medium">{unavailable ? "대표곡 교체 필요 · 자동 이미지 사용 중" : item?.song.title ?? "자동 이미지"}</p>
      {!unavailable && item && <p className="truncate text-muted-foreground">{item.performance.participants.map(p => p.displayName).join(" · ")}</p>}</div>
    {children && <div className="ml-auto shrink-0">{children}</div>}
  </div>;
}
