import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import {
  buildChzzkLiveUrl,
  cn,
  convertChzzkToLiveUrl,
  getContrastColor,
  hexToRgba,
} from "@/lib/utils";
import { CardSchedule } from "./card-schedule";
import iconX from "@/assets/icon_x.svg";
import iconYoutube from "@/assets/icon_youtube.svg";
import iconChzzk from "@/assets/icon_chzzk.png";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Plus, User } from "lucide-react";

interface CardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
  liveStatus?: ChzzkLiveStatusMap[number];
  onScheduleClick?: (schedule: ScheduleItem) => void;
  onAddSchedule?: (memberUid: number) => void;
}

export const CardMember = ({
  member,
  schedules,
  liveStatus,
  onScheduleClick,
  onAddSchedule,
}: CardMemberProps) => {
  const navigate = useNavigate();
  const hasSchedule = schedules.length > 0;

  // Colors
  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";

  // Calculated Colors for Readability and Aesthetics
  const headerTextColor = getContrastColor(mainColor);
  const bodyBgColor = hexToRgba(subColor, 0.15); // Very light tint of sub color
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
        "group relative flex flex-col overflow-hidden rounded-[24px] border border-transparent shadow-sm transition-all duration-300",
        "hover:-translate-y-1 hover:shadow-xl",
        "h-full min-h-[216px] md:min-h-[232px] bg-card",
        isLiveClickable && "cursor-pointer"
      )}
      data-daily-member-card="true"
      onClick={handleCardClick}
    >
      {/* Header Section (Solid Color) */}
      <div
        className="relative h-20 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
        data-member-card-header="true"
      >
        <div className="absolute right-3 top-3 z-20 flex max-w-[calc(100%-7.25rem)] flex-col items-end gap-1.5">
          {member.unit_name && (
            <span
              className="inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-[11px] font-extrabold leading-none shadow-sm backdrop-blur-sm break-keep"
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
        </div>

        <div
          className="absolute right-3 bottom-3 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-300 bg-black/10 backdrop-blur-sm rounded-full px-1.5 py-1"
          data-member-social-group="true"
        >
          {member.url_twitter && (
            <a
              href={member.url_twitter}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="group/icon relative flex items-center justify-center w-6 h-6 rounded-full bg-white/5 transition-all duration-300 hover:bg-white/10 hover:scale-110 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)]"
              title="Twitter"
            >
              <img
                src={iconX}
                alt="Twitter"
                className="w-3 h-3 object-contain opacity-70 transition-all duration-300 group-hover/icon:opacity-100"
              />
            </a>
          )}
          {member.url_youtube && (
            <a
              href={member.url_youtube}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="group/icon relative flex items-center justify-center w-6 h-6 rounded-full bg-white/5 transition-all duration-300 hover:bg-white/10 hover:scale-110 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)]"
              title="YouTube"
            >
              <img
                src={iconYoutube}
                alt="YouTube"
                className="w-3.5 h-3.5 object-contain opacity-70 grayscale transition-all duration-300 group-hover/icon:opacity-100 group-hover/icon:grayscale-0"
              />
            </a>
          )}
          {member.url_chzzk && (
            <a
              href={member.url_chzzk}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="group/icon relative flex items-center justify-center w-6 h-6 rounded-full bg-white/5 transition-all duration-300 hover:bg-white/10 hover:scale-110 hover:shadow-[0_0_8px_rgba(255,255,255,0.15)]"
              title="Chzzk"
            >
              <img
                src={iconChzzk}
                alt="Chzzk"
                className="w-3.5 h-3.5 object-contain opacity-70 grayscale transition-all duration-300 group-hover/icon:opacity-100 group-hover/icon:grayscale-0"
              />
            </a>
          )}
        </div>
      </div>

      {/* Profile Image (Overlapping) */}
      <div className="absolute left-4 top-4 z-10">
        <div className="relative">
          <div
            className="absolute -inset-1.5 rounded-full opacity-20 blur-sm"
            style={{ backgroundColor: mainColor }}
          />
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="relative h-[5.5rem] w-[5.5rem] rounded-full border-4 object-cover shadow-lg transition-transform duration-300 group-hover:scale-105"
            style={{ borderColor: "white" }}
            data-member-avatar="true"
          />
          {isLive && (
            <span
              className="absolute -bottom-2 left-1/2 z-20 inline-flex h-6 max-w-[3.75rem] -translate-x-1/2 items-center justify-center gap-1 overflow-hidden rounded-full bg-red-600 px-2 text-[10px] font-black leading-none text-white shadow-md ring-2 ring-white transition-[max-width,background-color,box-shadow] duration-300 group-hover:max-w-[7.5rem] group-hover:bg-red-700 group-hover:shadow-lg group-focus-within:max-w-[7.5rem] group-focus-within:bg-red-700"
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
                  className="max-w-0 shrink-0 translate-x-1 overflow-hidden whitespace-nowrap opacity-0 transition-[max-width,opacity,transform] duration-200 group-hover:max-w-[4.5rem] group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:max-w-[4.5rem] group-focus-within:translate-x-0 group-focus-within:opacity-100"
                  data-member-live-viewers="true"
                >
                  {viewerCount.toLocaleString()} 시청중
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* Body Section */}
      <div
        className="relative flex flex-1 flex-col px-4 pb-3 pt-10"
        style={{ backgroundColor: bodyBgColor }}
      >
        <Button
          size="sm"
          className="absolute right-3 top-3 h-7 shrink-0 translate-x-3 rounded-full px-2.5 text-[11px] font-bold opacity-0 shadow-sm transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100"
          style={{
            backgroundColor: mainColor,
            color: headerTextColor,
          }}
          onClick={(e) => {
            e.stopPropagation();
            navigate({ to: "/profile/$code", params: { code: member.code } });
          }}
          data-member-profile-action="true"
        >
          <span>프로필</span>
          <User className="h-3 w-3 ml-1.5" />
        </Button>

        {/* Member Name */}
        <div className="mb-3 flex min-w-0 items-center relative">
          <h2
            className="min-w-0 break-keep text-xl font-black leading-tight text-foreground md:text-2xl"
            data-member-name="true"
          >
            {member.name}
          </h2>
        </div>

        {/* Schedules */}
        <div className="flex flex-col gap-2 flex-1">
          {hasSchedule ? (
            schedules.map((schedule) => (
              <CardSchedule
                key={schedule.id}
                schedule={schedule}
                onClick={onScheduleClick}
                accentColor={mainColor}
              />
            ))
          ) : (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/55 p-3 text-center shadow-sm"
              data-schedule-empty-state="true"
            >
              <p className="text-sm font-semibold text-foreground/70">
                일정 없음
              </p>
              {onAddSchedule && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-3 text-xs font-bold shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddSchedule(member.uid);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  스케쥴 추가하기
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
