import { useEffect, useMemo, useState } from "react";
import { isSameDay } from "date-fns";
import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import { cn, hexToRgba, convertChzzkToLiveUrl } from "@/lib/utils";
import {
  Clock,
  Radio,
  GripHorizontal,
  Play,
  ExternalLink,
  Calendar,
} from "lucide-react";
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

  const { timelineItems, otherItems } = useMemo(() => {
    const activeSchedules = schedules.filter((s) => s.status !== "휴방");

    // Timeline: Start time exists, not Guerrilla/Undecided
    const timeline = activeSchedules.filter(
      (s) => s.start_time && s.status !== "게릴라" && s.status !== "미정",
    );

    const others = activeSchedules.filter(
      (s) => !s.start_time || s.status === "게릴라" || s.status === "미정",
    );

    timeline.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });

    return { timelineItems: timeline, otherItems: others };
  }, [schedules]);

  const getMember = (uid: number) => members.find((m) => m.uid === uid);

  // Time parsing helper
  const parseTimeToMinutes = (time: string | null) => {
    if (!time) return null;
    const [hourText, minuteText] = time.split(":");
    return Number(hourText) * 60 + Number(minuteText);
  };

  const showNowLine = isSameDay(currentDate, now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const nowInsertIndex = showNowLine
    ? timelineItems.findIndex((item) => {
        const minutes = parseTimeToMinutes(item.start_time);
        return minutes !== null && minutes >= nowMinutes;
      })
    : -1;

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto px-2 sm:px-4">
      {/* SECTION: TIMELINE */}
      <div className="relative">
        {timelineItems.length > 0 ? (
          <div className="space-y-4">
            {timelineItems.map((schedule, index) => {
              const minutes = parseTimeToMinutes(schedule.start_time);
              const isPast =
                showNowLine && minutes !== null && minutes < nowMinutes;
              const shouldInsertNowLine =
                showNowLine && index === nowInsertIndex;

              return (
                <div key={schedule.id} className="relative">
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
            {/* If now is after all items */}
            {showNowLine &&
              (nowInsertIndex === -1 ||
                nowInsertIndex === timelineItems.length) && (
                <NowLine label={nowLabel} />
              )}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* SECTION: OTHERS */}
      {otherItems.length > 0 && (
        <div className="relative mt-4">
          <div className="flex items-center gap-3 mb-5 pl-1">
            <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500">
              <Radio className="w-5 h-5" />
            </div>
            <h4 className="text-lg font-bold text-foreground">
              Special Broadcasts
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

/* -----------------------------------------------------------------------------------------------
 * COMPONENT: ScheduleCard (Redesigned)
 * -----------------------------------------------------------------------------------------------*/
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

  const mainColor = member.main_color || "#71717a"; // Default zinc-500
  const isLive = liveStatus?.status === "OPEN";
  const isGuerrilla = schedule.status === "게릴라";
  const [hour, minute] = schedule.start_time
    ? schedule.start_time.split(":")
    : ["--", "--"];

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLive && member.url_chzzk) {
      const liveUrl = convertChzzkToLiveUrl(member.url_chzzk);
      if (liveUrl) window.open(liveUrl, "_blank", "noreferrer");
      return;
    }
    onClick(schedule);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl transition-all duration-300 isolate",
        "bg-white dark:bg-[#18181b] border border-border/60", // Zinc-900 for dark mode base
        isPast
          ? "opacity-60 grayscale-[0.3]"
          : "shadow-sm hover:shadow-lg hover:border-transparent",
        isLive && "ring-2 ring-red-500/50 shadow-red-500/20",
      )}
      onClick={handleClick}
    >
      {/* 1. Dynamic Background Tint */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10"
        style={{
          background: `linear-gradient(105deg, ${hexToRgba(mainColor, 0.08)} 0%, transparent 40%)`,
        }}
      />

      {/* 2. Left Color Bar */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 transition-all duration-300",
          isLive
            ? "w-1.5 opacity-100"
            : "w-1 opacity-70 group-hover:w-1.5 group-hover:opacity-100",
        )}
        style={{ backgroundColor: mainColor }}
      />

      <div className="flex flex-row items-stretch">
        {/* LEFT: TIME / ICON */}
        <div className="flex flex-col items-center justify-center min-w-[5rem] sm:min-w-[6rem] py-4 bg-muted/30 border-r border-border/30">
          {isTimeline ? (
            <div className="flex flex-col items-center leading-none">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground/90 font-mono">
                {hour}
              </span>
              <span className="text-base sm:text-lg font-bold text-muted-foreground/60 -mt-1">
                {minute}
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-background shadow-xs ring-1 ring-border/50">
              {isGuerrilla ? (
                <Radio className="w-6 h-6 animate-pulse text-red-500" />
              ) : (
                <GripHorizontal className="w-6 h-6 text-muted-foreground" />
              )}
            </div>
          )}

          {/* Status Label (If needed) */}
          {isLive && (
            <span className="mt-2 text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded dark:bg-red-500/20 dark:text-red-400">
              LIVE
            </span>
          )}
        </div>

        {/* RIGHT: CONTENT */}
        <div className="flex-1 flex flex-col justify-center py-4 px-5 gap-1.5 min-w-0">
          {/* HEADER: Member Info */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <img
                src={`/profile/${member.code}.webp`}
                alt={member.name}
                className="w-5 h-5 rounded-full object-cover ring-1 ring-border/50"
              />
              {isLive && (
                <span className="absolute -bottom-0.5 -right-0.5 block w-2 h-2 rounded-full bg-green-500 ring-1 ring-white dark:ring-black" />
              )}
            </div>
            <span
              className="text-xs font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100 transition-opacity"
              style={{ color: mainColor }}
            >
              {member.name}
            </span>
            {isGuerrilla && (
              <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold dark:bg-orange-500/20 dark:text-orange-400">
                게릴라
              </span>
            )}
            {schedule.status === "미정" && (
              <span className="text-[10px] bg-zinc-100 text-zinc-500 px-1.5 py-0.5 rounded font-bold dark:bg-zinc-800 dark:text-zinc-400">
                미정
              </span>
            )}
          </div>

          {/* MAIN: Title */}
          <div className="pr-2">
            <h3
              className={cn(
                "text-lg sm:text-[1.15rem] font-bold text-foreground leading-snug break-keep transition-colors",
                "group-hover:text-primary/90",
                !schedule.title && "text-muted-foreground opacity-50 italic",
              )}
            >
              {schedule.title || "제목 없음"}
            </h3>

            {/* Live Description or Subtext */}
            {isLive &&
              liveStatus?.liveTitle &&
              liveStatus.liveTitle !== schedule.title && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-1 opacity-70">
                  {liveStatus.liveTitle}
                </p>
              )}
          </div>
        </div>

        {/* HOVER ACTION */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 pointer-events-none">
          {isLive ? (
            <div className="bg-red-500 text-white p-2 rounded-full shadow-lg shadow-red-500/30">
              <Play className="w-5 h-5 fill-current" />
            </div>
          ) : (
            <ExternalLink className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

const NowLine = ({ label }: { label: string }) => (
  <div className="flex items-center gap-4 py-3 opacity-90">
    <div className="h-[2px] w-12 bg-red-500 rounded-r-full" />
    <div className="flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
      현재 {label}
    </div>
    <div className="h-[2px] flex-1 bg-red-500/20 lg:bg-gradient-to-r lg:from-red-500/50 lg:to-transparent rounded-l-full" />
  </div>
);

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center py-20 bg-muted/5 border-2 border-dashed border-muted rounded-3xl">
    <div className="p-4 bg-muted/20 rounded-full mb-4">
      <Calendar className="w-8 h-8 text-muted-foreground/60" />
    </div>
    <p className="text-muted-foreground font-medium text-lg">일정이 없습니다</p>
    <p className="text-sm text-muted-foreground/50">
      새로운 일정이 등록될 때까지 기다려주세요
    </p>
  </div>
);
