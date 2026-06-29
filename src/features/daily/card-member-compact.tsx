import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import {
  buildChzzkLiveUrl,
  cn,
  convertChzzkToLiveUrl,
  getContrastColor,
  hexToRgba,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { CardSchedule } from "./card-schedule";

interface CardMemberCompactProps {
  member: Member;
  schedules: ScheduleItem[];
  liveStatus?: ChzzkLiveStatusMap[number];
  onScheduleClick?: (schedule: ScheduleItem) => void;
  onAddSchedule?: (memberUid: number) => void;
}

const MAX_VISIBLE_SCHEDULES = 2;

export const CardMemberCompact = ({
  member,
  schedules,
  liveStatus,
  onScheduleClick,
  onAddSchedule,
}: CardMemberCompactProps) => {
  const hasSchedule = schedules.length > 0;
  const visibleSchedules = schedules.slice(0, MAX_VISIBLE_SCHEDULES);
  const remainingCount = schedules.length - visibleSchedules.length;

  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";
  const headerTextColor = getContrastColor(mainColor);
  const bodyBgColor = hexToRgba(subColor, 0.12);
  const headerTextInverseColor =
    headerTextColor === "#000000" ? "#ffffff" : "#000000";
  const unitChipBgColor = hexToRgba(headerTextInverseColor, 0.22);
  const unitChipBorderColor = hexToRgba(headerTextColor, 0.28);

  const isLive = liveStatus?.status === "OPEN";
  const viewerCount = liveStatus?.concurrentUserCount;
  const liveUrl =
    buildChzzkLiveUrl(liveStatus?.channelId) ||
    convertChzzkToLiveUrl(member.url_chzzk);
  const isLiveClickable = isLive && Boolean(liveUrl);

  const handleCardClick = () => {
    if (!isLiveClickable) return;
    if (liveUrl) window.open(liveUrl, "_blank", "noreferrer");
  };

  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-transparent bg-card shadow-sm transition-shadow",
        isLiveClickable && "cursor-pointer"
      )}
      data-daily-member-card="true"
      onClick={handleCardClick}
    >
      <div
        className="flex items-start gap-3 px-3 py-2.5"
        style={{ backgroundColor: mainColor }}
        data-member-card-header="true"
      >
        <div className="relative shrink-0">
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="h-12 w-12 rounded-full border-2 object-cover shadow-sm"
            style={{ borderColor: "white" }}
            data-member-avatar="true"
          />
          {isLive && (
            <span
              className="absolute -bottom-1.5 left-1/2 inline-flex h-5 max-w-[3rem] -translate-x-1/2 items-center justify-center gap-0.5 overflow-hidden rounded-full bg-red-600 px-1.5 text-[9px] font-black leading-none text-white shadow-sm ring-2 ring-white transition-[max-width,background-color,box-shadow] duration-300 group-hover:max-w-[6.5rem] group-hover:bg-red-700 group-hover:shadow-md group-focus-within:max-w-[6.5rem] group-focus-within:bg-red-700"
              aria-label={
                typeof viewerCount === "number"
                  ? `LIVE, ${viewerCount.toLocaleString()}명 시청중`
                  : "LIVE"
              }
              data-member-live-badge="true"
              data-snapshot-exclude="true"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white animate-pulse" />
              <span className="shrink-0">LIVE</span>
              {typeof viewerCount === "number" && (
                <span
                  className="max-w-0 shrink-0 translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-200 group-hover:max-w-[4rem] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:max-w-[4rem] group-focus-within:translate-x-0 group-focus-within:opacity-100"
                  data-member-live-viewers="true"
                >
                  {viewerCount.toLocaleString()} 시청중
                </span>
              )}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h3
              className="min-w-0 break-keep text-base font-black leading-5"
              style={{ color: headerTextColor }}
              data-member-name="true"
            >
              {member.name}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {member.unit_name && (
            <span
              className="inline-flex max-w-24 items-center rounded-full border px-2 py-1 text-[10px] font-extrabold leading-none shadow-sm break-keep"
              style={{
                backgroundColor: unitChipBgColor,
                borderColor: unitChipBorderColor,
                color: headerTextColor,
              }}
              title={member.unit_name}
              data-member-unit-chip="true"
            >
              <span className="truncate">{member.unit_name}</span>
            </span>
          )}
          {onAddSchedule && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              style={{ color: headerTextColor }}
              onClick={(event) => {
                event.stopPropagation();
                onAddSchedule(member.uid);
              }}
              aria-label="스케쥴 추가"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div
        className="flex flex-col gap-2 px-3 py-2"
        style={{ backgroundColor: bodyBgColor }}
      >
        {hasSchedule ? (
          <>
            {visibleSchedules.map((schedule) => (
              <CardSchedule
                key={schedule.id}
                schedule={schedule}
                onClick={onScheduleClick}
                accentColor={mainColor}
              />
            ))}
            {remainingCount > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground">
                + {remainingCount}개 일정
              </span>
            )}
          </>
        ) : (
          <div
            className="flex items-center justify-between rounded-lg border border-dashed border-border/70 bg-background/55 px-2.5 py-2 shadow-sm"
            data-schedule-empty-state="true"
          >
            <span className="text-xs font-semibold text-foreground/70">
              일정 없음
            </span>
            {onAddSchedule && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] font-bold shadow-sm"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddSchedule(member.uid);
                }}
              >
                <Plus className="mr-1 h-3 w-3" />
                추가
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
