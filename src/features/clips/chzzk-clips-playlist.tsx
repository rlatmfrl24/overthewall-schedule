import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type { ChzzkClip, Member } from "@/lib/types";
import { ClipCard } from "./clip-card";
import { cn, hexToRgba } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ChzzkClipsPlaylistProps {
  clips: ChzzkClip[];
  members: Member[];
  loading?: boolean;
  emptyMessage?: string;
  selectedMemberUids?: number[] | null;
}

export const ChzzkClipsPlaylist = ({
  clips,
  members,
  loading = false,
  emptyMessage = "클립이 없습니다.",
  selectedMemberUids = null,
}: ChzzkClipsPlaylistProps) => {
  // 멤버별로 클립 그룹화
  const clipsByMember = useMemo(() => {
    const grouped = new Map<number, ChzzkClip[]>();
    clips.forEach((clip) => {
      if (clip.memberUid) {
        const list = grouped.get(clip.memberUid) || [];
        list.push(clip);
        grouped.set(clip.memberUid, list);
      }
    });
    return grouped;
  }, [clips]);

  // 클립이 있는 멤버만 필터링하고 멤버 순서 유지
  // selectedMemberUids가 있으면 해당 멤버만 표시
  const membersWithClips = useMemo(() => {
    let filtered = members.filter((m) => clipsByMember.has(m.uid));
    if (selectedMemberUids && selectedMemberUids.length > 0) {
      filtered = filtered.filter((m) => selectedMemberUids.includes(m.uid));
    }
    return filtered;
  }, [members, clipsByMember, selectedMemberUids]);

  // 필터링된 클립 총 개수
  const totalClipsCount = useMemo(() => {
    return membersWithClips.reduce(
      (acc, m) => acc + (clipsByMember.get(m.uid)?.length || 0),
      0
    );
  }, [membersWithClips, clipsByMember]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">클립</h2>
        </div>
        <div className="space-y-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <MemberClipsRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (clips.length === 0 || membersWithClips.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Scissors className="w-5 h-5 text-green-500" />
          <h2 className="text-lg font-semibold text-foreground">클립</h2>
        </div>
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {membersWithClips.length === 0 && clips.length > 0
            ? "선택한 멤버의 클립이 없습니다."
            : emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Scissors className="w-5 h-5 text-green-500" />
        <h2 className="text-lg font-semibold text-foreground">클립</h2>
        <span className="text-sm text-muted-foreground">({totalClipsCount}개)</span>
      </div>

      <div className="space-y-6">
        {membersWithClips.map((member) => (
          <MemberClipsRow
            key={member.uid}
            member={member}
            clips={clipsByMember.get(member.uid) || []}
          />
        ))}
      </div>
    </div>
  );
};

// ============ 멤버별 클립 가로 플레이리스트 ============

interface MemberClipsRowProps {
  member: Member;
  clips: ChzzkClip[];
}

const MemberClipsRow = ({ member, clips }: MemberClipsRowProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const mainColor = member.main_color || "#6366f1";
  const borderColor = hexToRgba(mainColor, 0.3);
  const bgColor = hexToRgba(mainColor, 0.05);

  const checkScrollability = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

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
  }, [clips, checkScrollability]);

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollAmount = 550;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        borderColor: borderColor,
        backgroundColor: bgColor,
      }}
    >
      {/* 멤버 헤더 */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="w-8 h-8 rounded-full border-2 object-cover"
            style={{ borderColor: mainColor }}
          />
          <span className="font-semibold text-foreground">{member.name}</span>
          <span className="text-sm text-muted-foreground">
            ({clips.length}개)
          </span>
        </div>

        {/* 스크롤 버튼 */}
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("left")}
            disabled={!canScrollLeft}
            className={cn(
              "w-7 h-7 rounded-full",
              !canScrollLeft && "opacity-30"
            )}
            aria-label="이전"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => scroll("right")}
            disabled={!canScrollRight}
            className={cn(
              "w-7 h-7 rounded-full",
              !canScrollRight && "opacity-30"
            )}
            aria-label="다음"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* 클립 리스트 */}
      <div
        ref={scrollRef}
        className={cn(
          "flex gap-4 overflow-x-auto scrollbar-hide px-4 pb-4",
          "scroll-smooth"
        )}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {clips.map((clip) => (
          <ClipCard key={clip.clipUID} clip={clip} member={member} />
        ))}
      </div>
    </div>
  );
};

// ============ 스켈레톤 컴포넌트 ============

const MemberClipsRowSkeleton = () => (
  <div className="rounded-xl border border-border/50 overflow-hidden bg-card/50">
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="w-8 h-8 rounded-full" />
      <Skeleton className="h-4 w-24" />
    </div>
    <div className="flex gap-4 px-4 pb-4 overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <ClipCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

const ClipCardSkeleton = () => (
  <div className="w-[260px] shrink-0 rounded-xl border border-border/50 overflow-hidden bg-card">
    <Skeleton className="aspect-video w-full" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  </div>
);
