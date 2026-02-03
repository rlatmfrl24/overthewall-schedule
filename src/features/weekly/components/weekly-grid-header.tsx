import { format, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn, getContrastColor } from "@/lib/utils";
import type { DDayItem } from "@/lib/types";
import { getDDaysForDate } from "@/lib/dday";

interface WeeklyGridHeaderProps {
  weekDays: Date[];
  ddays: DDayItem[];
}

export const WeeklyGridHeader = ({
  weekDays,
  ddays,
}: WeeklyGridHeaderProps) => {
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
        const ddayMatches = getDDaysForDate(ddays, day);
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
            {ddayMatches.length > 0 && (
              <div className="flex flex-col gap-1 w-full mt-1">
                {ddayMatches.map((dday) => {
                  const palette =
                    (dday.colors?.length ? dday.colors : undefined) ||
                    (dday.color ? [dday.color] : []);
                  const primary = palette[0];
                  const contrastColor = primary
                    ? getContrastColor(primary)
                    : undefined;
                  const gradient =
                    palette.length > 1
                      ? `linear-gradient(90deg, ${palette.join(", ")})`
                      : primary;
                  const gradientStyle =
                    palette.length > 1
                      ? {
                        backgroundImage: gradient,
                        backgroundClip: "padding-box",
                        borderColor: "transparent",
                      }
                      : primary
                        ? { backgroundColor: primary }
                        : undefined;
                  const cardStyle =
                    dday.isToday && gradient
                      ? {
                        ...gradientStyle,
                        color: contrastColor,
                      }
                      : !dday.isToday && primary
                        ? { color: primary }
                        : undefined;

                  return (
                    <div
                      key={dday.id}
                      className={cn(
                        "w-full rounded-md px-2 py-1 text-[11px] font-bold leading-tight flex justify-center items-center gap-2 shadow-sm border",
                        dday.isToday
                          ? dday.colors?.length
                            ? "text-white"
                            : "bg-linear-to-r from-amber-400 via-pink-500 to-indigo-500 text-white"
                          : "bg-white text-foreground border-border dark:bg-card dark:border-border"
                      )}
                      style={cardStyle}
                    >
                      <span className="truncate">
                        {dday.title}
                        {dday.anniversaryLabel
                          ? ` · ${dday.anniversaryLabel}`
                          : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
