import { format, isSameDay } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { getDDaysForDate, type DDayItem } from "@/features/ddays";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

interface WeeklyGridHeaderProps {
  weekDays: Date[];
  ddays: DDayItem[];
}

export const WeeklyGridHeader = ({ weekDays, ddays }: WeeklyGridHeaderProps) => (
  <div role="row" className="sticky top-0 z-30 grid grid-cols-subgrid col-span-full border-b border-border bg-muted">
    <div role="columnheader" className="sticky left-0 z-40 flex items-center justify-center border-r border-border bg-muted">
      <span className="text-sm font-bold text-foreground lg:text-base">멤버</span>
    </div>
    {weekDays.map((day) => {
      const isToday = isSameDay(day, new Date());
      const ddayMatches = getDDaysForDate(ddays, day);
      const dateLabel = format(day, "M월 d일");
      const ddayLabel = ddayMatches.length === 1 ? ddayMatches[0].title : `기념일 ${ddayMatches.length}개`;
      return (
        <div
          key={day.toISOString()}
          role="columnheader"
          aria-label={format(day, "yyyy년 M월 d일 EEEE", { locale: ko })}
          aria-current={isToday ? "date" : undefined}
          className={cn(
            "flex min-w-0 flex-col items-center justify-center gap-1 border-r border-border px-2 py-2 last:border-r-0",
            isToday && "bg-accent"
          )}
        >
          <div className="flex items-baseline gap-2 text-foreground">
            <time dateTime={format(day, "yyyy-MM-dd")} className={cn("text-lg font-bold leading-7 tabular-nums", isToday && "underline decoration-2 underline-offset-4")}>
              {format(day, "M/d")}
            </time>
            <span className="text-sm font-medium">{format(day, "EEE", { locale: ko })}</span>
            {isToday && <span className="sr-only">오늘</span>}
          </div>
          {ddayMatches.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${dateLabel} ${ddayLabel} 보기`}
                  className="flex h-11 w-full shrink-0 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 text-sm font-semibold text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  <span className="truncate">{ddayLabel}</span>
                  <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent aria-label={`${dateLabel} 기념일`} className="max-h-[min(20rem,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto">
                <p className="mb-2 text-sm font-bold">{dateLabel} 기념일</p>
                <ul className="space-y-3 text-sm leading-relaxed">
                  {ddayMatches.map((dday) => (
                    <li key={dday.id} className="flex items-start gap-2 [overflow-wrap:anywhere]">
                      <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground" style={{ backgroundColor: dday.color }} />
                      <span>{dday.title}{dday.anniversaryLabel ? ` · ${dday.anniversaryLabel}` : ""}</span>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
      );
    })}
  </div>
);
