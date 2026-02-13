import { useRef, useState, useEffect, useMemo } from "react";
import type { YouTubeVideo, Member } from "@/lib/types";
import { YouTubeVideoCard } from "./youtube-video-card";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * 키리누키 안내 다이얼로그 버튼
 */
const KirinukiInfoButton = () => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={"sm"}
          className="h-8 rounded-full px-2 text-xs text-muted-foreground hover:bg-primary/10 sm:px-3"
          aria-label="키리누키 게시에 대한 안내"
        >
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span className="hidden sm:inline">키리누키 안내</span>
          <span className="sm:hidden">안내</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Info className="w-5 h-5" />
            키리누키 게시에 대한 안내
          </DialogTitle>
        </DialogHeader>
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              해당 사이트에 게시되는 키리누키는 제작자분들의 동의를 얻어
              게시되었습니다. 특정 키리누키 영상이 문제가 있거나, 불법적이거나
              동의되지 않은 영상이 게시된 경우,{" "}
              <strong>
                <a
                  href="mailto:397love@gmail.com"
                  className="underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  관리자
                </a>{" "}
                에게 연락주시면 최대한 빠르게 조치하겠습니다.
              </strong>
            </p>
            <div className="pt-4 mt-2 border-t">
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
                <p className="font-semibold text-primary mb-1 break-keep">
                  오버더월을 사랑해주시는 <br /> 키리누커&클리퍼분들의 참여를
                  기다리고 있습니다!
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  클리퍼 등록/문의는{" "}
                  <a href="mailto:397love@gmail.com" className="underline">
                    관리자
                  </a>{" "}
                  에게 연락해주세요.
                </p>
              </div>
            </div>
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
};

interface YouTubePlaylistProps {
  title: string;
  videos: YouTubeVideo[];
  members: Member[];
  variant?: "default" | "short";
  emptyMessage?: string;
  isKirinuki?: boolean;
}

export const YouTubePlaylist = ({
  title,
  videos,
  members,
  variant = "default",
  emptyMessage = "동영상이 없습니다.",
  isKirinuki = false,
}: YouTubePlaylistProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 멤버 uid -> member 매핑
  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

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
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("h-7 w-1.5 shrink-0 rounded-full", accentClassName)} />
            <div className="min-w-0 flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground tracking-tight">
                {title}
              </h2>
              {isKirinuki && <KirinukiInfoButton />}
            </div>
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
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn("h-7 w-1.5 shrink-0 rounded-full", accentClassName)} />
          <div className="min-w-0 flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground tracking-tight">
              {title}
            </h2>
            {isKirinuki && <KirinukiInfoButton />}
          </div>
        </div>
        <div className="hidden shrink-0 gap-1 sm:flex">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={cn(
              "w-8 h-8 rounded-full",
              "transition-all duration-200 ease-out",
              "hover:scale-110 active:scale-95",
              !canScrollLeft && "opacity-30 hover:scale-100",
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
              !canScrollRight && "opacity-30 hover:scale-100",
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
          "scroll-smooth",
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
            member={
              video.memberUid ? memberMap.get(video.memberUid) : undefined
            }
            variant={variant}
            isKirinuki={isKirinuki}
          />
        ))}
      </div>
    </div>
  );
};
