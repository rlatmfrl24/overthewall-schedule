import type { ScheduleItem } from "@/lib/types";
import { cn, hexToRgba } from "@/lib/utils";
import { Clock3, HelpCircle, Moon, Radio, Zap } from "lucide-react";
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
  const StatusIcon =
    schedule.status === "방송"
      ? Radio
      : schedule.status === "게릴라"
        ? Zap
        : schedule.status === "휴방"
          ? Moon
          : HelpCircle;
  const { textRef, textStyle } = useAutoFitText<HTMLParagraphElement>({
    contentKey: `${schedule.id}:${displayTitle}`,
    maxLines: 2,
    minFontSizePx: isBroadcast ? 21 : 18,
    stepPx: 1,
  });

  return (
    <div
      className={cn(
        "group/schedule relative flex min-h-[144px] flex-col items-start justify-between gap-3 rounded-2xl border p-4 transition-all duration-200",
        isBroadcast
          ? "bg-white border-zinc-200 shadow-[0_10px_20px_rgba(15,23,42,0.1)] dark:bg-[#111318] dark:border-white/20 dark:shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
          : "bg-zinc-50 border-zinc-200 shadow-[0_6px_14px_rgba(15,23,42,0.08)] dark:bg-zinc-900/90 dark:border-zinc-700/70 dark:shadow-[0_6px_14px_rgba(0,0,0,0.28)]",
      )}
      style={isBroadcast ? { borderColor: broadcastBorderColor } : undefined}
    >
      <div className="flex w-full items-start justify-between gap-3">
        {showTime ? (
          <div
            className={cn(
              "inline-flex h-11 min-w-[122px] items-center justify-center gap-1.5 rounded-xl border px-3 font-black leading-none tracking-tight tabular-nums",
              isBroadcast
                ? "border-zinc-200 bg-white text-[1.8rem] text-zinc-900 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-50 dark:shadow-none"
                : "border-zinc-200 bg-white text-[1.34rem] text-zinc-800 shadow-xs dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200 dark:shadow-none",
            )}
          >
            <Clock3 className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
            {timeLabel}
          </div>
        ) : (
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            <StatusIcon className="h-5 w-5" />
          </span>
        )}
        {showTime ? (
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            style={
              isBroadcast
                ? {
                    borderColor: hexToRgba(accentColor, 0.32),
                    color: accentColor,
                  }
                : undefined
            }
          >
            <StatusIcon className="h-[18px] w-[18px]" />
          </span>
        ) : null}
      </div>

      <div className="flex min-h-[68px] w-full items-center">
        <p
          ref={textRef}
          style={textStyle}
          className={cn(
            "w-full break-keep tracking-tight",
            isBroadcast
              ? "text-left text-[1.72rem] font-black leading-[1.16] text-zinc-950 dark:text-zinc-50"
              : "text-left text-[1.44rem] font-extrabold leading-[1.22] text-zinc-900 dark:text-zinc-100",
          )}
        >
          {displayTitle}
        </p>
      </div>
    </div>
  );
};
