import { Ban, Clock3, Flame, Radio } from "lucide-react";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import type { ScheduleItem, ScheduleStatus } from "@/lib/types";

interface WeeklyScheduleItemProps {
  schedule: ScheduleItem;
  mainColor: string;
  onClick: () => void;
}

export const WeeklyScheduleItem = ({
  schedule,
  mainColor,
  onClick,
}: WeeklyScheduleItemProps) => {
  const isBroadcast = schedule.status === "방송";
  const isOff = schedule.status === "휴방";
  const isGuerrilla = schedule.status === "게릴라";
  const accentTextColor = getContrastColor(mainColor);

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
          cardClassName: "border-border/80 bg-background/95",
          chipClassName: "",
        }
      : schedule.status === "휴방"
        ? {
            label: "휴방",
            icon: Ban,
            cardClassName:
              "border-rose-200/90 bg-background/95 dark:border-rose-900/70 dark:bg-card/95",
            chipClassName:
              "border-transparent bg-rose-600 text-white dark:bg-rose-500 dark:text-white",
          }
        : schedule.status === "게릴라"
          ? {
              label: "게릴라",
              icon: Flame,
              cardClassName:
                "border-amber-300/90 bg-background/95 dark:border-amber-800/80 dark:bg-card/95",
              chipClassName:
                "border-transparent bg-amber-200 text-amber-950 dark:bg-amber-300 dark:text-amber-950",
            }
          : {
              label: "미정",
              icon: Radio,
              cardClassName:
                "border-slate-200/90 bg-background/95 dark:border-slate-800/80 dark:bg-card/95",
              chipClassName:
                "border-transparent bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-950",
            };
  const StatusIcon = statusMeta.icon;
  const displayTime = schedule.start_time ?? (!isOff ? "미정" : null);

  return (
    <button
      type="button"
      className={cn(
        "group/weekly-schedule flex min-h-[76px] w-full flex-1 flex-col gap-1.5 rounded-lg border p-2 text-left shadow-sm transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2",
        statusMeta.cardClassName
      )}
      onClick={onClick}
      aria-label={`${schedule.status} ${displayTitle}${
        displayTime ? ` ${displayTime}` : ""
      }`}
      data-weekly-schedule-card="true"
      data-weekly-schedule-status={schedule.status}
      style={isBroadcast ? { borderColor: hexToRgba(mainColor, 0.4) } : undefined}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {isBroadcast ? (
          <span
            className="inline-flex min-h-6 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-extrabold leading-none shadow-sm md:text-xs"
            style={{
              backgroundColor: mainColor,
              color: accentTextColor,
            }}
            data-weekly-schedule-status-chip="true"
          >
            <StatusIcon className="h-3 w-3 md:h-3.5 md:w-3.5" />
            {statusMeta.label}
          </span>
        ) : (
          <span
            className={cn(
              "inline-flex min-h-6 items-center gap-1 rounded-md border px-1.5 py-1 text-[11px] font-extrabold leading-none shadow-sm md:text-xs",
              statusMeta.chipClassName
            )}
            data-weekly-schedule-status-chip="true"
          >
            <StatusIcon className="h-3 w-3 md:h-3.5 md:w-3.5" />
            {statusMeta.label}
          </span>
        )}
        {displayTime && (
          <span
            className="inline-flex min-h-6 shrink-0 items-center gap-1 rounded-md border border-border/70 bg-muted/70 px-1.5 py-1 text-[11px] font-black leading-none text-foreground shadow-sm tabular-nums md:text-xs"
            data-weekly-schedule-time="true"
          >
            <Clock3 className="h-3 w-3 text-muted-foreground md:h-3.5 md:w-3.5" />
            {displayTime}
          </span>
        )}
      </div>
      <span
        className={cn(
          "line-clamp-2 text-[13px] font-black leading-[1.35] text-foreground md:text-sm",
          (isOff || isGuerrilla) && "text-foreground"
        )}
        data-weekly-schedule-title="true"
      >
        {displayTitle}
      </span>
    </button>
  );
};
