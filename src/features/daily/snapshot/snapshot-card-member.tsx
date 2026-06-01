import type { ChzzkLiveStatusMap, Member, ScheduleItem } from "@/lib/types";
import { getContrastColor, hexToRgba } from "@/lib/utils";
import { SnapshotCardSchedule } from "./snapshot-card-schedule";

interface SnapshotCardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
  liveStatus?: ChzzkLiveStatusMap[number];
  theme?: "light" | "dark";
}

export const SnapshotCardMember = ({
  member,
  schedules,
  liveStatus,
  theme,
}: SnapshotCardMemberProps) => {
  const hasSchedule = schedules.length > 0;
  const isLive = liveStatus?.status === "OPEN";
  const isUnscheduledLive = !hasSchedule && isLive;
  const liveTitle = liveStatus?.liveTitle?.trim();
  const viewerCount = liveStatus?.concurrentUserCount;
  const isDarkTheme =
    theme === "dark" ||
    (theme !== "light" &&
      typeof window !== "undefined" &&
      window.document.documentElement.classList.contains("dark"));

  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";

  const headerTextColor = getContrastColor(mainColor);
  const bodyBgGradient = isDarkTheme
    ? `linear-gradient(180deg, rgba(17,18,22,0.95) 0%, rgba(17,18,22,0.99) 100%), linear-gradient(120deg, ${hexToRgba(
        subColor,
        0.16,
      )} 0%, transparent 70%)`
    : `linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.98) 100%), linear-gradient(120deg, ${hexToRgba(
        subColor,
        0.14,
      )} 0%, transparent 72%)`;
  const borderColor = hexToRgba(mainColor, 0.3);
  const memberNameChipBgColor = hexToRgba(headerTextColor, 0.2);
  const unitChipBgColor = hexToRgba(headerTextColor, 0.16);
  const unitChipBorderColor = hexToRgba(headerTextColor, 0.34);

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[24px] transition-all duration-300 h-full bg-card"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <div
        className="relative h-[112px] flex flex-col items-start justify-between px-4 py-3 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      >
        {isLive && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow-sm">
            <span className="h-2 w-2 rounded-full bg-white" />
            LIVE
          </span>
        )}

        {member.unit_name && (
          <span
            className="inline-flex max-w-[calc(100%-76px)] items-center rounded-full border px-2.5 py-1 text-[10px] font-black leading-none shadow-sm backdrop-blur-sm break-keep"
            style={{
              backgroundColor: unitChipBgColor,
              borderColor: unitChipBorderColor,
              color: headerTextColor,
            }}
          >
            {member.unit_name}
          </span>
        )}

        <div className="flex w-full items-center gap-2.5 min-w-0">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-1 rounded-full opacity-20 blur-sm"
              style={{ backgroundColor: mainColor }}
            />
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="relative h-12 w-12 rounded-full border-2 object-cover shadow-sm"
              style={{ borderColor: "white" }}
            />
          </div>
          <span
            className="font-extrabold text-[1.9rem] leading-none break-keep line-clamp-1 px-2.5 py-1 rounded-lg shadow-sm"
            style={{
              backgroundColor: memberNameChipBgColor,
              color: headerTextColor,
            }}
          >
            {member.name}
          </span>
        </div>

      </div>

      <div
        className="flex flex-1 flex-col px-2.5 pt-3 pb-2"
        style={{ background: bodyBgGradient }}
      >
        <div className="flex flex-col gap-2 flex-1">
          {hasSchedule ? (
            schedules.map((schedule) => (
              <SnapshotCardSchedule
                key={schedule.id}
                schedule={schedule}
                accentColor={mainColor}
              />
            ))
          ) : isUnscheduledLive ? (
            <div className="flex flex-1 flex-col justify-center rounded-xl border border-red-300 border-l-4 border-l-red-500 bg-linear-to-br from-red-50 to-white p-4 text-red-950 dark:border-red-800/70 dark:border-l-red-500 dark:from-red-950/45 dark:to-red-950/20 dark:text-red-50">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-[10px] font-black text-white shadow-sm">
                  <span className="h-2 w-2 rounded-full bg-white" />
                  미등록 LIVE
                </span>
                {typeof viewerCount === "number" && (
                  <span className="rounded-md bg-white/80 px-2 py-1 text-[11px] font-black text-red-800 dark:bg-red-950/60 dark:text-red-100">
                    {viewerCount.toLocaleString()} 시청중
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-3 text-lg font-black leading-tight">
                {liveTitle || "편성표에 없는 방송이 진행 중입니다"}
              </p>
              <p className="mt-1 text-xs font-semibold text-red-800/85 dark:text-red-100/80">
                오늘 일정은 없지만 현재 방송 중입니다.
              </p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/50 bg-muted/40 p-4 gap-2">
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
