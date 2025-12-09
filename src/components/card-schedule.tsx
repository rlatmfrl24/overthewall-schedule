import type { ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

interface CardScheduleProps {
  schedule: ScheduleItem;
  onClick?: (schedule: ScheduleItem) => void;
  accentColor?: string;
}

export const CardSchedule = ({
  schedule,
  onClick,
  accentColor = "#000000",
}: CardScheduleProps) => {
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(schedule);
      }}
      className={cn(
        "group/schedule relative flex flex-col gap-1.5 rounded-xl bg-card p-3 shadow-sm transition-all duration-200",
        "hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-[0.98]",
        "border border-transparent hover:border-border"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold tracking-tight leading-none"
          )}
          style={{
            backgroundColor:
              schedule.status === "방송" ? accentColor : undefined,
            color: schedule.status === "방송" ? "#ffffff" : undefined,
          }}
        >
          {schedule.status}
        </span>
        {schedule.start_time && (
          <div className="flex items-center text-xs font-medium text-muted-foreground">
            <Clock size={11} className="mr-1" />
            {schedule.start_time}
          </div>
        )}
      </div>
      <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover/schedule:text-foreground transition-colors">
        {schedule.title}
      </p>
    </div>
  );
};
