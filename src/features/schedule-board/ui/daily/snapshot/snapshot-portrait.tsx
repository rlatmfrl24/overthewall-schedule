import { useState, type CSSProperties } from "react";
import { User } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function SnapshotPortrait({ src, alt, className, style }: {
  src: string; alt: string; className: string; style?: CSSProperties;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  // A broken img also makes html-to-image reject the entire schedule export.
  return failedSrc === src
    ? <span role={alt ? "img" : undefined} aria-label={alt || undefined} className={cn(className, "inline-flex items-center justify-center bg-muted text-muted-foreground")} style={style}><User aria-hidden="true" /></span>
    : <img src={src} alt={alt} className={className} style={style} onError={() => setFailedSrc(src)} />;
}
