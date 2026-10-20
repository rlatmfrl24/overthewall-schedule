import { useMemo } from "react";
import { Plus } from "lucide-react";
import { cn, hexToRgba } from "@/shared/lib/utils";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { WeeklyScheduleItem } from "./weekly-schedule-item";
import { format } from "date-fns";
import { site } from "@/shared/config/site";
import { isScheduleMemberActive } from "@contracts/schedule-member-policy";

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
      role="cell"
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
      ) : isScheduleMemberActive(site.id, member.code, format(day, "yyyy-MM-dd")) ? (
        <button
          type="button"
          className="group/slot flex min-h-11 flex-1 items-center justify-center rounded-lg border border-dashed border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
          onClick={() => onAddSchedule(day, member.uid)}
          aria-label={`${member.name} ${day.toLocaleDateString("ko-KR")} 스케쥴 추가`}
        >
          <Plus className="h-4 w-4 transition-colors" />
        </button>
      ) : null}
    </div>
  );
};
