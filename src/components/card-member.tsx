import type { Member, ScheduleItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Radio } from "lucide-react";
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
  const isBroadcasting = schedules.some((s) => s.status === "방송");

  // Determine card background style based on member color
  // Using a gradient for a more modern, premium look
  const cardStyle = {
    background: `linear-gradient(135deg, ${member.main_color}15 0%, #ffffff 100%)`,
    borderColor: `${member.main_color}30`,
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border bg-white transition-all duration-300",
        "hover:shadow-xl hover:-translate-y-1 hover:border-opacity-50",
        "h-full min-h-[200px]"
      )}
      style={cardStyle}
    >
      {/* Header Section */}
      <div className="relative flex flex-col items-center p-6 pb-4">
        <div className="relative mb-3">
          <div
            className="absolute -inset-1 rounded-full opacity-20 blur-md transition-opacity group-hover:opacity-40"
            style={{ backgroundColor: member.main_color }}
          />
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="relative h-20 w-20 rounded-full border-2 object-cover shadow-sm transition-transform duration-300 group-hover:scale-105"
            style={{ borderColor: member.main_color }}
          />
          {isBroadcasting && (
            <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md ring-2 ring-white">
              <Radio size={14} className="animate-pulse" />
            </div>
          )}
        </div>
        <h2 className="text-xl font-bold text-gray-900">{member.name}</h2>
        {member.unit_name && (
          <span className="text-xs font-medium text-gray-500">
            {member.unit_name}
          </span>
        )}
      </div>

      {/* Schedule Section */}
      <div className="flex flex-1 flex-col bg-white/50 px-4 py-4 backdrop-blur-sm">
        {hasSchedule ? (
          <div className="flex flex-col gap-3">
            {schedules.map((schedule) => (
              <CardSchedule
                key={schedule.id}
                schedule={schedule}
                onClick={onScheduleClick}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center py-4 text-center">
            <p className="text-sm text-gray-400">일정 없음</p>
          </div>
        )}
      </div>
    </div>
  );
};
