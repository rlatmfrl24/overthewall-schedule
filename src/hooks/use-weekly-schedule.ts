import { useState, useEffect, useCallback } from "react";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import { useScheduleData } from "./use-schedule-data";
import { fetchSchedulesInRange, deleteSchedule } from "@/lib/api/schedules";
import { saveScheduleWithConflicts } from "@/lib/schedule-service";

export function useWeeklySchedule() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { members, ddays } = useScheduleData();
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

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });

      const startDateStr = format(start, "yyyy-MM-dd");
      const endDateStr = format(end, "yyyy-MM-dd");

      const data = await fetchSchedulesInRange(startDateStr, endDateStr);
      setSchedules(data);
    } catch (error) {
      console.error("Failed to fetch schedules:", error);
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => {
    void fetchSchedules();
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
      await saveScheduleWithConflicts(data);
      await fetchSchedules();
      setIsEditDialogOpen(false);
      setEditingSchedule(null);
    } catch (e) {
      console.error(e);
      setAlertMessage("스케쥴 저장 실패");
      setAlertOpen(true);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await deleteSchedule(id);
      await fetchSchedules();
      setEditingSchedule(null);
      setIsEditDialogOpen(false);
    } catch (e) {
      console.error(e);
      setAlertMessage("스케쥴 삭제 실패");
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
    ddays,
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
