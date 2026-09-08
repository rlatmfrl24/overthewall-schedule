import { MemberFilter } from "@/features/members";
import { useState, useEffect, useMemo, useCallback } from "react";
import type { MemberDto } from "@contracts/members";
import type { ChzzkClip } from "../model/types";
import { ClipCard } from "./clip-card";
import { groupClipsByDate } from "../model/clip-date-groups";
import { cn } from "@/shared/lib/utils";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";

const readCountFormatter = new Intl.NumberFormat("ko-KR");
const DATE_GROUP_GRID_ID_PREFIX = "chzzk-clips-date-group";

interface ChzzkClipsPlaylistProps {
  clips: ChzzkClip[];
  members: MemberDto[];
  loading?: boolean;
  emptyMessage?: string;
}

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
    const map = new Map<number, MemberDto>();
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
    <div className="space-y-5">
      <MemberFilter
        members={membersWithClips}
        selectedUids={selectedMemberUids}
        onChange={setSelectedMemberUids}
      />

      {clipDateGroups.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-muted-foreground">
          선택한 멤버의 클립이 없습니다.
        </div>
      ) : (
        <div className="space-y-6">
          {clipDateGroups.map((group) => {
            const isCollapsed = collapsedDateKeys.has(group.dateKey);
            const gridId = `${DATE_GROUP_GRID_ID_PREFIX}-${group.dateKey}`;

            return (
              <section key={group.dateKey} className="space-y-3 scroll-mt-24">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-card/80 px-3 py-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() => toggleDateGroup(group.dateKey)}
                    className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-left outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                    className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
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
  <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
