import { format } from "date-fns";
import { useSiteContentDate } from "@/features/site-content";
import { ScheduleDialog } from "@/features/schedules";
import { WeeklyGridSkeleton } from "./components/weekly-grid-skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { useWeeklySchedule } from "../../queries/use-weekly-schedule";
import { WeeklyHeader } from "./components/weekly-header";
import { WeeklyGrid } from "./components/weekly-grid";
import { NoticeBanner } from "@/features/notices";
import { ScheduleUpdatedAt } from "../components/schedule-updated-at";

export const WeeklySchedule = ({ isAdmin = false }: { isAdmin?: boolean }) => {
  const {
    currentDate,
    updatedAt,
    members,
    editorMembers,
    schedules,
    ddays,
    notices,
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

  useSiteContentDate(format(currentDate, "yyyy-MM-dd"));

  return (
    <div className="flex min-h-0 flex-col flex-1 w-full overflow-y-auto bg-background">
      <div className="flex h-full shrink-0 flex-col container mx-auto">
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
          <NoticeBanner notices={notices} />
        </div>

        <div className="container mx-auto flex justify-end px-4 pb-3 sm:px-6 lg:px-8">
          <ScheduleUpdatedAt updatedAt={updatedAt} label="최종 편집" />
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
        isAdmin={isAdmin}
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
        members={editorMembers}
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
