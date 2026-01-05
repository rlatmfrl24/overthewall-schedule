import { format } from "date-fns";
import type { Member, ScheduleItem, DDayItem } from "@/lib/types";
import { WeeklyGridHeader } from "./weekly-grid-header";
import { WeeklyGridMemberCell } from "./weekly-grid-member-cell";
import { WeeklyGridDayCell } from "./weekly-grid-day-cell";

interface WeeklyGridProps {
  members: Member[];
  weekDays: Date[];
  schedules: ScheduleItem[];
  ddays: DDayItem[];
  onAddSchedule: (date: Date, memberUid: number) => void;
  onEditSchedule: (schedule: ScheduleItem) => void;
}

export const WeeklyGrid = ({
  members,
  weekDays,
  schedules,
  ddays,
  onAddSchedule,
  onEditSchedule,
}: WeeklyGridProps) => {
  return (
    <div className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 lg:px-8 pb-8 flex flex-col">
      <div className="pb-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Scrollable Container */}
        <div className="flex-1 min-h-0 overflow-auto rounded-2xl border border-border bg-card shadow-sm relative">
          {/* Minimum width to prevent crushing */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] md:grid-cols-[120px_repeat(7,1fr)] min-w-[800px] md:min-w-full min-h-full">
            <WeeklyGridHeader weekDays={weekDays} ddays={ddays} />

            {/* Table Body: Member Rows */}
            {members.map((member) => {
              const mainColor = member.main_color || "#e5e7eb";
              const subColor =
                member.sub_color || member.main_color || "#f3f4f6";

              return (
                <div key={member.uid} className="contents group">
                  <WeeklyGridMemberCell member={member} mainColor={mainColor} />

                  {/* Day Columns */}
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const daySchedules = schedules.filter(
                      (s) => s.member_uid === member.uid && s.date === dateStr
                    );

                    return (
                      <WeeklyGridDayCell
                        key={day.toISOString()}
                        day={day}
                        member={member}
                        schedules={daySchedules}
                        mainColor={mainColor}
                        subColor={subColor}
                        onAddSchedule={onAddSchedule}
                        onEditSchedule={onEditSchedule}
                      />
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
