import { format } from "date-fns";
import { useId, useMemo } from "react";
import type { DDayItem } from "@/features/ddays";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
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
  const scrollHintId = useId();
  const schedulesByMemberAndDate = useMemo(() => {
    const grouped = new Map<string, ScheduleItem[]>();
    for (const schedule of schedules) {
      const key = `${schedule.member_uid}:${schedule.date}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(schedule);
      } else {
        grouped.set(key, [schedule]);
      }
    }
    return grouped;
  }, [schedules]);

  return (
    <div className="flex-1 min-h-[24rem] overflow-hidden px-4 sm:px-6 lg:px-8 pb-8 flex flex-col">
      <p id={scrollHintId} className="mb-2 text-sm text-muted-foreground">
        표를 좌우로 스크롤해 요일별 일정을 확인하세요. 키보드로는 표에 초점을 맞춘 뒤 방향키를 사용하세요.
      </p>
      <div className="pb-4 flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Scrollable Container */}
        <div role="region" aria-label="주간 일정표 스크롤" aria-describedby={scrollHintId} tabIndex={0} className="flex-1 min-h-0 overflow-auto scroll-p-2 scroll-pt-[6.5rem] scroll-pl-[6.5rem] lg:scroll-pl-[8.5rem] rounded-2xl border border-border bg-card shadow-sm relative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground">
          {/* Minimum width to prevent crushing */}
          <div role="table" aria-label="멤버별 주간 일정" className="grid w-full min-w-[69rem] grid-cols-[6rem_repeat(7,minmax(9rem,1fr))] grid-rows-[6rem] auto-rows-[minmax(min-content,1fr)] min-h-full lg:min-w-[71rem] lg:grid-cols-[8rem_repeat(7,minmax(9rem,1fr))]">
            <WeeklyGridHeader weekDays={weekDays} ddays={ddays} />

            {/* Table Body: Member Rows */}
            {members.map((member) => {
              const mainColor = member.main_color || "#e5e7eb";
              const subColor =
                member.sub_color || member.main_color || "#f3f4f6";

              return (
                <div key={member.uid} role="row" className="contents group">
                  <WeeklyGridMemberCell member={member} mainColor={mainColor} />

                  {/* Day Columns */}
                  {weekDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const daySchedules =
                      schedulesByMemberAndDate.get(`${member.uid}:${dateStr}`) ??
                      [];

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
