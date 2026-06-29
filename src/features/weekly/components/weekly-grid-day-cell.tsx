import { useMemo } from "react";
import { Plus } from "lucide-react";
import { cn, hexToRgba } from "@/lib/utils";
import type { Member, ScheduleItem } from "@/lib/types";
import { WeeklyScheduleItem } from "./weekly-schedule-item";

interface WeeklyGridDayCellProps {
  day: Date;
  member: Member;
  schedules: ScheduleItem[];
  mainColor: string;
  subColor: string;
  onAddSchedule: (date: Date, memberUid: number) => void;
  onEditSchedule: (schedule: ScheduleItem) => void;
}

export const WeeklyGridDayCell = ({
  day,
  member,
  schedules,
  mainColor,
  subColor,
  onAddSchedule,
  onEditSchedule,
}: WeeklyGridDayCellProps) => {
  const bgTint = hexToRgba(subColor, 0.06);

  // Sort: Time -> Title
  const sortedSchedules = useMemo(() => {
    return [...schedules].sort((a, b) => {
      if (a.start_time && b.start_time)
        return a.start_time.localeCompare(b.start_time);
      if (a.start_time) return -1;
      if (b.start_time) return 1;
      return 0;
    });
  }, [schedules]);

  const hasSchedule = sortedSchedules.length > 0;

  return (
    <div
      className={cn(
        "flex min-h-[84px] flex-col gap-1.5 border-b border-r border-border p-1.5 transition-all last:border-r-0 group-last:border-b-0 md:min-h-[96px] md:p-2",
        hasSchedule ? "bg-card" : "bg-muted/20"
      )}
      style={hasSchedule ? { backgroundColor: bgTint } : {}}
    >
      {hasSchedule ? (
        sortedSchedules.map((schedule, idx) => (
          <WeeklyScheduleItem
            key={idx}
            schedule={schedule}
            mainColor={mainColor}
            onClick={() => onEditSchedule(schedule)}
          />
        ))
      ) : (
        <button
          type="button"
          className="group/slot flex flex-1 items-center justify-center rounded-lg border border-dashed border-transparent text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted/70 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2"
          onClick={() => onAddSchedule(day, member.uid)}
          aria-label={`${member.name} ${day.toLocaleDateString("ko-KR")} 스케쥴 추가`}
        >
          <Plus className="h-4 w-4 transition-colors" />
        </button>
      )}
    </div>
  );
};
