import type { ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";

interface CardScheduleProps {
  schedule: ScheduleItem;
  onClick?: (schedule: ScheduleItem) => void;
}

export const CardSchedule = ({ schedule, onClick }: CardScheduleProps) => {
  return (
    <div
      onClick={() => onClick?.(schedule)}
      className={cn(
        "flex flex-col gap-1 rounded-xl bg-white p-3 shadow-sm transition-all duration-200",
        "hover:bg-gray-50 hover:shadow-md cursor-pointer active:scale-[0.98]",
        "border border-transparent hover:border-gray-100"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            schedule.status === "방송"
              ? "bg-red-100 text-red-700"
              : schedule.status === "휴방"
              ? "bg-gray-100 text-gray-700"
              : schedule.status === "게릴라"
              ? "bg-purple-100 text-purple-700"
              : "bg-blue-100 text-blue-700"
          )}
        >
          {schedule.status}
        </span>
        {schedule.start_time && (
          <div className="flex items-center text-xs text-gray-500">
            <Clock size={12} className="mr-1" />
            {schedule.start_time}
          </div>
        )}
      </div>
      <p className="text-sm font-medium text-gray-800 line-clamp-2">
        {schedule.title}
      </p>
    </div>
  );
};
