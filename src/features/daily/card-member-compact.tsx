import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import {
  buildChzzkLiveUrl,
  cn,
  convertChzzkToLiveUrl,
  getContrastColor,
  hexToRgba,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, Radio } from "lucide-react";
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
  const borderColor = hexToRgba(mainColor, 0.3);

  const isLive = liveStatus?.status === "OPEN";
  const isUnscheduledLive = !hasSchedule && isLive;
  const liveTitle = liveStatus?.liveTitle?.trim();
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
        "flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow",
        isLiveClickable && "cursor-pointer",
      )}
      style={{ borderColor }}
      onClick={handleCardClick}
    >
      <div
        className="flex items-center gap-3 px-3 py-2"
        style={{ backgroundColor: mainColor }}
      >
        <img
          src={`/profile/${member.code}.webp`}
          alt={member.name}
          className="h-10 w-10 rounded-full border-2 object-cover shadow-sm"
          style={{ borderColor: "white" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className="text-sm font-bold leading-snug break-keep"
              style={{ color: headerTextColor }}
            >
              {member.name}
            </h3>
            {isLive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                LIVE
              </span>
            )}
          </div>
          {member.unit_name && (
            <span
              className="mt-0.5 inline-block max-w-full rounded-full px-2 py-0.5 text-[10px] font-semibold leading-snug break-keep"
              style={{
                backgroundColor: hexToRgba(headerTextColor, 0.18),
                color: headerTextColor,
              }}
            >
              {member.unit_name}
            </span>
          )}
        </div>
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
        ) : isUnscheduledLive ? (
          <div className="rounded-lg border border-red-300 border-l-4 border-l-red-500 bg-red-50 px-3 py-2.5 text-red-950 shadow-sm dark:border-red-800/70 dark:border-l-red-500 dark:bg-red-950/35 dark:text-red-50">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-black text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                미등록 LIVE
              </span>
              {typeof viewerCount === "number" && (
                <span className="rounded-md bg-white/80 px-1.5 py-0.5 text-[10px] font-black text-red-800 dark:bg-red-950/60 dark:text-red-100">
                  {viewerCount.toLocaleString()} 시청중
                </span>
              )}
            </div>
            <p className="mt-1.5 line-clamp-2 text-[13px] font-black leading-snug">
              {liveTitle || "편성표에 없는 방송이 진행 중입니다"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {liveUrl && (
                <Button
                  size="sm"
                  className="h-7 rounded-full bg-red-600 px-2 text-[11px] font-black text-white hover:bg-red-700"
                  onClick={(event) => {
                    event.stopPropagation();
                    window.open(liveUrl, "_blank", "noreferrer");
                  }}
                >
                  <Radio className="h-3 w-3" />
                  보기
                  <ExternalLink className="h-3 w-3" />
                </Button>
              )}
              {onAddSchedule && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] font-semibold"
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
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-lg border border-dashed border-border/60 bg-muted/50 px-2.5 py-2">
            <span className="text-xs font-medium text-muted-foreground">
              일정 없음
            </span>
            {onAddSchedule && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] font-semibold"
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
