import { useEffect, useState } from "react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar, Loader2 } from "lucide-react";
import type { Member, ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export const WeeklySchedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Colors from index.css
  // --otw-1: rgb(246, 100, 121);
  // --otw-2: rgb(49, 164, 169);
  // --otw-3: rgb(255, 177, 78);

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [currentDate]);

  const fetchMembers = async () => {
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      setMembers((data as Member[]).filter((m) => m.is_deprecated === "false"));
    } catch (error) {
      console.error("Failed to fetch members:", error);
    }
  };

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 }); // Sunday start
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });

      const startDateStr = format(start, "yyyy-MM-dd");
      const endDateStr = format(end, "yyyy-MM-dd");

      const res = await fetch(
        `/api/schedules?startDate=${startDateStr}&endDate=${endDateStr}`
      );
      const data = await res.json();
      setSchedules(data as ScheduleItem[]);
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const goToday = () => setCurrentDate(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i)
  );

  return (
    <div className="flex flex-col w-full h-full p-4 sm:p-6 lg:p-8 overflow-y-auto container">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-white rounded-2xl shadow-sm border border-[var(--otw-1)]/20">
            <Calendar className="w-6 h-6 text-[var(--otw-1)]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-gray-900">주간 스케쥴</h1>
            <p className="text-sm text-gray-500">
              {format(weekStart, "yyyy년 M월 d일", { locale: ko })} -{" "}
              {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white p-1 rounded-full shadow-sm border">
          <button
            onClick={prevWeek}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={goToday}
            className="px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            오늘
          </button>
          <button
            onClick={nextWeek}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--otw-2)]" />
        </div>
      )}

      {/* Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7 gap-4 auto-rows-fr">
        {weekDays.map((day) => {
          const isToday = isSameDay(day, new Date());
          const dateStr = format(day, "yyyy-MM-dd");
          const daySchedules = schedules.filter((s) => s.date === dateStr);

          // Sort schedules: items with time first, then by time, then others
          daySchedules.sort((a, b) => {
            if (a.start_time && b.start_time)
              return a.start_time.localeCompare(b.start_time);
            if (a.start_time) return -1;
            if (b.start_time) return 1;
            return 0;
          });

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex flex-col bg-white rounded-3xl p-5 shadow-sm border transition-all hover:shadow-md",
                isToday
                  ? "ring-2 ring-[var(--otw-2)] ring-offset-2"
                  : "border-gray-100"
              )}
            >
              <div className="flex items-center justify-between mb-4">
                <span
                  className={cn(
                    "text-lg font-bold",
                    isToday ? "text-[var(--otw-2)]" : "text-gray-700"
                  )}
                >
                  {format(day, "E", { locale: ko })}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium px-2 py-1 rounded-full",
                    isToday
                      ? "bg-[var(--otw-2)]/10 text-[var(--otw-2)]"
                      : "text-gray-400 bg-gray-50"
                  )}
                >
                  {format(day, "M/d")}
                </span>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {daySchedules.length > 0 ? (
                  daySchedules.map((schedule) => {
                    const member = members.find(
                      (m) => m.uid === schedule.member_uid
                    );
                    const color = member?.main_color || "var(--otw-3)";

                    return (
                      <div
                        key={schedule.id}
                        className="relative group flex items-center gap-3 p-2.5 rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] overflow-hidden"
                      >
                        {/* Background with opacity */}
                        <div
                          className="absolute inset-0 opacity-[0.08]"
                          style={{ backgroundColor: color }}
                        />

                        <div
                          className="w-1.5 h-8 rounded-full shrink-0 z-10"
                          style={{ backgroundColor: color }}
                        />
                        <div className="flex flex-col min-w-0 flex-1 z-10">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-xs font-bold truncate"
                              style={{ color: color }}
                            >
                              {member?.name || "Unknown"}
                            </span>
                            {schedule.start_time && (
                              <span className="text-[10px] text-gray-500 font-medium bg-white/80 px-1.5 rounded-md">
                                {schedule.start_time}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {schedule.title || schedule.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex-1 flex items-center justify-center text-gray-300 text-sm font-medium border-2 border-dashed border-gray-100 rounded-2xl min-h-[100px]">
                    일정 없음
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
