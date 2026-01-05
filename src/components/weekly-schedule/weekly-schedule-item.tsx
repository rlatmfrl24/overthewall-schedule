import { Clock } from "lucide-react";
import { cn, getContrastColor } from "@/lib/utils";
import type { ScheduleItem } from "@/lib/types";

interface WeeklyScheduleItemProps {
  schedule: ScheduleItem;
  mainColor: string;
  onClick: () => void;
}

export const WeeklyScheduleItem = ({
  schedule,
  mainColor,
  onClick,
}: WeeklyScheduleItemProps) => {
  const isBroadcast = schedule.status === "방송";
  const isOff = schedule.status === "휴방";

  if (isOff) {
    return (
      <div className="flex items-center justify-center p-1 md:p-2 rounded-lg bg-muted/80 border border-border text-muted-foreground font-bold text-xs md:text-sm flex-1 w-full">
        휴방
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-0.5 md:gap-1 p-1.5 md:p-2 rounded-lg bg-card shadow-sm border border-border/50 hover:scale-[1.02] transition-transform cursor-pointer w-full flex-1"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold leading-none shrink-0",
            isBroadcast ? "text-white" : "text-muted-foreground bg-muted"
          )}
          style={
            isBroadcast
              ? {
                  backgroundColor: mainColor,
                  color: getContrastColor(mainColor),
                }
              : {}
          }
        >
          {schedule.status === "방송" ? "ON" : schedule.status}
        </span>
        {schedule.start_time && (
          <span className="text-[10px] md:text-xs font-medium text-muted-foreground flex items-center">
            <Clock size={10} className="mr-0.5 md:mr-1" />
            {schedule.start_time}
          </span>
        )}
      </div>
      <span className="text-xs md:text-sm font-bold text-foreground line-clamp-2 leading-snug mt-0.5">
        {schedule.title || "방송 예정"}
      </span>
    </div>
  );
};
