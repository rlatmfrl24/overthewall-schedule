import { useEffect, useMemo, useState } from "react";
import { isSameDay } from "date-fns";
import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import { cn, hexToRgba, convertChzzkToLiveUrl } from "@/lib/utils";
import { Clock, Radio, GripHorizontal } from "lucide-react";
import { motion } from "motion/react";

interface ChronologicalScheduleListProps {
  members: Member[];
  schedules: ScheduleItem[];
  currentDate: Date;
  onScheduleClick: (schedule: ScheduleItem) => void;
  liveStatuses?: ChzzkLiveStatusMap;
}

export const ChronologicalScheduleList = ({
  members,
  schedules,
  currentDate,
  onScheduleClick,
  liveStatuses = {},
}: ChronologicalScheduleListProps) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

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

  const parseTimeToMinutes = (time: string | null) => {
    if (!time) return null;
    const [hourText, minuteText] = time.split(":");
    const hour = Number(hourText);
    const minute = Number(minuteText);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour * 60 + minute;
  };

  const showNowLine = isSameDay(currentDate, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  const nowInsertIndex = showNowLine
    ? timelineItems.findIndex((item) => {
      const minutes = parseTimeToMinutes(item.start_time);
      return minutes !== null && minutes >= nowMinutes;
    })
    : -1;

  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
      {/* Timeline Section */}
      <div className="flex flex-col gap-4 rounded-3xl border border-border/60 bg-linear-to-b from-card/90 via-card/70 to-card/50 shadow-sm p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-sm" />
          <h4 className="text-sm font-bold text-foreground/80 uppercase tracking-widest">
            Timeline
          </h4>
          <div className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
          {showNowLine && (
            <span className="text-xs font-semibold text-muted-foreground">
              현재 {nowLabel}
            </span>
          )}
        </div>
        {timelineItems.length > 0 ? (
          <div className="grid gap-3">
            {timelineItems.map((schedule, index) => {
              const scheduleMinutes = parseTimeToMinutes(schedule.start_time);
              const isPast =
                showNowLine &&
                scheduleMinutes !== null &&
                scheduleMinutes < nowMinutes;
              const shouldInsertNowLine = showNowLine && index === nowInsertIndex;

              return (
                <div key={schedule.id} className="flex flex-col gap-3">
                  {shouldInsertNowLine && <NowLine label={nowLabel} />}
                  <ScheduleCard
                    schedule={schedule}
                    member={getMember(schedule.member_uid)}
                    onClick={onScheduleClick}
                    liveStatus={liveStatuses[schedule.member_uid]}
                    isTimeline
                    isPast={isPast}
                  />
                </div>
              );
            })}
            {showNowLine &&
              (nowInsertIndex === -1 ||
                nowInsertIndex === timelineItems.length) && (
                <NowLine label={nowLabel} />
              )}
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
            <div className="h-px flex-1 bg-linear-to-r from-border to-transparent" />
          </div>

          <div className="grid gap-3">
            {otherItems.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                member={getMember(schedule.member_uid)}
                onClick={onScheduleClick}
                liveStatus={liveStatuses[schedule.member_uid]}
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
  liveStatus,
  isPast = false,
}: {
  schedule: ScheduleItem;
  member?: Member;
  onClick: (schedule: ScheduleItem) => void;
  isTimeline?: boolean;
  liveStatus?: ChzzkLiveStatusMap[number];
  isPast?: boolean;
}) => {
  if (!member) return null;

  const mainColor = member.main_color || "#e5e7eb";
  const isLive = liveStatus?.status === "OPEN";

  // Status Badge Logic
  const isGuerrilla = schedule.status === "게릴라";
  const badgeColor = isGuerrilla ? "#ef4444" : mainColor;

  const handleClick = () => {
    if (isLive && member.url_chzzk) {
      const liveUrl = convertChzzkToLiveUrl(member.url_chzzk);
      if (liveUrl) {
        window.open(liveUrl, "_blank", "noreferrer");
      }
      return;
    }
    onClick(schedule);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ scale: 1.005 }}
      whileTap={{ scale: 0.99 }}
      onClick={handleClick}
      className={cn(
        "group relative flex items-center gap-5 p-5 rounded-3xl bg-card border border-border/60 shadow-sm cursor-pointer overflow-hidden transition-all duration-300 hover:bg-muted/40",
        "hover:shadow-lg hover:border-transparent",
        isPast && "opacity-70 saturate-75 hover:opacity-100"
      )}
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

          {(isLive ||
            isGuerrilla ||
            schedule.status === "미정" ||
            schedule.status === "휴방") && (
              <span
                className={cn(
                  "px-2 py-[2px] text-[10px] font-bold rounded-full border",
                  isLive
                    ? "bg-red-600 text-white border-red-500"
                    : isGuerrilla
                      ? "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50"
                      : "bg-muted text-muted-foreground border-border"
                )}
              >
                {isLive ? "LIVE" : schedule.status}
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

const NowLine = ({ label }: { label: string }) => (
  <div className="relative flex items-center gap-3 py-1.5">
    <div className="flex-1 h-px bg-red-500/60" />
    <div className="flex items-center gap-2 text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 rounded-full px-2.5 py-0.5 shadow-sm">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
      현재 시간 {label}
    </div>
    <div className="flex-1 h-px bg-red-500/30" />
  </div>
);
