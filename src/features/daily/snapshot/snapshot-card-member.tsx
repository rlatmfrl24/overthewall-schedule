import type { Member, ScheduleItem } from "@/lib/types";
import { getContrastColor, hexToRgba } from "@/lib/utils";
import { SnapshotCardSchedule } from "./snapshot-card-schedule";

interface SnapshotCardMemberProps {
  member: Member;
  schedules: ScheduleItem[];
}

export const SnapshotCardMember = ({
  member,
  schedules,
}: SnapshotCardMemberProps) => {
  const hasSchedule = schedules.length > 0;

  const mainColor = member.main_color || "#e5e7eb";
  const subColor = member.sub_color || member.main_color || "#f3f4f6";

  const headerTextColor = getContrastColor(mainColor);
  const bodyBgGradient = `linear-gradient(180deg, rgba(17,18,22,0.95) 0%, rgba(17,18,22,0.99) 100%), linear-gradient(120deg, ${hexToRgba(
    subColor,
    0.16,
  )} 0%, transparent 70%)`;
  const borderColor = hexToRgba(mainColor, 0.3);
  const nameBgColor = hexToRgba(getContrastColor(mainColor), 0.1);
  const memberNameChipBgColor = hexToRgba(headerTextColor, 0.2);

  return (
    <div
      className="group relative flex flex-col overflow-hidden rounded-[24px] transition-all duration-300 h-full bg-card"
      style={{ border: `1px solid ${borderColor}` }}
    >
      <div
        className="relative h-[112px] flex flex-col items-start justify-between px-4 py-3 transition-colors duration-300"
        style={{ backgroundColor: mainColor }}
      >
        {member.unit_name && (
          <span
            className="inline-block max-w-full rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm break-keep"
            style={{
              backgroundColor: nameBgColor,
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
