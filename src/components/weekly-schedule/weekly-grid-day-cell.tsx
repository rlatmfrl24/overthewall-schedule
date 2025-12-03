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
  const bgTint = hexToRgba(subColor, 0.05);

  // Sort: Time -> Title
  const sortedSchedules = [...schedules].sort((a, b) => {
    if (a.start_time && b.start_time)
      return a.start_time.localeCompare(b.start_time);
    if (a.start_time) return -1;
    if (b.start_time) return 1;
    return 0;
  });

  const hasSchedule = sortedSchedules.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-1 p-1 md:p-1.5 min-h-[60px] md:min-h-[72px] transition-all border-b border-r border-border last:border-r-0 group-last:border-b-0",
        hasSchedule ? "bg-card" : "bg-muted/30"
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
        <div
          className="flex-1 flex items-center justify-center cursor-pointer group/slot hover:bg-muted rounded-lg transition-colors"
          onClick={() => onAddSchedule(day, member.uid)}
        >
          <Plus className="w-4 h-4 text-muted-foreground/50 group-hover/slot:text-muted-foreground transition-colors" />
        </div>
      )}
    </div>
  );
};
