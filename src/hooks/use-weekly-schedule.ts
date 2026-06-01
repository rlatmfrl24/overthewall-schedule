import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
} from "date-fns";
import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import { useScheduleBoard } from "./use-schedule-board";
import { deleteSchedule } from "@/lib/api/schedules";
import { saveScheduleWithConflicts } from "@/lib/schedule-service";
import { queryKeys } from "@/lib/query-keys";

export function useWeeklySchedule() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());

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
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const startDateStr = format(weekStart, "yyyy-MM-dd");
  const endDateStr = format(weekEnd, "yyyy-MM-dd");
  const weekDays = Array.from({ length: 7 }).map((_, i) =>
    addDays(weekStart, i)
  );
  const scheduleBoard = useScheduleBoard(startDateStr, endDateStr);

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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.schedules.all,
      });
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
      await queryClient.invalidateQueries({
        queryKey: queryKeys.schedules.all,
      });
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
    members: scheduleBoard.members,
    schedules: scheduleBoard.schedules,
    ddays: scheduleBoard.ddays,
    notices: scheduleBoard.notices,
    loading: scheduleBoard.loading,
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
