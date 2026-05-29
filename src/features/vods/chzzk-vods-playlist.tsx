import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChzzkVideo, Member } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CalendarDays, ChevronDown, ChevronRight } from "lucide-react";
import { VodCard } from "./vod-card";
import { VodsGridSkeleton } from "./vod-section-skeleton";
import { groupVodsByDate } from "./vod-date-groups";

const readCountFormatter = new Intl.NumberFormat("ko-KR");
const DATE_GROUP_GRID_ID_PREFIX = "chzzk-vods-date-group";

interface ChzzkVodsPlaylistProps {
  vods: ChzzkVideo[];
  members: Member[];
  loading?: boolean;
  emptyMessage?: string;
}

export const ChzzkVodsPlaylist = ({
  vods,
  members,
  loading = false,
  emptyMessage = "다시보기가 없습니다.",
}: ChzzkVodsPlaylistProps) => {
  const [collapsedDateKeys, setCollapsedDateKeys] = useState<Set<string>>(
    () => new Set(),
  );

  const vodDateGroups = useMemo(() => groupVodsByDate(vods), [vods]);

  const memberMap = useMemo(() => {
    const map = new Map<number, Member>();
    members.forEach((member) => map.set(member.uid, member));
    return map;
  }, [members]);

  useEffect(() => {
    const dateKeys = new Set(vodDateGroups.map((group) => group.dateKey));
    setCollapsedDateKeys((prev) => {
      const next = new Set([...prev].filter((dateKey) => dateKeys.has(dateKey)));
      return next.size === prev.size ? prev : next;
    });
  }, [vodDateGroups]);

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
        <VodsGridSkeleton />
      </div>
    );
  }

  if (vodDateGroups.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {vodDateGroups.map((group) => {
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <CalendarDays className="h-4 w-4 shrink-0 text-cyan-500" />
                <h3 className="truncate text-base font-semibold text-foreground">
                  {group.label}
                </h3>
              </button>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{group.videoCount}개</span>
                <span aria-hidden="true">·</span>
                <span>
                  조회 {readCountFormatter.format(group.totalReadCount)}회
                </span>
              </div>
            </div>

            {!isCollapsed && (
              <div
                id={gridId}
                className={cn(
                  "grid grid-cols-1 gap-x-4 gap-y-8",
                  "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
                )}
              >
                {group.vods.map((vod) => (
                  <VodCard
                    key={`${vod.memberUid ?? "unknown"}-${vod.videoNo}`}
                    video={vod}
                    member={
                      vod.memberUid ? memberMap.get(vod.memberUid) : undefined
                    }
                    size="sm"
                    showMemberBadge
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
