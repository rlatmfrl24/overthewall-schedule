import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type { ChzzkClip, Member } from "@/lib/types";
import { ClipCard } from "./clip-card";
import {
  compareClipsByDateThenViews,
  groupClipsByDate,
} from "./clip-date-groups";
import { cn, hexToRgba, getContrastColor } from "@/lib/utils";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type ViewMode = "date" | "member";

const readCountFormatter = new Intl.NumberFormat("ko-KR");
const DATE_GROUP_GRID_ID_PREFIX = "chzzk-clips-date-group";

interface ChzzkClipsPlaylistProps {
  clips: ChzzkClip[];
  members: Member[];
  loading?: boolean;
  emptyMessage?: string;
}

// ============ 멤버 필터 칩 (내부용) ============

interface ClipsMemberFilterProps {
  members: Member[];
  selectedUids: number[] | null;
  onChange: (uids: number[] | null) => void;
}

const ClipsMemberFilter = ({
  members,
  selectedUids,
  onChange,
}: ClipsMemberFilterProps) => {
  const isAllSelected = selectedUids === null || selectedUids.length === 0;

  const handleAllClick = () => onChange(null);

  const handleMemberClick = (uid: number) => {
    if (isAllSelected) {
      onChange([uid]);
    } else if (selectedUids?.includes(uid)) {
      const newUids = selectedUids.filter((id) => id !== uid);
      onChange(newUids.length === 0 ? null : newUids);
    } else {
      onChange([...(selectedUids || []), uid]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={handleAllClick}
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium border-2",
          "transition-all duration-200 ease-out hover:scale-105",
          isAllSelected
            ? "bg-primary text-primary-foreground border-primary shadow-sm"
            : "bg-transparent text-muted-foreground border-border hover:border-primary/50",
        )}
      >
        전체
      </button>
      {members.map((member) => {
        const isSelected = selectedUids?.includes(member.uid);
        const mainColor = member.main_color || "#6366f1";
        const textColor = isSelected ? getContrastColor(mainColor) : mainColor;

        return (
          <button
            key={member.uid}
            onClick={() => handleMemberClick(member.uid)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2",
              "transition-all duration-200 ease-out hover:scale-105",
              isSelected && "shadow-sm",
            )}
            style={{
              backgroundColor: isSelected ? mainColor : "transparent",
              borderColor: mainColor,
              color: textColor,
            }}
          >
            {member.oshi_mark && (
              <span className="text-xs">{member.oshi_mark}</span>
            )}
            {member.name}
          </button>
        );
      })}
    </div>
  );
};

// ============ 섹션 헤더 ============

interface SectionHeaderProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

const ChzzkClipsSectionHeader = ({
  viewMode,
  onViewModeChange,
}: SectionHeaderProps) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/40 px-4 py-3 shadow-sm">
    <div className="flex min-w-0 items-center gap-3">
      <span className="h-7 w-1.5 shrink-0 rounded-full bg-emerald-500/80" />
      <h2 className="truncate text-lg font-semibold text-foreground tracking-tight">
        치지직 클립
      </h2>
    </div>

    <div className="flex items-center gap-2">
      {/* 뷰 모드 토글 */}
      <div className="flex rounded-lg bg-muted/70 p-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewModeChange("date")}
          className={cn(
            "h-7 w-7 p-0 rounded-md transition-all",
            viewMode === "date"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="일자별 보기"
          title="일자별 보기"
        >
          <CalendarDays className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onViewModeChange("member")}
          className={cn(
            "h-7 w-7 p-0 rounded-md transition-all",
            viewMode === "member"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label="멤버별 보기"
          title="멤버별 보기"
        >
          <Users className="w-4 h-4" />
        </Button>
      </div>
    </div>
  </div>
);

export const ChzzkClipsPlaylist = ({
  clips,
  members,
  loading = false,
  emptyMessage = "클립이 없습니다.",
}: ChzzkClipsPlaylistProps) => {
  // 뷰 모드 상태 (일자별 / 멤버별)
  const [viewMode, setViewMode] = useState<ViewMode>("date");
  // 일자별 뷰 전용 필터 상태
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(
    null,
  );
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(
    () => new Set(),
  );

  // 멤버별로 클립 그룹화 (멤버별 뷰용)
  const clipsByMember = useMemo(() => {
    const grouped = new Map<number, ChzzkClip[]>();
    clips.forEach((clip) => {
      if (clip.memberUid) {
        const list = grouped.get(clip.memberUid) || [];
        list.push(clip);
        grouped.set(clip.memberUid, list);
      }
    });
    grouped.forEach((list) => list.sort(compareClipsByDateThenViews));
    return grouped;
  }, [clips]);

  // 클립이 있는 멤버만 필터링하고 멤버 순서 유지 (멤버별 뷰용)
  const membersWithClips = useMemo(() => {
    return members.filter((m) => clipsByMember.has(m.uid));
  }, [members, clipsByMember]);

  // 일자별 뷰용: 멤버 필터 적용 후 날짜 그룹화
  const dateViewClips = useMemo(() => {
    let result = [...clips];

    // 멤버 필터 적용
    if (selectedMemberUids && selectedMemberUids.length > 0) {
      result = result.filter(
        (clip) => clip.memberUid && selectedMemberUids.includes(clip.memberUid),
      );
    }

    return result;
  }, [clips, selectedMemberUids]);

  const clipDateGroups = useMemo(
    () => groupClipsByDate(dateViewClips),
    [dateViewClips],
  );

  // 일자별 뷰용: 멤버 UID → Member 맵
  const memberMap = useMemo(() => {
    const map = new Map<number, Member>();
    members.forEach((m) => map.set(m.uid, m));
    return map;
  }, [members]);

  useEffect(() => {
    const dateKeys = new Set(clipDateGroups.map((group) => group.dateKey));
    setCollapsedDateKeys((prev) => {
      const next = new Set([...prev].filter((dateKey) => dateKeys.has(dateKey)));
      return next.size === prev.size ? prev : next;
    });
  }, [clipDateGroups]);

  const toggleDateGroup = useCallback((dateKey: string) => {
    setCollapsedDateKeys((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) {
        next.delete(dateKey);
      } else {
        next.add(dateKey);
      }
      return next;
    });
  }, []);

  // 뷰 모드 변경 시 일자별 필터 초기화
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "member") {
      setSelectedMemberUids(null);
    }
  };

  // 로딩 상태
  if (loading) {
    return (
      <div className="space-y-3">
        <ChzzkClipsSectionHeader
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        {viewMode === "member" ? (
          <div className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <MemberClipsRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <ClipsGridSkeleton />
        )}
      </div>
    );
  }

  // 빈 상태
  const isEmpty =
    viewMode === "member"
      ? clips.length === 0 || membersWithClips.length === 0
      : clipDateGroups.length === 0;

  if (isEmpty && clips.length === 0) {
    return (
      <div className="space-y-3">
        <ChzzkClipsSectionHeader
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ChzzkClipsSectionHeader
        viewMode={viewMode}
        onViewModeChange={handleViewModeChange}
      />

      {/* 일자별 뷰: 멤버 필터 표시 */}
      {viewMode === "date" && (
        <ClipsMemberFilter
          members={membersWithClips}
          selectedUids={selectedMemberUids}
          onChange={setSelectedMemberUids}
        />
      )}

      {/* 멤버별 보기 */}
      {viewMode === "member" && (
        <div className="space-y-6">
          {membersWithClips.map((member) => (
            <MemberClipsRow
              key={member.uid}
              member={member}
              clips={clipsByMember.get(member.uid) || []}
            />
          ))}
        </div>
      )}

      {/* 일자별 보기 */}
      {viewMode === "date" && (
        <>
          {clipDateGroups.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              선택한 멤버의 클립이 없습니다.
            </div>
          ) : (
            <div className="space-y-7">
              {clipDateGroups.map((group) => {
                const isCollapsed = collapsedDateKeys.has(group.dateKey);
                const gridId = `${DATE_GROUP_GRID_ID_PREFIX}-${group.dateKey}`;

                return (
                  <section
                    key={group.dateKey}
                    className="space-y-3 scroll-mt-24"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                      <button
                        type="button"
                        onClick={() => toggleDateGroup(group.dateKey)}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-left transition-colors hover:text-primary"
                        aria-expanded={!isCollapsed}
                        aria-controls={gridId}
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                        )}
                        <CalendarDays className="w-4 h-4 shrink-0 text-emerald-500" />
                        <h3 className="truncate text-base font-semibold text-foreground">
                          {group.label}
                        </h3>
                      </button>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{group.clipCount}개</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          조회{" "}
                          {readCountFormatter.format(group.totalReadCount)}회
                        </span>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div
                        id={gridId}
                        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
                      >
                        {group.clips.map((clip) => (
                          <ClipCard
                            key={clip.clipUID}
                            clip={clip}
                            member={
                              clip.memberUid
                                ? memberMap.get(clip.memberUid)
                                : undefined
                            }
                            variant="grid"
                            showMemberAvatar
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
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
              "transition-all duration-200 ease-out",
              "hover:scale-110 active:scale-95",
              !canScrollLeft && "opacity-30 hover:scale-100",
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
              "transition-all duration-200 ease-out",
              "hover:scale-110 active:scale-95",
              !canScrollRight && "opacity-30 hover:scale-100",
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
          "flex gap-4 overflow-x-auto scrollbar-hide px-4 pt-1 pb-4",
          "scroll-smooth",
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
        <ClipCardSkeleton key={i} variant="row" />
      ))}
    </div>
  </div>
);

const ClipsGridSkeleton = () => (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
    {Array.from({ length: 10 }).map((_, i) => (
      <ClipCardSkeleton key={i} variant="grid" />
    ))}
  </div>
);

interface ClipCardSkeletonProps {
  variant?: "row" | "grid";
}

const ClipCardSkeleton = ({ variant = "row" }: ClipCardSkeletonProps) => (
  <div
    className={cn(
      "rounded-xl border border-border/50 overflow-hidden bg-card",
      variant === "row" ? "w-[260px] shrink-0" : "w-full",
    )}
  >
    <Skeleton className="aspect-video w-full" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  </div>
);
