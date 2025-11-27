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

  return (
    <div className="flex flex-col flex-1 w-full h-full bg-white/50 p-4 sm:p-6 overflow-hidden">
      <div className="flex flex-col h-full container mx-auto w-full gap-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-200">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-white"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
                Weekly Schedule
              </h1>
              <p className="text-sm text-slate-500 font-medium">
                {format(weekStart, "yyyy.MM.dd")} -{" "}
                {format(weekEnd, "yyyy.MM.dd")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white p-1.5 rounded-2xl shadow-sm border border-slate-100">
            <Button
              variant="ghost"
              size="icon"
              onClick={handlePrevWeek}
              className="h-9 w-9 rounded-xl hover:bg-slate-50 text-slate-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              onClick={handleToday}
              className="h-9 px-4 rounded-xl hover:bg-slate-50 text-sm font-semibold text-slate-600"
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNextWeek}
              className="h-9 w-9 rounded-xl hover:bg-slate-50 text-slate-600"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Schedule Grid */}
        <div className="flex-1 overflow-hidden bg-white rounded-[32px] shadow-xl shadow-slate-200/50 border border-slate-100 relative flex flex-col">
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            </div>
          )}

          {/* Grid Header (Days) */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-1 p-4 pb-2 border-b border-slate-50 bg-white z-20">
            <div className="flex items-center justify-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Member
              </span>
            </div>
            {weekDays.map((day, i) => {
              const isToday =
                format(day, "yyyy-MM-dd") === format(new Date(), "yyyy-MM-dd");
              const isWeekend = i === 5 || i === 6; // Sat or Sun

              return (
                <div
                  key={day.toString()}
                  className={cn(
                    "relative flex flex-col items-center justify-center py-3 rounded-2xl transition-all duration-300",
                    isToday
                      ? "bg-indigo-600 shadow-lg shadow-indigo-200 scale-105 z-10"
                      : "hover:bg-slate-50"
                  )}
                >
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-widest mb-1",
                      isToday
                        ? "text-indigo-200"
                        : isWeekend
                        ? "text-rose-400"
                        : "text-slate-400"
                    )}
                  >
                    {format(day, "EEE", { locale: ko })}
                  </span>
                  <span
                    className={cn(
                      "text-lg font-black leading-none",
                      isToday ? "text-white" : "text-slate-700"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {isToday && (
                    <div className="absolute -bottom-1 w-1 h-1 bg-white rounded-full opacity-50" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Grid Body */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-2 space-y-3">
            {members.map((member) => (
              <div
                key={member.uid}
                className="grid grid-cols-[80px_repeat(7,1fr)] gap-2 items-stretch group"
              >
                {/* Member Profile */}
                <div className="flex flex-col items-center justify-center gap-2 py-2">
                  <img src={`/profile/${member.code}.webp`} alt={member.name} />
                </div>

                {/* Schedule Cells */}
                {weekDays.map((day) => {
                  const schedule = getScheduleForMemberAndDate(member.uid, day);
                  const isToday =
                    format(day, "yyyy-MM-dd") ===
                    format(new Date(), "yyyy-MM-dd");

                  const mainColor = member.main_color || "#6366f1";

                  // Dynamic Styles
                  const hasSchedule =
                    schedule &&
                    schedule.status !== "휴방" &&
                    schedule.status !== "미정";
                  const isRest = schedule?.status === "휴방";
                  const isGuerrilla = schedule?.status === "게릴라";

                  return (
                    <div
                      key={day.toString()}
                      className={cn(
                        "relative min-h-[100px] rounded-2xl transition-all duration-300 flex flex-col overflow-hidden",
                        "hover:scale-[1.02] hover:z-10 hover:shadow-lg",
                        !schedule &&
                          "bg-slate-50/50 border border-slate-100 border-dashed",
                        isRest &&
                          "bg-gradient-to-br from-slate-100 to-slate-200",
                        hasSchedule && "shadow-md"
                      )}
                      style={
                        hasSchedule
                          ? {
                              background: `linear-gradient(135deg, ${mainColor}15 0%, ${mainColor}05 100%)`,
                              border: `1px solid ${mainColor}30`,
                            }
                          : isRest
                          ? {}
                          : {
                              borderColor: isToday
                                ? `${mainColor}20`
                                : undefined,
                            }
                      }
                    >
                      {/* Today Highlight Border */}
                      {isToday && !hasSchedule && !isRest && (
                        <div className="absolute inset-0 border-2 border-indigo-100 rounded-2xl pointer-events-none" />
                      )}

                      {schedule ? (
                        <>
                          {/* Status Badge */}
                          <div className="flex items-center justify-between p-2.5 pb-1">
                            {isRest ? (
                              <div className="w-full h-full flex items-center justify-center absolute inset-0">
                                <span
                                  className="text-4xl font-black opacity-20 select-none"
                                  style={{ color: mainColor }}
                                >
                                  X
                                </span>
                              </div>
                            ) : (
                              <div
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-sm"
                                style={{
                                  backgroundColor: isGuerrilla
                                    ? "#ef4444"
                                    : mainColor,
                                }}
                              >
                                {schedule.status}
                              </div>
                            )}

                            {schedule.start_time && (
                              <span
                                className="text-[10px] font-bold bg-white/80 px-1.5 py-0.5 rounded-md backdrop-blur-sm"
                                style={{ color: mainColor }}
                              >
                                {schedule.start_time}
                              </span>
                            )}
                          </div>

                          {/* Content */}
                          {!isRest && (
                            <div className="flex-1 p-2.5 pt-1 flex flex-col gap-1">
                              {schedule.title && (
                                <p
                                  className="text-[11px] font-semibold leading-snug line-clamp-3"
                                  style={{ color: "#1e293b" }}
                                >
                                  {schedule.title}
                                </p>
                              )}
                            </div>
                          )}

                          {/* Decorative Gradient Bar */}
                          {hasSchedule && (
                            <div
                              className="absolute bottom-0 left-0 right-0 h-1 opacity-50"
                              style={{ backgroundColor: mainColor }}
                            />
                          )}
                        </>
                      ) : (
                        <div className="flex-1 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                            <span className="text-xs">+</span>
                          </div>
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
  );
};
