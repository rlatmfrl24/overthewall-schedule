import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Ban, Clock3, Flame, Radio } from "lucide-react";

interface CardScheduleProps {
  schedule: ScheduleItem;
  onClick?: (schedule: ScheduleItem) => void;
  accentColor?: string;
}

export const CardSchedule = ({
  schedule,
  onClick,
  accentColor = "#000000",
}: CardScheduleProps) => {
  const isBroadcast = schedule.status === "방송";
  const isOff = schedule.status === "휴방";
  const isGuerrilla = schedule.status === "게릴라";

  const rawTitle = schedule.title?.trim() ?? "";
  const isDuplicatedStatusTitle =
    !isBroadcast && rawTitle.length > 0 && rawTitle === schedule.status;

  const fallbackTitleByStatus: Record<ScheduleStatus, string> = {
    방송: "방송 예정",
    휴방: "오늘은 휴방입니다",
    게릴라: "게릴라 방송 예정",
    미정: "방송 시간 미정",
  };

  const displayTitle =
    rawTitle && !isDuplicatedStatusTitle
      ? rawTitle
      : fallbackTitleByStatus[schedule.status];

  const statusMeta =
    schedule.status === "휴방"
      ? {
        label: "휴방",
        className: "text-rose-600 dark:text-rose-300",
        icon: Ban,
      }
      : schedule.status === "게릴라"
        ? {
          label: "게릴라 방송",
          className: "text-amber-600 dark:text-amber-300",
          icon: Flame,
        }
        : {
          label: "시간 미정",
          className: "text-slate-600 dark:text-slate-300",
          icon: Radio,
        };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(schedule);
      }}
      className={cn(
        "group/schedule relative flex flex-col rounded-xl bg-card shadow-sm transition-all duration-200 min-h-[86px]",
        "gap-2 p-3 hover:shadow-md hover:-translate-y-0.5 cursor-pointer active:scale-[0.98] border border-transparent hover:border-border",
        isOff && "border-rose-200/70 bg-rose-50/40 dark:border-rose-900/50 dark:bg-rose-950/20",
        isGuerrilla && "border-amber-200/70 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {isBroadcast ? (
          <span
            className="inline-flex items-center rounded-md px-2 py-1 text-[11px] font-bold tracking-tight leading-none"
            style={{
              backgroundColor: accentColor,
              color: "#ffffff",
            }}
          >
            {schedule.status}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-bold leading-none",
              statusMeta.className
            )}
          >
            <statusMeta.icon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </span>
        )}
        {schedule.start_time && (
          <div className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted/80 px-2 py-1 text-[13px] font-black leading-none tracking-tight text-foreground tabular-nums">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            {schedule.start_time}
          </div>
        )}
      </div>
      <p
        className={cn(
          "text-sm font-bold text-foreground line-clamp-2 leading-snug group-hover/schedule:text-foreground transition-colors",
          !isBroadcast && "leading-relaxed"
        )}
      >
        {displayTitle}
      </p>
    </div>
  );
};
