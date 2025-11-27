import type { Member, ScheduleItem } from "@/lib/types";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { CardSchedule } from "./card-schedule";

interface CardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
  onScheduleClick?: (schedule: ScheduleItem) => void;
}

export const CardMember = ({
  member,
  schedules,
  onScheduleClick,
}: CardMemberProps) => {
  const hasSchedule = schedules.length > 0;

  // Colors
  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";

  // Calculated Colors for Readability and Aesthetics
  const headerTextColor = getContrastColor(mainColor);
  const bodyBgColor = hexToRgba(subColor, 0.15); // Very light tint of sub color
  const borderColor = hexToRgba(mainColor, 0.3);
  const nameBgColor = hexToRgba(getContrastColor(mainColor), 0.1); // Subtle background for name if needed

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[24px] transition-all duration-300",
        "hover:shadow-xl hover:-translate-y-1",
        "h-full min-h-[260px] bg-white"
      )}
      style={{
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header Section (Solid Color) */}
      <div
        className="relative h-24 flex items-start justify-between p-4 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      >
        {/* Unit Name Badge */}
        {member.unit_name && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm"
            style={{
              backgroundColor: nameBgColor,
              color: headerTextColor,
            }}
          >
            {member.unit_name}
          </span>
        )}
      </div>

      {/* Profile Image (Overlapping) */}
      <div className="absolute top-12 left-4 z-10">
        <div className="relative">
          <div
            className="absolute -inset-1 rounded-full opacity-20 blur-sm"
            style={{ backgroundColor: mainColor }}
          />
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="relative h-20 w-20 rounded-full border-[4px] object-cover shadow-md transition-transform duration-300 group-hover:scale-105"
            style={{ borderColor: "white" }}
          />
        </div>
      </div>

      {/* Body Section */}
      <div
        className="flex flex-1 flex-col pt-10 pb-4 px-4"
        style={{ backgroundColor: bodyBgColor }}
      >
        {/* Member Name */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-extrabold text-gray-900 leading-none">
            {member.name}
          </h2>
        </div>

        {/* Schedules */}
        <div className="flex flex-col gap-2.5 flex-1">
          {hasSchedule ? (
            schedules.map((schedule) => (
              <CardSchedule
                key={schedule.id}
                schedule={schedule}
                onClick={onScheduleClick}
                accentColor={mainColor}
              />
            ))
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-300/50 bg-white/40 p-4">
              <p className="text-sm font-medium text-gray-400">일정 없음</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
