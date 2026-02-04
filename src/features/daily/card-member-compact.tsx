import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import { cn, convertChzzkToLiveUrl, getContrastColor, hexToRgba } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Clock, Plus } from "lucide-react";

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
  const isLiveClickable = isLive && Boolean(member.url_chzzk);

  const handleCardClick = () => {
    if (!isLiveClickable) return;
    const liveUrl = convertChzzkToLiveUrl(member.url_chzzk);
    if (liveUrl) {
      window.open(liveUrl, "_blank", "noreferrer");
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow",
        isLiveClickable && "cursor-pointer"
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
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-bold truncate"
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
              className="mt-0.5 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
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
              <div
                key={schedule.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onScheduleClick?.(schedule);
                }}
                className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card/80 px-2.5 py-1.5 shadow-sm"
              >
                <p className="text-xs font-semibold text-foreground line-clamp-1">
                  {schedule.title || "방송 예정"}
                </p>
                {schedule.start_time && (
                  <span className="flex items-center text-[11px] font-medium text-muted-foreground">
                    <Clock className="mr-1 h-3 w-3" />
                    {schedule.start_time}
                  </span>
                )}
              </div>
            ))}
            {remainingCount > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground">
                + {remainingCount}개 일정
              </span>
            )}
          </>
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
