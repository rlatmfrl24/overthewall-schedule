import { useMemo } from "react";
import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import { cn, hexToRgba, convertChzzkToLiveUrl } from "@/lib/utils";
import {
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
  onScheduleClick: (schedule: ScheduleItem) => void;
  liveStatuses?: ChzzkLiveStatusMap;
}

export const ChronologicalScheduleList = ({
  members,
  schedules,
  onScheduleClick,
  liveStatuses = {},
}: ChronologicalScheduleListProps) => {
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

  return (
    <div className="flex flex-col gap-8 w-full max-w-4xl mx-auto px-2 sm:px-4">
      {/* SECTION: TIMELINE */}
      <div className="relative">
        {timelineItems.length > 0 ? (
          <div className="space-y-4">
            {timelineItems.map((schedule) => (
              <div key={schedule.id} className="relative">
                <ScheduleCard
                  schedule={schedule}
                  member={getMember(schedule.member_uid)}
                  onClick={onScheduleClick}
                  liveStatus={liveStatuses[schedule.member_uid]}
                  isTimeline
                />
              </div>
            ))}
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
}: {
  schedule: ScheduleItem;
  member?: Member;
  onClick: (schedule: ScheduleItem) => void;
  isTimeline?: boolean;
  liveStatus?: ChzzkLiveStatusMap[number];
}) => {
  if (!member) return null;

  const mainColor = member.main_color || "#71717a"; // Default zinc-500
  const isLive = liveStatus?.status === "OPEN";
  const isGuerrilla = schedule.status === "게릴라";
  const [hour, minute] = schedule.start_time
    ? schedule.start_time.split(":")
    : ["--", "--"];

  const handleOpenLive = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!member.url_chzzk) return;
    const liveUrl = convertChzzkToLiveUrl(member.url_chzzk);
    if (liveUrl) window.open(liveUrl, "_blank", "noreferrer");
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isLive && member.url_chzzk) {
      const liveUrl = convertChzzkToLiveUrl(member.url_chzzk);
      if (liveUrl) window.open(liveUrl, "_blank", "noreferrer");
      return;
    }
    onClick(schedule);
  };

  const motionProps = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
  };

  return (
    <motion.div
      {...motionProps}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl transition-all duration-300 isolate",
        "bg-white dark:bg-[#18181b] border border-border/60", // Zinc-900 for dark mode base
        "shadow-sm hover:shadow-lg hover:border-transparent",
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

      <div
        className={cn(
          "items-stretch h-full",
          "flex flex-row"
        )}
      >
        {/* LEFT: TIME / ICON */}
        <div
          className={cn(
            "flex flex-col items-center justify-center bg-muted/30 border-r border-border/30 self-stretch shrink-0",
            "min-w-20 sm:min-w-24 py-4"
          )}
        >
          {isTimeline ? (
            <div className="flex flex-col items-center leading-none">
              <span
                className={cn(
                  "font-black tracking-tight text-foreground/90 font-mono",
                  "text-2xl sm:text-3xl"
                )}
              >
                {hour}
              </span>
              <span
                className={cn(
                  "font-bold text-muted-foreground/60 -mt-1",
                  "text-base sm:text-lg"
                )}
              >
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

        </div>

        {/* RIGHT: CONTENT */}
        <div
          className={cn(
            "flex-1 flex flex-col justify-center py-4 px-5 min-w-0 h-full overflow-hidden",
            "gap-1.5"
          )}
        >
          {/* HEADER: Member Info */}
          <div className="flex items-center gap-2 min-w-0">
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
              className="text-xs font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100 transition-opacity truncate"
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
            <div className="flex items-center gap-2 min-w-0">
              {isLive && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-600 rounded dark:bg-red-500/20 dark:text-red-400 shrink-0"
                  data-snapshot-exclude="true"
                >
                  LIVE
                </span>
              )}
              <h3
                className={cn(
                  "text-lg sm:text-[1.15rem] font-bold text-foreground leading-snug break-keep transition-colors",
                  "group-hover:text-primary/90",
                  !schedule.title && "text-muted-foreground opacity-50 italic",
                  "min-w-0 line-clamp-1"
                )}
              >
                {schedule.title || "제목 없음"}
              </h3>
            </div>

            {/* Live Description or Subtext */}
            {isLive &&
              liveStatus?.liveTitle &&
              liveStatus.liveTitle !== schedule.title && (
                <p
                  className="text-xs text-muted-foreground mt-1 line-clamp-1 opacity-70"
                  data-snapshot-exclude="true"
                >
                  {liveStatus.liveTitle}
                </p>
              )}
          </div>
        </div>

        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 pointer-events-auto">
          {isLive && member.url_chzzk ? (
            <button
              type="button"
              onClick={handleOpenLive}
              className="inline-flex items-center gap-2 rounded-full bg-red-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-red-500/30 transition-colors hover:bg-red-600"
              aria-label="방송 보러가기"
              data-snapshot-exclude="true"
            >
              <Play className="w-4 h-4 fill-current" />
              방송 보러가기
            </button>
          ) : (
            <ExternalLink className="w-5 h-5 text-muted-foreground/50" />
          )}
        </div>
      </div>
    </motion.div>
  );
};

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
