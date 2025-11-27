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
      <div className="flex items-center justify-center p-1 md:p-2 rounded-lg bg-gray-100/80 border border-gray-200 text-gray-400 font-bold text-xs md:text-sm flex-1 w-full">
        휴방
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-0.5 md:gap-1 p-1.5 md:p-2 rounded-lg bg-white shadow-sm border border-gray-100/50 hover:scale-[1.02] transition-transform cursor-pointer w-full flex-1"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className={cn(
            "px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-bold leading-none shrink-0",
            isBroadcast ? "text-white" : "text-gray-600 bg-gray-100"
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
          <span className="text-[10px] md:text-xs font-medium text-gray-500 flex items-center">
            <Clock size={10} className="mr-0.5 md:mr-1" />
            {schedule.start_time}
          </span>
        )}
      </div>
      <span className="text-xs md:text-sm font-bold text-gray-900 line-clamp-2 leading-snug mt-0.5">
        {schedule.title || "-"}
      </span>
    </div>
  );
};
