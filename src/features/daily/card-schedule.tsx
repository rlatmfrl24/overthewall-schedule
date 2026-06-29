import type { ScheduleItem, ScheduleStatus } from "@/lib/types";
import { cn, getContrastColor } from "@/lib/utils";
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
  const accentTextColor = getContrastColor(accentColor);

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
    schedule.status === "방송"
      ? {
          label: "방송",
          icon: Radio,
          cardClassName: "border-border/75 bg-background/90",
          chipClassName: "",
        }
      : schedule.status === "휴방"
        ? {
            label: "휴방",
            icon: Ban,
            cardClassName:
              "border-rose-200/90 bg-background/90 dark:border-rose-900/70 dark:bg-card/90",
            chipClassName:
              "border-transparent bg-rose-600 text-white dark:bg-rose-500 dark:text-white",
          }
        : schedule.status === "게릴라"
          ? {
              label: "게릴라 방송",
              icon: Flame,
              cardClassName:
                "border-amber-300/90 bg-background/90 dark:border-amber-800/80 dark:bg-card/90",
              chipClassName:
                "border-transparent bg-amber-200 text-amber-950 dark:bg-amber-300 dark:text-amber-950",
            }
          : {
              label: "시간 미정",
              icon: Radio,
              cardClassName:
                "border-slate-200/90 bg-background/90 dark:border-slate-800/80 dark:bg-card/90",
              chipClassName:
                "border-transparent bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-950",
            };
  const StatusIcon = statusMeta.icon;
  const shouldShowTimeFallback = !schedule.start_time && !isOff;
  const displayTime = schedule.start_time ?? (shouldShowTimeFallback ? "미정" : null);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(schedule);
      }}
      onKeyDown={(e) => {
        if (!onClick || (e.key !== "Enter" && e.key !== " ")) return;
        e.preventDefault();
        e.stopPropagation();
        onClick(schedule);
      }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${schedule.status} ${displayTitle}${
        displayTime ? ` ${displayTime}` : ""
      }`}
      className={cn(
        "group/schedule relative flex min-h-[84px] flex-col overflow-hidden rounded-xl border p-3 text-left shadow-sm transition-all duration-200",
        "gap-2.5 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
        onClick &&
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
        statusMeta.cardClassName
      )}
      data-schedule-card="true"
      data-schedule-status={schedule.status}
    >
      <div className="flex min-h-6 items-center justify-between gap-2">
        {isBroadcast ? (
          <span
            className="inline-flex min-h-6 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-extrabold leading-none tracking-tight shadow-sm"
            style={{
              backgroundColor: accentColor,
              color: accentTextColor,
            }}
            data-schedule-status-chip="true"
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex min-h-6 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-extrabold leading-none tracking-tight shadow-sm",
              statusMeta.chipClassName
            )}
            data-schedule-status-chip="true"
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {statusMeta.label}
          </span>
        )}
        {displayTime && (
          <div
            className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/70 px-2 py-1 text-[13px] font-black leading-none tracking-tight text-foreground shadow-sm tabular-nums"
            data-schedule-time="true"
          >
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            {displayTime}
          </div>
        )}
      </div>
      <p
        className={cn(
          "line-clamp-2 text-[15px] font-black leading-5 text-foreground transition-colors group-hover/schedule:text-foreground",
          isOff && "text-foreground",
          isGuerrilla && "text-foreground"
        )}
        data-schedule-title="true"
      >
        {displayTitle}
      </p>
    </div>
  );
};
