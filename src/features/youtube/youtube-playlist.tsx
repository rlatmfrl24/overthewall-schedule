import { useRef, useState, useEffect } from "react";
import type { YouTubeVideo, Member } from "@/lib/types";
import { YouTubeVideoCard } from "./youtube-video-card";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface YouTubePlaylistProps {
  title: string;
  videos: YouTubeVideo[];
  members: Member[];
  variant?: "default" | "short";
  emptyMessage?: string;
}

export const YouTubePlaylist = ({
  title,
  videos,
  members,
  variant = "default",
  emptyMessage = "동영상이 없습니다.",
}: YouTubePlaylistProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 멤버 uid -> member 매핑
  const memberMap = new Map(members.map((m) => [m.uid, m]));

  const checkScrollability = () => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  };

  useEffect(() => {
    checkScrollability();
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", checkScrollability);
      window.addEventListener("resize", checkScrollability);
    }
    return () => {
      if (el) {
        el.removeEventListener("scroll", checkScrollability);
      }
      window.removeEventListener("resize", checkScrollability);
    };
  }, [videos]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollAmount = variant === "short" ? 300 : 600;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  const accentClassName =
    variant === "short" ? "bg-fuchsia-500/80" : "bg-rose-500/80";

  if (videos.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
          <span className={cn("h-7 w-1.5 rounded-full", accentClassName)} />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {title}
            </h2>
          </div>
        </div>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={cn("h-7 w-1.5 rounded-full", accentClassName)} />
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-foreground tracking-tight">
              {title}
            </h2>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={cn(
              "w-8 h-8 rounded-full",
              "transition-all duration-200 ease-out",
              "hover:scale-110 active:scale-95",
              !canScrollLeft && "opacity-30 hover:scale-100"
            )}
            aria-label="이전"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className={cn(
              "w-8 h-8 rounded-full",
              "transition-all duration-200 ease-out",
              "hover:scale-110 active:scale-95",
              !canScrollRight && "opacity-30 hover:scale-100"
            )}
            aria-label="다음"
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 overflow-x-auto scrollbar-hide pt-1 pb-2",
          "scroll-smooth"
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {videos.map((video) => (
          <YouTubeVideoCard
            key={video.videoId}
            video={video}
            member={video.memberUid ? memberMap.get(video.memberUid) : undefined}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
};
