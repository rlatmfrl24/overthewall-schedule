import { format, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface WeeklyGridHeaderProps {
  weekDays: Date[];
}

export const WeeklyGridHeader = ({ weekDays }: WeeklyGridHeaderProps) => {
  return (
    <div className="sticky top-0 z-30 bg-gray-50/95 backdrop-blur-sm border-b border-gray-200 grid grid-cols-subgrid col-span-full">
      <div className="sticky left-0 z-40 bg-gray-50/95 backdrop-blur-sm flex items-center justify-center border-r border-gray-200">
        <span className="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-wider">
          Member
        </span>
      </div>
      {weekDays.map((day) => {
        const isToday = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "flex flex-col items-center justify-center p-2 md:p-3 transition-colors border-r border-gray-100 last:border-r-0",
              isToday ? "bg-indigo-50/50" : ""
            )}
          >
            <span
              className={cn(
                "text-[10px] md:text-xs font-medium uppercase",
                isToday ? "text-indigo-600" : "text-gray-400"
              )}
            >
              {format(day, "EEE", { locale: ko })}
            </span>
            <span
              className={cn(
                "text-sm md:text-lg font-bold leading-none mt-1",
                isToday ? "text-indigo-600" : "text-gray-900"
              )}
            >
              {format(day, "d")}
            </span>
          </div>
        );
      })}
    </div>
  );
};
