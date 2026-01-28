import { ScheduleDialog } from "@/shared/schedule/schedule-dialog";
import { WeeklyGridSkeleton } from "./components/weekly-grid-skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWeeklySchedule } from "@/hooks/use-weekly-schedule";
import { WeeklyHeader } from "./components/weekly-header";
import { WeeklyGrid } from "./components/weekly-grid";
import { NoticeBanner } from "@/shared/notice/notice-banner";

export const WeeklySchedule = () => {
  const {
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
  } = useWeeklySchedule();

  return (
    <div className="flex flex-col flex-1 w-full overflow-hidden bg-background">
      <div className="flex flex-col h-full container mx-auto">
        {/* Header Control Section */}
        <WeeklyHeader
          currentDate={currentDate}
          onPrevWeek={prevWeek}
          onNextWeek={nextWeek}
          onToday={goToday}
          onAddSchedule={() => openAddDialog(currentDate)}
        />

        {/* Notice Banner */}
        <div className="container mx-auto mb-4 px-8">
          <NoticeBanner />
        </div>

        {/* Integrated Table Section */}
        {loading ? (
          <WeeklyGridSkeleton />
        ) : (
          <WeeklyGrid
            members={members}
            weekDays={weekDays}
            schedules={schedules}
            ddays={ddays}
            onAddSchedule={openAddDialog}
            onEditSchedule={openEditDialog}
          />
        )}
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
