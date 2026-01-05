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
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
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
  const badgeColor = isGuerrilla ? "#ef4444" : mainColor;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.005, backgroundColor: hexToRgba(mainColor, 0.08) }}
      whileTap={{ scale: 0.99 }}
      onClick={() => onClick(schedule)}
      className={cn(
        "group relative flex items-center gap-5 p-5 rounded-3xl bg-card border border-border/60 shadow-sm cursor-pointer overflow-hidden transition-all duration-300",
        "hover:shadow-lg hover:border-transparent"
      )}
      style={{
        borderLeft: `6px solid ${badgeColor}`,
      }}
    >
      {/* Dynamic Background Gradient */}
      <div
        className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity"
        style={{
          background: `linear-gradient(120deg, ${hexToRgba(
            mainColor,
            0.2
          )} 0%, transparent 60%)`,
        }}
      />

      {/* Left Side: Time or Icon */}
      <div className="relative z-10 flex flex-col items-center justify-center w-16 shrink-0">
        {isTimeline ? (
          <div className="flex flex-col items-center gap-1">
            <span
              className="text-xl font-black tracking-tight"
              style={{ color: badgeColor }}
            >
              {schedule.start_time?.substring(0, 5)}
            </span>
            <span className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
              KST
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-center w-11 h-11 rounded-2xl shadow-inner"
            style={{ backgroundColor: hexToRgba(badgeColor, 0.15) }}
          >
            {isGuerrilla ? (
              <Radio className="w-5 h-5" style={{ color: badgeColor }} />
            ) : (
              <GripHorizontal className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1 min-w-0 gap-1.5">
        {/* Member Info & Status */}
        <div className="flex items-center gap-2.5">
          <div className="relative w-6 h-6 rounded-full overflow-hidden shadow-sm ring-2 ring-white/50 dark:ring-black/50">
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="w-full h-full object-cover"
            />
          </div>
          <span
            className="text-sm font-bold opacity-80"
            style={{ color: mainColor }}
          >
            {member.name}
          </span>

          {(isGuerrilla ||
            schedule.status === "미정" ||
            schedule.status === "휴방") && (
            <span
              className={cn(
                "px-2 py-[2px] text-[10px] font-bold rounded-full border",
                isGuerrilla
                  ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"
                  : "bg-muted text-muted-foreground border-border"
              )}
            >
              {schedule.status}
            </span>
          )}
        </div>

        {/* Title */}
        <h3
          className={cn(
            "text-lg font-bold text-foreground/90 leading-snug truncate pr-2 transition-colors group-hover:text-foreground"
          )}
        >
          {schedule.title || "방송 예정"}
        </h3>
      </div>

      {/* Right Side: Decorative or arrow */}
      <div className="relative z-10 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
        <div className="p-2 rounded-full bg-background/50 backdrop-blur-sm shadow-sm">
          {/* Using a simple arrow or dot */}
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: mainColor }}
          />
        </div>
      </div>
    </motion.div>
  );
};
