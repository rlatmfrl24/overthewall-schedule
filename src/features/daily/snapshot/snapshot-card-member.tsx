import type { Member, ScheduleItem } from "@/lib/types";
import { getContrastColor, hexToRgba } from "@/lib/utils";
import { SnapshotCardSchedule } from "./snapshot-card-schedule";

interface SnapshotCardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
  theme?: "light" | "dark";
}

export const SnapshotCardMember = ({
  member,
  schedules,
  theme,
}: SnapshotCardMemberProps) => {
  const hasSchedule = schedules.length > 0;
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
  const memberNameChipBgColor =
    headerTextColor === "#000000"
      ? "rgba(255, 255, 255, 0.76)"
      : "rgba(0, 0, 0, 0.36)";
  const unitChipBgColor = hexToRgba(headerTextColor, 0.16);
  const unitChipBorderColor = hexToRgba(headerTextColor, 0.34);

  return (
    <div
      className="group relative flex h-full flex-col overflow-hidden rounded-[22px] bg-card shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all duration-300 dark:shadow-[0_14px_30px_rgba(0,0,0,0.28)]"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <div
        className="relative h-[108px] px-4 py-3 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      >
        <div className="absolute right-3 top-3 flex max-w-[calc(100%-24px)] flex-wrap items-center justify-end gap-1.5">
          {member.unit_name && (
            <span
              className="inline-flex h-6 max-w-[190px] items-center truncate rounded-full border px-2.5 text-[10px] font-black leading-none shadow-sm backdrop-blur-sm"
              style={{
                backgroundColor: unitChipBgColor,
                borderColor: unitChipBorderColor,
                color: headerTextColor,
              }}
            >
              {member.unit_name}
            </span>
          )}
        </div>

        <div className="absolute bottom-3 left-4 right-4 flex min-w-0 items-end gap-3">
          <div className="relative shrink-0">
            <div
              className="absolute -inset-1 rounded-full opacity-20 blur-sm"
              style={{ backgroundColor: mainColor }}
            />
            <img
              src={`/profile/${member.code}.webp`}
              alt={member.name}
              className="relative h-14 w-14 rounded-full border-[3px] object-cover shadow-[0_8px_16px_rgba(15,23,42,0.18)]"
              style={{ borderColor: "white" }}
            />
          </div>
          <span
            className="mb-0.5 min-w-0 max-w-[calc(100%-68px)] rounded-xl px-3 py-1.5 text-[1.62rem] font-black leading-none tracking-tight shadow-sm line-clamp-1"
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
        className="flex flex-1 flex-col px-3 pb-3 pt-3"
        style={{ background: bodyBgGradient }}
      >
        <div className="flex flex-1 flex-col gap-2.5">
          {hasSchedule ? (
            schedules.map((schedule) => (
              <SnapshotCardSchedule
                key={schedule.id}
                schedule={schedule}
                accentColor={mainColor}
              />
            ))
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-white/70 p-5 dark:border-zinc-700 dark:bg-zinc-900/70">
              <p className="text-lg font-black text-zinc-500 dark:text-zinc-300">
                일정 없음
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
