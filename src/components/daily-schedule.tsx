import type {
  Member,
  ScheduleItem,
  ScheduleStatus,
  DDayItem,
} from "@/lib/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { CardMember } from "./card-member";
import { ScheduleDialog } from "./schedule-dialog";
import { NoticeBanner } from "./notice-banner";
import { format, addDays, subDays, isSameDay } from "date-fns";
import {
  CalendarDays,
  Plus,
  ChevronLeft,
  ChevronRight,
  Copy,
} from "lucide-react";
import { toPng } from "html-to-image";
import { Button } from "./ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDDayLabel, getDDaysForDate } from "@/lib/dday";
import { cn } from "@/lib/utils";

export const DailySchedule = () => {
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [ddays, setDDays] = useState<DDayItem[]>([]);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(
    null
  );
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isCopyingSnapshot, setIsCopyingSnapshot] = useState(false);
  const scheduleRef = useRef<HTMLDivElement | null>(null);
  const SNAPSHOT_PADDING = 12;

  const handlePrevDay = () => setCurrentDate((prev) => subDays(prev, 1));
  const handleNextDay = () => setCurrentDate((prev) => addDays(prev, 1));
  const handleToday = () => setCurrentDate(new Date());

  const fetchSchedules = useCallback(() => {
    fetch(`/api/schedules?date=${format(currentDate, "yyyy-MM-dd")}`)
      .then((res) => res.json())
      .then((data) => setSchedules(data as ScheduleItem[]))
      .catch((err) => console.error("Failed to fetch schedules:", err));
  }, [currentDate]);

  useEffect(() => {
    fetch("/api/ddays")
      .then((res) => res.json())
      .then((data) => setDDays(data as DDayItem[]))
      .catch((err) => console.error("Failed to fetch d-days:", err));

    fetch("/api/members")
      .then((res) => res.json())
      .then((data) =>
        setMembers(
          (data as Member[]).filter(
            (member) => member.is_deprecated === "false"
          )
        )
      )
      .catch((err) => console.error("Failed to fetch members:", err));

    fetchSchedules();
  }, [currentDate, fetchSchedules]);

  const ddayForToday = getDDaysForDate(ddays, currentDate);

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

  const handleCopySnapshot = async () => {
    if (!scheduleRef.current) {
      setAlertMessage("일정표 복사 대상을 찾을 수 없습니다.");
      setAlertOpen(true);
      return;
    }

    if (
      typeof window === "undefined" ||
      !navigator.clipboard ||
      typeof ClipboardItem === "undefined"
    ) {
      setAlertMessage("현재 환경에서 일정표 복사를 지원하지 않습니다.");
      setAlertOpen(true);
      return;
    }

    setIsCopyingSnapshot(true);

    try {
      const targetNode = scheduleRef.current;
      const width = targetNode.scrollWidth + SNAPSHOT_PADDING * 2;
      const height = targetNode.scrollHeight + SNAPSHOT_PADDING * 2;
      const backgroundColor = getComputedStyle(document.body).backgroundColor;

      const dataUrl = await toPng(targetNode, {
        cacheBust: true,
        width,
        height,
        canvasWidth: width,
        canvasHeight: height,
        backgroundColor,
        pixelRatio: 2,
        style: {
          margin: "0",
          padding: `${SNAPSHOT_PADDING}px`,
          boxSizing: "border-box",
          backgroundColor,
        },
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return node.dataset.snapshotExclude !== "true";
        },
      });
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);

      setAlertMessage("스케쥴 일정표를 클립보드에 복사했습니다.");
      setAlertOpen(true);
    } catch (error) {
      console.error("Failed to copy snapshot", error);
      setAlertMessage("일정표 복사 실패");
      setAlertOpen(true);
    } finally {
      setIsCopyingSnapshot(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 w-full overflow-y-auto bg-background">
      <div className="container mx-auto flex flex-col py-8 px-4 sm:px-6 lg:px-8">
        <div ref={scheduleRef} className="flex flex-col gap-8">
          {/* Header Section */}
          <div
            aria-label="Daily Schedule Header"
            className="flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-3 bg-card rounded-2xl shadow-sm border border-border">
                <CalendarDays className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold text-foreground">
                  오늘의 스케쥴
                </h1>
                <p className="text-sm text-muted-foreground">
                  {format(currentDate, "yyyy년 M월 d일")}
                </p>
              </div>

              {ddayForToday.length > 0 && (
                <div className="flex flex-col gap-2 w-full">
                  {ddayForToday.map((dday) => (
                    <div
                      key={dday.id}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-xl border shadow-sm text-sm font-semibold",
                        dday.isToday
                          ? "bg-linear-to-r from-amber-400 via-pink-500 to-indigo-500 text-white"
                          : "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-50 dark:border-amber-800"
                      )}
                      style={
                        dday.color && !dday.isToday
                          ? { borderColor: dday.color, color: dday.color }
                          : dday.color && dday.isToday
                          ? { boxShadow: `0 10px 25px ${dday.color}66` }
                          : undefined
                      }
                    >
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-1 rounded-full text-xs font-black",
                          dday.isToday
                            ? "bg-white/25"
                            : "bg-white/80 text-amber-900 dark:bg-black/30 dark:text-amber-50"
                        )}
                      >
                        {formatDDayLabel(dday.daysUntil)}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="truncate">
                          {dday.title}
                          {dday.anniversaryLabel
                            ? ` · ${dday.anniversaryLabel}`
                            : ""}
                        </span>
                        <span className="text-xs font-medium text-white/80 dark:text-amber-100/80 truncate">
                          {dday.type === "event"
                            ? "이벤트"
                            : dday.type === "debut"
                            ? "데뷔일"
                            : "생일"}{" "}
                          · {dday.targetDate.replace(/-/g, ".")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div
              className="flex flex-wrap items-center justify-center gap-2"
              data-snapshot-exclude="true"
            >
              <Button
                variant="outline"
                className="rounded-full h-10 px-4 text-foreground"
                onClick={handleCopySnapshot}
                disabled={isCopyingSnapshot}
              >
                <Copy className="h-4 w-4" />
                <span className="hidden xs:inline">
                  {isCopyingSnapshot ? "복사 중..." : "일정표 복사"}
                </span>
                <span className="inline xs:hidden">복사</span>
              </Button>
              <Button
                variant="default"
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:shadow-lg rounded-full h-10 px-4"
                onClick={() => {
                  setEditingSchedule(null);
                  setIsEditDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                스케쥴 추가
              </Button>
              <div className="flex items-center gap-2 bg-card p-1 rounded-full shadow-sm border border-border">
                <button
                  onClick={handlePrevDay}
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                </button>
                <button
                  onClick={handleToday}
                  disabled={isSameDay(currentDate, new Date())}
                  className={`px-4 py-1.5 text-sm font-medium rounded-full transition-colors ${
                    isSameDay(currentDate, new Date())
                      ? "text-muted-foreground cursor-not-allowed opacity-50"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  오늘로 이동
                </button>
                <button
                  onClick={handleNextDay}
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>

          <NoticeBanner />

          {/* Grid Section */}
          <div
            aria-label="Daily Schedule Grid"
            className="grid gap-6 w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
          >
            {members.length > 0 ? (
              members.map((member) => {
                const memberSchedules = schedules.filter(
                  (s) => s.member_uid === member.uid
                );

                return (
                  <CardMember
                    key={member.uid}
                    member={member}
                    schedules={memberSchedules}
                    onScheduleClick={(schedule) => {
                      setEditingSchedule(schedule);
                      setIsEditDialogOpen(true);
                    }}
                  />
                );
              })
            ) : (
              <div className="col-span-full flex justify-center py-12">
                <div className="animate-pulse flex flex-col items-center gap-4">
                  <div className="h-12 w-12 bg-muted rounded-full"></div>
                  <div className="h-4 w-48 bg-muted rounded"></div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <ScheduleDialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) setEditingSchedule(null);
        }}
        onSubmit={handleSaveSchedule}
        onDelete={handleDeleteSchedule}
        members={members}
        initialDate={currentDate}
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
