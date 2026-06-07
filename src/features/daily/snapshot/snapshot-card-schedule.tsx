import type { ScheduleItem } from "@/lib/types";
import { cn, hexToRgba } from "@/lib/utils";
import { Clock3 } from "lucide-react";
import { useAutoFitText } from "./use-auto-fit-text";
import { getScheduleDisplayTitle } from "../chronological-schedule-utils";

interface SnapshotCardScheduleProps {
  schedule: ScheduleItem;
  accentColor?: string;
}

export const SnapshotCardSchedule = ({
  schedule,
  accentColor = "#000000",
}: SnapshotCardScheduleProps) => {
  const isBroadcast = schedule.status === "방송";
  const broadcastBorderColor = hexToRgba(accentColor, 0.38);

  const displayTitle = getScheduleDisplayTitle(schedule);
  const showTime = Boolean(schedule.start_time);
  const timeLabel = schedule.start_time ?? "--:--";
  const { textRef, textStyle } = useAutoFitText<HTMLParagraphElement>({
    contentKey: `${schedule.id}:${displayTitle}`,
    maxLines: 2,
    minFontSizePx: isBroadcast ? 22 : 18,
    stepPx: 1,
  });

  return (
    <div
      className={cn(
        "group/schedule relative flex flex-col items-center justify-center rounded-2xl transition-all duration-200 gap-3 p-5 border min-h-[172px]",
        isBroadcast
          ? "bg-white border-zinc-200 shadow-[0_10px_20px_rgba(15,23,42,0.1)] dark:bg-[#111318] dark:border-white/20 dark:shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
          : "bg-zinc-50 border-zinc-200 shadow-[0_6px_14px_rgba(15,23,42,0.08)] dark:bg-zinc-900/90 dark:border-zinc-700/70 dark:shadow-[0_6px_14px_rgba(0,0,0,0.28)]",
      )}
      style={isBroadcast ? { borderColor: broadcastBorderColor } : undefined}
    >
      {showTime && (
        <div className="flex w-full min-h-[52px] items-center justify-center gap-2.5 text-center">
          <div
            className={cn(
              "inline-flex h-11 min-w-[124px] items-center justify-center gap-1.5 rounded-lg px-3 font-black leading-none tracking-tight tabular-nums border",
              isBroadcast
                ? "border-zinc-200 bg-white text-[1.88rem] text-zinc-900 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-50 dark:shadow-none"
                : "border-zinc-200 bg-white text-[1.42rem] text-zinc-800 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200 dark:shadow-none",
            )}
          >
            <Clock3
              className={cn(
                "h-5 w-5",
                isBroadcast
                  ? "text-zinc-500 dark:text-zinc-400"
                  : "text-zinc-600 dark:text-zinc-400",
              )}
            />
            {timeLabel}
          </div>
        </div>
      )}
      <p
        ref={textRef}
        style={textStyle}
        className={cn(
          "w-full text-center break-keep tracking-tight",
          isBroadcast
            ? "text-[1.95rem] font-black text-zinc-900 dark:text-zinc-50 leading-[1.16]"
            : "text-[1.58rem] font-extrabold text-zinc-900 dark:text-zinc-100 leading-[1.22]",
        )}
      >
        {displayTitle}
      </p>
    </div>
  );
};
