import type { Member, ScheduleItem } from "@/lib/types";
import { useEffect, useState } from "react";
import { format, startOfWeek, addDays, endOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn, hexToRgba } from "@/lib/utils";
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

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-[#fdfcff]">
      <div className="container mx-auto flex flex-col h-full py-4 px-2 sm:px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-2">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-[#1a1c1e]">주간 스케쥴</h1>
            <div className="flex items-center gap-1 bg-white rounded-full border border-[#e0e2e5] p-1 pl-3 pr-1 shadow-sm">
              <span className="text-sm font-medium text-[#43474e] min-w-[120px] text-center">
                {format(weekStart, "M월 d일", { locale: ko })} -{" "}
                {format(weekEnd, "M월 d일", { locale: ko })}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevWeek}
                  className="h-7 w-7 rounded-full hover:bg-[#f0f4f8]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNextWeek}
                  className="h-7 w-7 rounded-full hover:bg-[#f0f4f8]"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              className="rounded-full px-4 h-8 text-xs font-medium border-[#747775] text-[#43474e] hover:bg-[#f0f4f8]"
            >
              오늘
            </Button>
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-auto bg-white rounded-[24px] border border-[#e0e2e5] shadow-sm relative">
          {loading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10 backdrop-blur-sm">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
          )}

          <div className="w-full h-full flex flex-col">
            {/* Table Header */}
            <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-[#e0e2e5] bg-[#f0f4f8] sticky top-0 z-20">
              <div className="p-2 font-semibold text-[#43474e] text-xs flex items-center justify-center border-r border-[#e0e2e5]">
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
                      "p-2 text-center border-r border-[#e0e2e5] last:border-r-0 flex flex-col items-center justify-center gap-1",
                      isToday && "bg-[#dbe4f9]"
                    )}
                  >
                    <span className="text-[10px] text-[#43474e] font-medium">
                      {format(day, "E", { locale: ko })}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                        isToday ? "bg-[#3d69ce] text-white" : "text-[#1a1c1e]"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[#e0e2e5] flex-1">
              {members.map((member) => (
                <div
                  key={member.uid}
                  className="grid grid-cols-[80px_repeat(7,1fr)] hover:bg-[#f0f4f8]/30 transition-colors min-h-[80px]"
                >
                  {/* Member Column */}
                  <div className="p-2 border-r border-[#e0e2e5] flex flex-col items-center justify-center gap-1 sticky left-0 bg-white z-10">
                    <Avatar
                      className="h-8 w-8 border-2 overflow-hidden shrink-0"
                      style={{ borderColor: member.main_color }}
                    >
                      <AvatarImage src={`/profile/${member.code}.webp`} />
                      <AvatarFallback>{member.name[0]}</AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-[10px] text-[#1a1c1e] truncate w-full text-center">
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

                    const mainColor = member.main_color || "#000000";
                    const bgColor = hexToRgba(mainColor, 0.08);
                    const borderColor = hexToRgba(mainColor, 0.2);
                    const textColor = mainColor;

                    return (
                      <div
                        key={day.toString()}
                        className={cn(
                          "p-1 border-r border-[#e0e2e5] last:border-r-0 relative group flex flex-col",
                          isToday && "bg-[#dbe4f9]/10"
                        )}
                      >
                        {schedule ? (
                          <div
                            className="h-full w-full rounded-xl p-1.5 border flex flex-col gap-0.5 transition-all hover:shadow-md cursor-default overflow-hidden"
                            style={{
                              backgroundColor: bgColor,
                              borderColor: borderColor,
                              color: textColor,
                            }}
                          >
                            <div className="font-bold text-[10px] flex items-center justify-between opacity-90">
                              <span>{schedule.status}</span>
                              {schedule.start_time && (
                                <span className="opacity-75 text-[9px]">
                                  {schedule.start_time}
                                </span>
                              )}
                            </div>
                            {schedule.title && (
                              <div className="text-[10px] font-medium leading-tight line-clamp-3 opacity-80">
                                {schedule.title}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full w-full rounded-xl border border-dashed border-[#e0e2e5] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[10px] text-[#8e918f]">
                              -
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
