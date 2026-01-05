import { useMemo } from "react";
import type { Member, ScheduleItem } from "@/lib/types";
import { cn, hexToRgba } from "@/lib/utils";
import { Clock, Radio, GripHorizontal } from "lucide-react";
import { motion } from "motion/react";

interface ChronologicalScheduleListProps {
  members: Member[];
  schedules: ScheduleItem[];
  onScheduleClick: (schedule: ScheduleItem) => void;
}

export const ChronologicalScheduleList = ({
  members,
  schedules,
  onScheduleClick,
}: ChronologicalScheduleListProps) => {
  // 1. Filter & Sort Logic
  const { timelineItems, otherItems } = useMemo(() => {
    // Exclude 'off' (휴방) schedules
    const activeSchedules = schedules.filter((s) => s.status !== "휴방");

    // Split into Timeline (Fixed Time) and Others (Guerrilla / No Time / Undecided)
    const timeline = activeSchedules.filter(
      (s) => s.start_time && s.status !== "게릴라" && s.status !== "미정"
    );

    const others = activeSchedules.filter(
      (s) => !s.start_time || s.status === "게릴라" || s.status === "미정"
    );

    // Sort timeline by time
    timeline.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });

    return { timelineItems: timeline, otherItems: others };
  }, [schedules]);

  // Helper to get member details
  const getMember = (uid: number) => members.find((m) => m.uid === uid);

  return (
    <div className="flex flex-col gap-8 w-full max-w-3xl mx-auto px-1 sm:px-4">
      {/* Timeline Section */}
      <div className="flex flex-col gap-4">
        {timelineItems.length > 0 ? (
          <div className="grid gap-3">
            {timelineItems.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                member={getMember(schedule.member_uid)}
                onClick={onScheduleClick}
                isTimeline
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-muted rounded-3xl bg-muted/20">
            <Clock className="w-10 h-10 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">
              예정된 방송 일정이 없습니다
            </p>
          </div>
        )}
      </div>

      {/* Others Section (Guerrilla / Timeless) */}
      {otherItems.length > 0 && (
        <div className="relative">
          <div className="flex items-center gap-4 mb-4">
            <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
              Other Broadcasts
            </h4>
            <div className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
          </div>

          <div className="grid gap-3">
            {otherItems.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                member={getMember(schedule.member_uid)}
                onClick={onScheduleClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ScheduleCard = ({
  schedule,
  member,
  onClick,
  isTimeline = false,
}: {
  schedule: ScheduleItem;
  member?: Member;
  onClick: (schedule: ScheduleItem) => void;
  isTimeline?: boolean;
}) => {
  if (!member) return null;

  const mainColor = member.main_color || "#e5e7eb";

  // Status Badge Logic
  const isGuerrilla = schedule.status === "게릴라";
  const badgeColor = isGuerrilla ? "#ef4444" : mainColor; // Red for Guerrilla, member color for others

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
      onClick={() => onClick(schedule)}
      className={cn(
        "group relative flex items-center gap-4 p-4 rounded-2xl bg-card border border-border shadow-sm cursor-pointer overflow-hidden transition-all",
        "hover:shadow-md hover:border-primary/20 hover:bg-muted/30"
      )}
    >
      {/* Left Side: Time or Icon */}
      <div className="flex flex-col items-center justify-center w-16 shrink-0">
        {isTimeline ? (
          <div className="flex flex-col items-center">
            <span className="text-lg font-black text-foreground tracking-tight">
              {schedule.start_time?.substring(0, 5)}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground uppercase">
              KST
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full"
            style={{ backgroundColor: hexToRgba(badgeColor, 0.1) }}
          >
            {isGuerrilla ? (
              <Radio className="w-5 h-5" style={{ color: badgeColor }} />
            ) : (
              <GripHorizontal className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Separator Line */}
      <div className="w-px h-10 bg-border/60" />

      {/* Content */}
      <div className="flex flex-col flex-1 min-w-0 gap-1">
        {/* Member Info */}
        <div className="flex items-center gap-2">
          <div className="relative w-6 h-6 rounded-full overflow-hidden border border-border/50">
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="w-full h-full object-cover"
            />
          </div>
          <span className="text-xs font-bold text-muted-foreground">
            {member.name}
          </span>

          {/* Status Badge (if needed) */}
          <span
            className={cn(
              "px-2 py-0.5 text-[10px] font-bold rounded-full",
              isGuerrilla || schedule.status === "미정"
                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                : "bg-muted text-muted-foreground"
            )}
            style={
              !isGuerrilla && schedule.status !== "미정"
                ? {
                    backgroundColor: hexToRgba(mainColor, 0.1),
                    color: mainColor,
                  }
                : undefined
            }
          >
            {schedule.status}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-foreground leading-tight truncate pr-2">
          {schedule.title || "방송 예정"}
        </h3>
      </div>

      {/* Right Arrow (Visual Cue) */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-4">
        {/* Can add chevron right here if desired */}
      </div>
    </motion.div>
  );
};
