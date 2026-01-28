import { useRef, useState, useEffect } from "react";
import type { ChzzkClip, Member } from "@/lib/types";
import { ClipCard } from "./clip-card";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ChzzkClipsPlaylistProps {
  clips: ChzzkClip[];
  members: Member[];
  loading?: boolean;
  emptyMessage?: string;
}

export const ChzzkClipsPlaylist = ({
  clips,
  members,
  loading = false,
  emptyMessage = "클립이 없습니다.",
}: ChzzkClipsPlaylistProps) => {
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
  }, [clips]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollAmount = 550;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">치지직 클립</h2>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <ClipCardSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (clips.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">치지직 클립</h2>
        </div>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">치지직 클립</h2>
          <span className="text-sm text-muted-foreground">
            ({clips.length}개)
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={cn(
              "w-8 h-8 rounded-full",
              !canScrollLeft && "opacity-30"
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
              !canScrollRight && "opacity-30"
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
          "flex gap-4 overflow-x-auto scrollbar-hide pb-2",
          "scroll-smooth"
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {clips.map((clip) => (
          <ClipCard
            key={clip.clipUID}
            clip={clip}
            member={clip.memberUid ? memberMap.get(clip.memberUid) : undefined}
          />
        ))}
      </div>
    </section>
  );
};

const ClipCardSkeleton = () => (
  <div className="w-[260px] shrink-0 rounded-xl border border-border/50 overflow-hidden bg-card">
    <Skeleton className="aspect-video w-full" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  </div>
);
