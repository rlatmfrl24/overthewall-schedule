import { useState, useEffect, useCallback } from "react";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import type { Member, ScheduleItem, ScheduleStatus } from "@/lib/types";

export function useWeeklySchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [members, setMembers] = useState<Member[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Dialog & Alert State
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

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i)
  );

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch("/api/members");
      const data = await res.json();
      setMembers((data as Member[]).filter((m) => m.is_deprecated === "false"));
    } catch (error) {
      console.error("Failed to fetch members:", error);
    }
  }, []);

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
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
  }, [currentDate]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const nextWeek = () => setCurrentDate((prev) => addWeeks(prev, 1));
  const prevWeek = () => setCurrentDate((prev) => subWeeks(prev, 1));
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
      setAlertMessage("오류 발생");
      setAlertOpen(true);
    }
  };

  const openAddDialog = (date: Date, memberUid?: number) => {
    setEditingSchedule(null);
    setInitialMemberUid(memberUid);
    setDialogDate(date);
    setIsEditDialogOpen(true);
  };

  const openEditDialog = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setIsEditDialogOpen(true);
  };

  return {
    currentDate,
    members,
    schedules,
    loading,
    editingSchedule,
    initialMemberUid,
    dialogDate,
    isEditDialogOpen,
    alertOpen,
    alertMessage,
    setAlertOpen,
    setIsEditDialogOpen,
    setEditingSchedule,
    setInitialMemberUid,
    nextWeek,
    prevWeek,
    goToday,
    handleSaveSchedule,
    handleDeleteSchedule,
    openAddDialog,
    openEditDialog,
    weekDays,
  };
}
