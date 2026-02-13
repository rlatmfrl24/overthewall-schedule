import { useMemo } from "react";
import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GripHorizontal, Radio, Calendar, Flame } from "lucide-react";

interface SnapshotTimelineProps {
  members: Member[];
  schedules: ScheduleItem[];
}

export const SnapshotTimeline = ({
  members,
  schedules,
}: SnapshotTimelineProps) => {
  const { timelineItems, otherItems } = useMemo(() => {
    const activeSchedules = schedules.filter((s) => s.status !== "휴방");

    const timeline = activeSchedules.filter(
      (s) => s.start_time && s.status !== "게릴라" && s.status !== "미정",
    );

    const others = activeSchedules.filter(
      (s) => !s.start_time || s.status === "게릴라" || s.status === "미정",
    );

    timeline.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });

    return { timelineItems: timeline, otherItems: others };
  }, [schedules]);

  const memberMap = useMemo(
    () => new Map(members.map((member) => [member.uid, member])),
    [members],
  );

  return (
    <div className="flex flex-col gap-8 w-full max-w-none mx-0 px-0">
      {/* SECTION: TIMELINE */}
      <div className="relative">
        {timelineItems.length > 0 ? (
          <div className="space-y-3">
            {timelineItems.map((schedule) => (
              <div key={schedule.id} className="relative">
                <SnapshotTimelineCard
                  schedule={schedule}
                  member={memberMap.get(schedule.member_uid)}
                  isTimeline
                />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* SECTION: OTHERS */}
      {otherItems.length > 0 && (
        <div className="relative mt-4">
          <div className="flex items-center gap-3 mb-5 pl-1">
            <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
              <Radio className="w-5 h-5" />
            </div>
            <h4 className="text-lg font-bold text-foreground">게릴라 · 미정</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {otherItems.map((schedule) => (
              <SnapshotTimelineCard
                key={schedule.id}
                schedule={schedule}
                member={memberMap.get(schedule.member_uid)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const SnapshotTimelineCard = ({
  schedule,
  member,
  isTimeline = false,
}: {
  schedule: ScheduleItem;
  member?: Member;
  isTimeline?: boolean;
}) => {
  if (!member) return null;

  const mainColor = member.main_color || "#71717a";
  const isBroadcast = schedule.status === "방송";
  const isGuerrilla = schedule.status === "게릴라";
  const isUndecided = schedule.status === "미정";
  const [hour, minute] = schedule.start_time
    ? schedule.start_time.split(":")
    : ["--", "--"];

  const rawTitle = schedule.title?.trim() ?? "";
  const isDuplicatedStatusTitle =
    !isBroadcast && rawTitle.length > 0 && rawTitle === schedule.status;

  const fallbackTitleByStatus: Record<ScheduleStatus, string> = {
    방송: "방송 예정",
    휴방: "오늘은 휴방입니다",
    게릴라: "게릴라 방송 예정",
    미정: "방송 시간 미정",
  };

  const displayTitle =
    rawTitle && !isDuplicatedStatusTitle
      ? rawTitle
      : fallbackTitleByStatus[schedule.status];

  const statusMeta =
    isGuerrilla
      ? {
          label: "게릴라 방송",
          className: "text-amber-600",
          icon: Flame,
        }
      : isUndecided
        ? {
            label: "시간 미정",
            className: "text-slate-500",
            icon: Radio,
          }
        : null;

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl transition-all duration-300 isolate",
        "bg-white dark:bg-[#18181b] border border-border/60 shadow-sm",
      )}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1 opacity-80"
        style={{ backgroundColor: mainColor }}
      />

      <div className="grid grid-cols-[92px_1fr] items-stretch h-full">
        {/* LEFT: TIME / ICON */}
        <div className="flex flex-col items-center justify-center bg-muted/30 border-r border-border/30 self-stretch shrink-0 w-[92px] min-w-[92px] py-0">
          {isTimeline ? (
            <div className="flex flex-col items-center leading-none">
              <span className="font-black tracking-tight text-foreground/90 font-mono text-3xl">
                {hour}
              </span>
              <span className="font-bold text-muted-foreground/60 -mt-1 text-base">
                {minute}
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-background shadow-xs ring-1 ring-border/50">
              {isGuerrilla ? (
                <Flame className="w-6 h-6 text-amber-500" />
              ) : isUndecided ? (
                <Radio className="w-6 h-6 text-slate-500" />
              ) : (
                <GripHorizontal className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
          )}
        </div>

        {/* RIGHT: CONTENT */}
        <div className="flex-1 flex flex-col justify-center py-4 px-5 min-w-0 h-full overflow-hidden gap-1">
          {/* HEADER: Member Info */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <div className="relative">
              <img
                src={`/profile/${member.code}.webp`}
                alt={member.name}
                className="w-5 h-5 rounded-full object-cover ring-1 ring-border/50"
              />
            </div>
            <span
              className="text-xs font-bold uppercase tracking-wide opacity-80 break-keep"
              style={{ color: mainColor }}
            >
              {member.name}
            </span>
          </div>

          {statusMeta && (
            <div
              className={cn(
                "inline-flex items-center gap-1.5 text-sm font-extrabold leading-none tracking-tight",
                statusMeta.className,
              )}
            >
              <statusMeta.icon className="h-4 w-4" />
              {statusMeta.label}
            </div>
          )}

          {/* MAIN: Title */}
          <div className="pr-2">
            <h3
              className={cn(
                "text-xl sm:text-[1.3rem] font-bold text-foreground leading-snug break-keep",
                !schedule.title && "text-muted-foreground opacity-50 italic",
                !isBroadcast && "leading-relaxed",
                "min-w-0 line-clamp-2",
              )}
            >
              {displayTitle}
            </h3>
          </div>
        </div>
      </div>
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-20 bg-muted/5 border-2 border-dashed border-muted rounded-3xl">
    <div className="p-4 bg-muted/20 rounded-full mb-4">
      <Calendar className="w-8 h-8 text-muted-foreground/60" />
    </div>
    <p className="text-muted-foreground font-medium text-lg">일정이 없습니다</p>
    <p className="text-sm text-muted-foreground/50">
      새로운 일정이 등록될 때까지 기다려주세요
    </p>
  </div>
);
