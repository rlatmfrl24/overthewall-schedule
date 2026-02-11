import { useMemo } from "react";
import type { Member, ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { GripHorizontal, Radio, Calendar } from "lucide-react";

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

  const getMember = (uid: number) => members.find((m) => m.uid === uid);

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
                  member={getMember(schedule.member_uid)}
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
            <h4 className="text-lg font-bold text-foreground">게릴라</h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {otherItems.map((schedule) => (
              <SnapshotTimelineCard
                key={schedule.id}
                schedule={schedule}
                member={getMember(schedule.member_uid)}
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
  const isGuerrilla = schedule.status === "게릴라";
  const [hour, minute] = schedule.start_time
    ? schedule.start_time.split(":")
    : ["--", "--"];

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
                <Radio className="w-6 h-6 animate-pulse text-red-500" />
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
            {isGuerrilla && (
              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold dark:bg-orange-500/20 dark:text-orange-400">
                게릴라
              </span>
            )}
            {schedule.status === "미정" && (
              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-bold dark:bg-zinc-800 dark:text-zinc-400">
                미정
              </span>
            )}
          </div>

          {/* MAIN: Title */}
          <div className="pr-2">
            <h3
              className={cn(
                "text-xl sm:text-[1.3rem] font-bold text-foreground leading-snug break-keep",
                !schedule.title && "text-muted-foreground opacity-50 italic",
                "min-w-0 line-clamp-2",
              )}
            >
              {schedule.title || "제목 없음"}
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
