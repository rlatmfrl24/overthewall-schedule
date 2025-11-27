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
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Loader2,
  Clock,
} from "lucide-react";
import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { Button } from "./ui/button";
import { Plus } from "lucide-react";
import { ScheduleDialog } from "./schedule-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const WeeklySchedule = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(
    null
  );
  const [initialMemberUid, setInitialMemberUid] = useState<number | undefined>(
    undefined
  );
  const [dialogDate, setDialogDate] = useState<Date | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

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
      const start = startOfWeek(currentDate, { weekStartsOn: 1 }); // Sunday start
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });

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

  const handleSaveSchedule = async (data: {
    id?: number;
    member_uid: number;
    date: Date;
    start_time: string | null;
    title: string;
    status: ScheduleStatus;
  }) => {
    try {
      // 1. Fetch existing schedules for the target date to check for conflicts
      const dateStr = format(data.date, "yyyy-MM-dd");
      const res = await fetch(`/api/schedules?date=${dateStr}`);
      if (!res.ok) throw new Error("Failed to fetch schedules");

      const existingSchedules = (await res.json()) as ScheduleItem[];
      const memberSchedules = existingSchedules.filter(
        (s) => s.member_uid === data.member_uid
      );

      // 2. Handle "Undecided" (미정) - Delete ALL schedules for this member on this date
      if (data.status === "미정") {
        await Promise.all(
          memberSchedules.map((s) =>
            fetch(`/api/schedules?id=${s.id}`, { method: "DELETE" })
          )
        );
        fetchSchedules();
        setIsEditDialogOpen(false);
        setEditingSchedule(null);
        return;
      }

      // 3. Handle conflicts based on status
      if (data.status === "휴방" || data.status === "게릴라") {
        // If Off or Guerrilla, delete all other schedules for this member
        const schedulesToDelete = memberSchedules.filter(
          (s) => s.id !== data.id
        );
        await Promise.all(
          schedulesToDelete.map((s) =>
            fetch(`/api/schedules?id=${s.id}`, { method: "DELETE" })
          )
        );
      } else if (data.status === "방송") {
        // If Broadcast, delete any conflicting exclusive statuses (Off, Guerrilla, Undecided)
        const conflictingSchedules = memberSchedules.filter(
          (s) =>
            s.id !== data.id &&
            (s.status === "휴방" ||
              s.status === "게릴라" ||
              s.status === "미정")
        );
        await Promise.all(
          conflictingSchedules.map((s) =>
            fetch(`/api/schedules?id=${s.id}`, { method: "DELETE" })
          )
        );
      }

      // 4. Create or Update
      const method = data.id ? "PUT" : "POST";
      const saveRes = await fetch("/api/schedules", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          date: format(data.date, "yyyy-MM-dd"),
        }),
      });

      if (saveRes.ok) {
        fetchSchedules();
        setIsEditDialogOpen(false);
        setEditingSchedule(null);
      } else {
        setAlertMessage("스케쥴 저장 실패");
        setAlertOpen(true);
      }
    } catch (e) {
      console.error(e);
      setAlertMessage("오류 발생");
      setAlertOpen(true);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      const res = await fetch(`/api/schedules?id=${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        fetchSchedules();
        setEditingSchedule(null);
        setIsEditDialogOpen(false);
      } else {
        setAlertMessage("스케쥴 삭제 실패");
        setAlertOpen(true);
      }
    } catch (e) {
      console.error(e);
      alert("오류 발생");
    }
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i)
  );

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-gray-50/50">
      <div className="flex flex-col h-full container mx-auto">
        {/* Header Control Section */}
        <div className="flex-none px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white rounded-2xl shadow-sm border border-indigo-100">
                <CalendarDays className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-gray-900">
                  주간 통합 일정표
                </h1>
                <p className="text-sm text-gray-500">
                  {format(weekStart, "yyyy년 M월 d일", { locale: ko })} -{" "}
                  {format(addDays(weekStart, 6), "M월 d일", { locale: ko })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:shadow-lg rounded-full px-4 h-10"
                onClick={() => {
                  setEditingSchedule(null);
                  setInitialMemberUid(undefined);
                  setDialogDate(currentDate);
                  setIsEditDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                일정 추가
              </Button>
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
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          </div>
        )}

        {/* Integrated Table Section */}
        <div className="flex-1 overflow-auto px-4 sm:px-6 lg:px-8 pb-8">
          <div className="container mx-auto pb-4">
            {" "}
            {/* Minimum width to prevent crushing */}
            <div className="grid grid-cols-[120px_repeat(7,1fr)] gap-2">
              {/* Table Header: Dates */}
              <div className="sticky top-0 z-20 bg-gray-50/95 backdrop-blur-sm pt-2 pb-0 grid grid-cols-[120px_repeat(7,1fr)] gap-2 col-span-full">
                <div className="flex items-center justify-center">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Member
                  </span>
                </div>
                {weekDays.map((day) => {
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "flex flex-col items-center justify-center p-3 rounded-2xl transition-colors",
                        isToday
                          ? "bg-indigo-600 text-white shadow-md"
                          : "bg-white text-gray-600 shadow-sm border border-gray-100"
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium uppercase",
                          isToday ? "text-indigo-100" : "text-gray-400"
                        )}
                      >
                        {format(day, "EEE", { locale: ko })}
                      </span>
                      <span className="text-lg font-bold leading-none mt-1">
                        {format(day, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Table Body: Member Rows */}
              {members.map((member) => {
                const mainColor = member.main_color || "#e5e7eb";
                const subColor =
                  member.sub_color || member.main_color || "#f3f4f6";
                const bgTint = hexToRgba(subColor, 0.05);

                return (
                  <div key={member.uid} className="contents group">
                    {/* Member Column */}
                    <div className="sticky left-0 z-10 h-full">
                      <div
                        className="relative w-full h-full overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 group-hover:shadow-md border border-gray-100 flex flex-col"
                        style={{ backgroundColor: bgTint }}
                      >
                        {/* Top Accent Bar */}
                        <div
                          className="h-1.5 w-full shrink-0"
                          style={{ backgroundColor: mainColor }}
                        />

                        {/* Content */}
                        <div className="flex-1 flex flex-col items-center justify-center p-2 gap-2">
                          <div className="relative shrink-0">
                            <img
                              src={`/profile/${member.code}.webp`}
                              alt={member.name}
                              className="w-full h-full rounded-full object-cover border-2 shadow-sm"
                              style={{ borderColor: mainColor }}
                            />
                          </div>
                          <span className="text-xs font-bold text-center text-gray-900 break-keep leading-tight">
                            {member.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Day Columns */}
                    {weekDays.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const daySchedules = schedules.filter(
                        (s) => s.member_uid === member.uid && s.date === dateStr
                      );

                      // Sort: Time -> Title
                      daySchedules.sort((a, b) => {
                        if (a.start_time && b.start_time)
                          return a.start_time.localeCompare(b.start_time);
                        if (a.start_time) return -1;
                        if (b.start_time) return 1;
                        return 0;
                      });

                      const hasSchedule = daySchedules.length > 0;

                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            "flex flex-col gap-1 p-1.5 rounded-2xl min-h-[72px] transition-all",
                            hasSchedule
                              ? "bg-white shadow-sm border border-gray-100"
                              : "bg-gray-50/50 border border-transparent dashed-border"
                          )}
                          style={hasSchedule ? { backgroundColor: bgTint } : {}}
                        >
                          {hasSchedule ? (
                            daySchedules.map((schedule, idx) => {
                              const isBroadcast = schedule.status === "방송";
                              const isOff = schedule.status === "휴방";

                              if (isOff) {
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center justify-center p-3 rounded-xl bg-gray-100/80 border border-gray-200 text-gray-400 font-bold text-sm"
                                  >
                                    휴방
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={idx}
                                  className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-white shadow-sm border border-gray-100/50 hover:scale-[1.02] transition-transform max-w-[180px] truncate text-ellipsis cursor-pointer"
                                  onClick={() => {
                                    setEditingSchedule(schedule);
                                    setIsEditDialogOpen(true);
                                  }}
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span
                                      className={cn(
                                        "px-2 py-0.5 rounded text-[10px] font-bold leading-none shrink-0",
                                        isBroadcast
                                          ? "text-white"
                                          : "text-gray-600 bg-gray-100"
                                      )}
                                      style={
                                        isBroadcast
                                          ? {
                                              backgroundColor: mainColor,
                                              color:
                                                getContrastColor(mainColor),
                                            }
                                          : {}
                                      }
                                    >
                                      {schedule.status === "방송"
                                        ? "ON"
                                        : schedule.status}
                                    </span>
                                    {schedule.start_time && (
                                      <span className="text-xs font-medium text-gray-500 flex items-center">
                                        <Clock size={12} className="mr-1" />
                                        {schedule.start_time}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm font-bold text-gray-900 line-clamp-2 leading-snug mt-0.5">
                                    {schedule.title || "-"}
                                  </span>
                                </div>
                              );
                            })
                          ) : (
                            <div
                              className="flex-1 flex items-center justify-center cursor-pointer group/slot"
                              onClick={() => {
                                setEditingSchedule(null);
                                setInitialMemberUid(member.uid);
                                setDialogDate(day);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <div className="w-1 h-1 rounded-full bg-gray-200 group-hover/slot:w-6 group-hover/slot:h-6 group-hover/slot:bg-indigo-100 group-hover/slot:text-indigo-600 transition-all flex items-center justify-center">
                                <Plus className="w-0 h-0 group-hover/slot:w-4 group-hover/slot:h-4 transition-all" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <ScheduleDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setEditingSchedule(null);
            setInitialMemberUid(undefined);
          }
        }}
        onSubmit={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        members={members}
        initialDate={dialogDate || currentDate}
        initialMemberUid={initialMemberUid}
        schedule={editingSchedule}
      />

      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>알림</AlertDialogTitle>
            <AlertDialogDescription>{alertMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setAlertOpen(false)}>
              확인
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
