import type { Member, ScheduleItem, ChzzkLiveStatusMap } from "@/lib/types";
import { cn, getContrastColor, hexToRgba } from "@/lib/utils";
import { CardSchedule } from "./card-schedule";
import iconX from "@/assets/icon_x.svg";
import iconYoutube from "@/assets/icon_youtube.svg";
import iconChzzk from "@/assets/icon_chzzk.png";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { User } from "lucide-react";

interface CardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
  liveStatus?: ChzzkLiveStatusMap[number];
  onScheduleClick?: (schedule: ScheduleItem) => void;
}

export const CardMember = ({
  member,
  schedules,
  liveStatus,
  onScheduleClick,
}: CardMemberProps) => {
  const navigate = useNavigate();
  const hasSchedule = schedules.length > 0;

  // Colors
  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";

  // Calculated Colors for Readability and Aesthetics
  const headerTextColor = getContrastColor(mainColor);
  const bodyBgColor = hexToRgba(subColor, 0.15); // Very light tint of sub color
  const borderColor = hexToRgba(mainColor, 0.3);
  const nameBgColor = hexToRgba(getContrastColor(mainColor), 0.1); // Subtle background for name if needed
  const isLive = liveStatus?.status === "OPEN";
  const viewerCount = liveStatus?.concurrentUserCount;

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-[24px] transition-all duration-300",
        "hover:shadow-xl hover:-translate-y-1",
        "h-full min-h-[240px] md:min-h-[260px] bg-card"
      )}
      style={{
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header Section (Solid Color) */}
      <div
        className="relative h-24 flex items-start justify-between p-4 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      >
        {isLive && (
          <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-600 text-white text-[10px] font-black shadow-sm">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
            {typeof viewerCount === "number" && (
              <span className="text-[10px] font-semibold text-white/90 bg-black/30 px-2 py-1 rounded-full backdrop-blur-sm">
                {viewerCount.toLocaleString()} 시청중
              </span>
            )}
          </div>
        )}

        {/* Unit Name Badge */}
        {member.unit_name && (
          <span
            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm"
            style={{
              backgroundColor: nameBgColor,
              color: headerTextColor,
            }}
          >
            {member.unit_name}
          </span>
        )}

        {/* Social Media Icons - Button Group */}
        <div className="absolute right-3 bottom-3 flex items-center gap-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/10 backdrop-blur-sm rounded-full px-1.5 py-1">
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
      <div className="absolute top-14 md:top-12 left-4 z-10">
        <div className="relative">
          <div
            className="absolute -inset-1 rounded-full opacity-20 blur-sm"
            style={{ backgroundColor: mainColor }}
          />
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="relative h-16 w-16 md:h-20 md:w-20 rounded-full border-4 object-cover shadow-md transition-transform duration-300 group-hover:scale-105"
            style={{ borderColor: "white" }}
          />
        </div>
      </div>

      {/* Body Section */}
      <div
        className="flex flex-1 flex-col pt-10 pb-4 px-4"
        style={{ backgroundColor: bodyBgColor }}
      >
        {/* Member Name */}
        <div className="mb-4 flex items-center justify-between relative">
          <h2 className="text-xl font-extrabold text-foreground leading-none">
            {member.name}
          </h2>

          <Button
            size="sm"
            className="opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-4 group-hover:translate-x-0 h-8 px-3 rounded-full shadow-sm text-xs font-bold"
            style={{
              backgroundColor: mainColor,
              color: headerTextColor,
            }}
            onClick={(e) => {
              e.stopPropagation();
              navigate({ to: "/profile/$code", params: { code: member.code } });
            }}
          >
            <span>프로필</span>
            <User className="h-3 w-3 ml-1.5" />
          </Button>
        </div>

        {/* Schedules */}
        <div className="flex flex-col gap-2.5 flex-1">
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
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/40 p-4">
              <p className="text-sm font-medium text-muted-foreground">
                일정 없음
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
