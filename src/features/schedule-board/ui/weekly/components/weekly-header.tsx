import { DateNavigation } from "@/shared/ui/date-navigation";
import { format, addDays, startOfWeek, isSameWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";

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
          <DateNavigation previousLabel="이전 주로 이동" nextLabel="다음 주로 이동" todayLabel="이번주로 이동"
            isCurrent={isSameWeek(currentDate, new Date(), { weekStartsOn: 1 })} onPrevious={onPrevWeek} onNext={onNextWeek} onToday={onToday} className="w-full sm:w-auto" />
        </div>
      </div>
    </div>
  );
};
