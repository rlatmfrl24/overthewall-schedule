import { format, addDays, startOfWeek, isSameWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WeeklyHeaderProps {
  currentDate: Date;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onToday: () => void;
  onAddSchedule: () => void;
}

export const WeeklyHeader = ({
  currentDate,
  onPrevWeek,
  onNextWeek,
  onToday,
  onAddSchedule,
}: WeeklyHeaderProps) => {
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  return (
    <div className="flex-none px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="p-3 bg-card rounded-2xl shadow-sm border border-border">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-xl font-bold leading-tight text-foreground sm:text-2xl">
              주간 통합 일정표
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, "yyyy년 M월 d일", { locale: ko })} -{" "}
              {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
            </p>
          </div>
        </div>

        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center md:w-auto">
          <Button
            variant="default"
            className="h-10 justify-center rounded-full bg-indigo-600 px-4 text-white shadow-md transition-all hover:bg-indigo-700 hover:shadow-lg sm:w-auto"
            onClick={onAddSchedule}
          >
            <Plus className="h-4 w-4" />
            스케쥴 추가
          </Button>
          <div className="flex w-full items-center justify-between gap-1 rounded-full border border-border bg-card p-1 shadow-sm sm:w-auto sm:gap-2">
            <button
              aria-label="이전 주로 이동"
              onClick={onPrevWeek}
              className="p-2 hover:bg-muted rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={onToday}
              disabled={isSameWeek(currentDate, new Date(), {
                weekStartsOn: 1,
              })}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                isSameWeek(currentDate, new Date(), { weekStartsOn: 1 })
                  ? "text-muted-foreground cursor-not-allowed opacity-50"
                  : "text-foreground hover:bg-muted"
              }`}
            >
              이번주로 이동
            </button>
            <button
              aria-label="다음 주로 이동"
              onClick={onNextWeek}
              className="p-2 hover:bg-muted rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
