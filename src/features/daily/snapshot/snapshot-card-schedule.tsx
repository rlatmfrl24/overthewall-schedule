import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import { cn, hexToRgba } from "@/lib/utils";
import { Clock3 } from "lucide-react";

interface SnapshotCardScheduleProps {
  schedule: ScheduleItem;
  accentColor?: string;
}

export const SnapshotCardSchedule = ({
  schedule,
  accentColor = "#000000",
}: SnapshotCardScheduleProps) => {
  const isBroadcast = schedule.status === "방송";
  const isOff = schedule.status === "휴방";
  const isGuerrilla = schedule.status === "게릴라";
  const isSimpleStatus = isOff || isGuerrilla;
  const broadcastBorderColor = hexToRgba(accentColor, 0.38);

  const rawTitle = schedule.title?.trim() ?? "";
  const fallbackTitleByStatus: Record<ScheduleStatus, string> = {
    방송: "방송 예정",
    휴방: "휴방",
    게릴라: "게릴라",
    미정: "미정",
  };

  const displayTitle = rawTitle || fallbackTitleByStatus[schedule.status];
  const shouldHideTitle =
    isSimpleStatus && (displayTitle === "휴방" || displayTitle === "게릴라");
  const statusLabel = isSimpleStatus ? schedule.status : null;
  const showTime = Boolean(schedule.start_time);
  const timeLabel = schedule.start_time ?? "--:--";

  return (
    <div
      className={cn(
        "group/schedule relative flex flex-col items-center justify-center rounded-2xl transition-all duration-200 gap-3 p-5 border min-h-[172px]",
        isBroadcast
          ? "bg-[#111318] border-white/20 shadow-[0_12px_24px_rgba(0,0,0,0.32)]"
          : "bg-zinc-100/95 border-zinc-300/90 shadow-[0_6px_14px_rgba(0,0,0,0.12)]",
      )}
      style={isBroadcast ? { borderColor: broadcastBorderColor } : undefined}
    >
      {(showTime || statusLabel) && (
        <div className="flex w-full min-h-[52px] items-center justify-center gap-2.5 text-center">
          {showTime && (
            <div
              className={cn(
                "inline-flex h-11 min-w-[124px] items-center justify-center gap-1.5 rounded-lg px-3 font-black leading-none tracking-tight tabular-nums",
                isBroadcast
                  ? "bg-zinc-800/80 text-[1.88rem] text-zinc-50"
                  : "bg-zinc-200/80 text-[1.42rem] text-zinc-800",
              )}
            >
              <Clock3
                className={cn(
                  "h-5 w-5",
                  isBroadcast ? "text-zinc-400" : "text-zinc-600",
                )}
              />
              {timeLabel}
            </div>
          )}
          {statusLabel && (
            <span
              className={cn(
                "leading-none tracking-tight",
                shouldHideTitle
                  ? "text-[1.58rem] font-extrabold"
                  : "text-[1rem] font-bold",
                isOff ? "text-rose-700" : "text-amber-700",
              )}
            >
              {statusLabel}
            </span>
          )}
        </div>
      )}
      {!shouldHideTitle && (
        <p
          className={cn(
            "w-full text-center line-clamp-2 break-keep tracking-tight",
            isBroadcast
              ? "text-[1.95rem] font-black text-zinc-50 leading-[1.16]"
              : "text-[1.58rem] font-extrabold text-zinc-900 leading-[1.22]",
          )}
        >
          {displayTitle}
        </p>
      )}
    </div>
  );
};
