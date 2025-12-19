import { format, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface WeeklyGridHeaderProps {
  weekDays: Date[];
}

export const WeeklyGridHeader = ({ weekDays }: WeeklyGridHeaderProps) => {
  return (
    <div
      aria-label="Weekly Schedule Header"
      className="sticky top-0 z-30 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 grid grid-cols-subgrid col-span-full"
    >
      <div className="sticky left-0 z-40 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm flex items-center justify-center border-r border-gray-200 dark:border-gray-800">
        <span className="text-[10px] md:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          Member
        </span>
      </div>
      {weekDays.map((day) => {
        const isToday = isSameDay(day, new Date());
        return (
          <div
            key={day.toISOString()}
            className={cn(
              "flex flex-col items-center justify-center p-2 md:p-3 transition-colors border-r border-gray-100 dark:border-gray-800 last:border-r-0",
              isToday ? "bg-indigo-50/50 dark:bg-indigo-950/30" : ""
            )}
          >
            <span
              className={cn(
                "text-[10px] md:text-xs font-medium uppercase",
                isToday
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-400 dark:text-gray-500"
              )}
            >
              {format(day, "EEE", { locale: ko })}
            </span>
            <span
              className={cn(
                "text-sm md:text-lg font-bold leading-none mt-1",
                isToday
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-gray-900 dark:text-gray-100"
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
