import type { Member, ScheduleItem } from "@/lib/types";
import { useEffect, useState } from "react";
import { format, startOfWeek, addDays, endOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";

export const WeeklySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday start
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch members
        const membersRes = await fetch("/api/members");
        const membersData = (await membersRes.json()) as Member[];
        setMembers(
          membersData.filter((member) => member.is_deprecated === "false")
        );

        // Fetch schedules for the week
        const startStr = format(weekStart, "yyyy-MM-dd");
        const endStr = format(weekEnd, "yyyy-MM-dd");
        const schedulesRes = await fetch(
          `/api/schedules?startDate=${startStr}&endDate=${endStr}`
        );
        const schedulesData = await schedulesRes.json();
        setSchedules(schedulesData as ScheduleItem[]);
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [currentDate]);

  const handlePrevWeek = () => setCurrentDate((d) => addDays(d, -7));
  const handleNextWeek = () => setCurrentDate((d) => addDays(d, 7));
  const handleToday = () => setCurrentDate(new Date());

  const getScheduleForMemberAndDate = (memberUid: number, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return schedules.find(
      (s) => s.member_uid === memberUid && s.date === dateStr
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "방송":
        return "bg-indigo-100 text-indigo-700 border-indigo-200";
      case "휴방":
        return "bg-gray-100 text-gray-500 border-gray-200";
      case "게릴라":
        return "bg-rose-100 text-rose-700 border-rose-200";
      case "미정":
        return "bg-yellow-50 text-yellow-600 border-yellow-200";
      default:
        return "bg-gray-50 text-gray-400 border-gray-100";
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-gray-50/50">
      <div className="container mx-auto flex flex-col h-full py-6 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">주간 스케쥴</h1>
            <div className="flex items-center gap-2 bg-white rounded-lg border p-1 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevWeek}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[140px] text-center">
                {format(weekStart, "M월 d일", { locale: ko })} -{" "}
                {format(weekEnd, "M월 d일", { locale: ko })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextWeek}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={handleToday}>
              오늘
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto bg-white rounded-xl border shadow-sm relative">
          {loading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          )}

          <div className="min-w-[1000px]">
            {/* Table Header */}
            <div className="grid grid-cols-[120px_repeat(7,1fr)] border-b bg-gray-50/80 sticky top-0 z-20">
              <div className="p-4 font-semibold text-gray-500 text-sm flex items-center justify-center border-r">
                멤버
              </div>
              {weekDays.map((day) => {
                const isToday =
                  format(day, "yyyy-MM-dd") ===
                  format(new Date(), "yyyy-MM-dd");
                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "p-3 text-center border-r last:border-r-0 flex flex-col items-center justify-center gap-1",
                      isToday && "bg-indigo-50/50"
                    )}
                  >
                    <span className="text-xs text-gray-500 font-medium">
                      {format(day, "E", { locale: ko })}
                    </span>
                    <span
                      className={cn(
                        "text-sm font-bold w-8 h-8 flex items-center justify-center rounded-full",
                        isToday ? "bg-indigo-600 text-white" : "text-gray-900"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Table Body */}
            <div className="divide-y">
              {members.map((member) => (
                <div
                  key={member.uid}
                  className="grid grid-cols-[120px_repeat(7,1fr)] hover:bg-gray-50/50 transition-colors"
                >
                  {/* Member Column */}
                  <div className="p-3 border-r flex items-center gap-3 sticky left-0 bg-white z-10">
                    <Avatar
                      className="border-2 overflow-hidden shrink-0"
                      style={{ borderColor: member.main_color }}
                    >
                      <AvatarImage src={`/profile/${member.code}.webp`} />
                      <AvatarFallback>{member.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-sm text-gray-900 truncate">
                      {member.name}
                    </span>
                  </div>

                  {/* Schedule Columns */}
                  {weekDays.map((day) => {
                    const schedule = getScheduleForMemberAndDate(
                      member.uid,
                      day
                    );
                    const isToday =
                      format(day, "yyyy-MM-dd") ===
                      format(new Date(), "yyyy-MM-dd");

                    return (
                      <div
                        key={day.toString()}
                        className={cn(
                          "p-2 border-r last:border-r-0 min-h-[100px] relative group",
                          isToday && "bg-indigo-50/10"
                        )}
                      >
                        {schedule ? (
                          <div
                            className={cn(
                              "h-full w-full rounded-lg p-2 border text-xs flex flex-col gap-1 transition-all hover:shadow-md cursor-default",
                              getStatusColor(schedule.status)
                            )}
                          >
                            <div className="font-bold flex items-center justify-between">
                              <span>{schedule.status}</span>
                              {schedule.start_time && (
                                <span className="opacity-75">
                                  {schedule.start_time}
                                </span>
                              )}
                            </div>
                            <div className="line-clamp-3 font-medium leading-relaxed">
                              {schedule.title}
                            </div>
                          </div>
                        ) : (
                          <div className="h-full w-full rounded-lg border-2 border-dashed border-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-xs text-gray-400">
                              일정 없음
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
