import { useState, useEffect, useMemo, useCallback } from "react";
import type { ChzzkClip, Member } from "@/lib/types";
import { ClipCard } from "./clip-card";
import { groupClipsByDate } from "./clip-date-groups";
import { cn, getContrastColor } from "@/lib/utils";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

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
    if (!isAllSelected && selectedUids?.includes(uid)) {
      onChange(null);
    } else {
      onChange([uid]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        data-clip-member-filter-chip="all"
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
            data-clip-member-filter-chip="member"
            data-member-uid={member.uid}
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

export const ChzzkClipsPlaylist = ({
  clips,
  members,
  loading = false,
  emptyMessage = "클립이 없습니다.",
}: ChzzkClipsPlaylistProps) => {
  const [selectedMemberUids, setSelectedMemberUids] = useState<number[] | null>(
    null,
  );
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const memberUidsWithClips = useMemo(() => {
    const uids = new Set<number>();
    clips.forEach((clip) => {
      if (clip.memberUid) {
        uids.add(clip.memberUid);
      }
    });
    return uids;
  }, [clips]);

  const membersWithClips = useMemo(() => {
    return members.filter((member) => memberUidsWithClips.has(member.uid));
  }, [members, memberUidsWithClips]);

  const dateViewClips = useMemo(() => {
    let result = [...clips];

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

  if (loading) {
    return (
      <div className="space-y-3">
        <ClipsGridSkeleton />
      </div>
    );
  }

  const isEmpty = clipDateGroups.length === 0;

  if (isEmpty && clips.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ClipsMemberFilter
        members={membersWithClips}
        selectedUids={selectedMemberUids}
        onChange={setSelectedMemberUids}
      />

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
              <section key={group.dateKey} className="space-y-3 scroll-mt-24">
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
                      조회 {readCountFormatter.format(group.totalReadCount)}회
                    </span>
                  </div>
                </div>

                {!isCollapsed && (
                  <div
                    id={gridId}
                    className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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
    </div>
  );
};

// ============ 스켈레톤 컴포넌트 ============

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
