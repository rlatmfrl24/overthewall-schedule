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
    <div className="flex-none px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-card rounded-2xl shadow-sm border border-border">
            <CalendarDays className="w-6 h-6 text-indigo-600" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-foreground">
              주간 통합 일정표
            </h1>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, "yyyy년 M월 d일", { locale: ko })} -{" "}
              {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="default"
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:shadow-lg rounded-full px-4 h-10"
            onClick={onAddSchedule}
          >
            <Plus className="h-4 w-4" />
            일정 추가
          </Button>
          <div className="flex items-center gap-2 bg-card p-1 rounded-full shadow-sm border border-border">
            <button
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
