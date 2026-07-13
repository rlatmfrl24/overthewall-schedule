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
  const bodyBgColor = hexToRgba(subColor, 0.15);
  const headerTextInverseColor =
    headerTextColor === "#000000" ? "#ffffff" : "#000000";
  const unitChipBgColor = hexToRgba(headerTextInverseColor, 0.22);
  const unitChipBorderColor = hexToRgba(headerTextColor, 0.28);

  return (
    <section
      data-snapshot-member-card="true"
      className="overflow-hidden rounded-[20px] border border-transparent bg-card shadow-sm"
    >
      <header
        data-snapshot-member-header="true"
        className="flex min-h-16 min-w-0 items-center gap-3 px-3 py-2.5"
        style={{ backgroundColor: mainColor }}
      >
        <img
          src={`/profile/${member.code}.webp`}
          alt={member.name}
          className="h-12 w-12 shrink-0 rounded-full border-[3px] border-white object-cover shadow-md"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <h2
            className="min-w-0 max-w-full break-keep text-xl font-black leading-snug [overflow-wrap:anywhere]"
            style={{ color: headerTextColor }}
          >
            {member.name}
          </h2>
          {member.unit_name && (
            <span
              className="inline-flex min-h-6 max-w-full items-center rounded-full border px-2 py-1 text-[10px] font-extrabold leading-none"
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
      </header>

      <div
        className="flex flex-col gap-2 p-2.5"
        style={{ backgroundColor: bodyBgColor }}
      >
        {hasSchedule ? (
          schedules.map((schedule) => (
            <SnapshotCardSchedule
              key={schedule.id}
              schedule={schedule}
              accentColor={mainColor}
            />
          ))
        ) : (
          <div className="flex min-h-14 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background/55 px-3 py-2 text-center shadow-sm">
            <p className="text-sm font-semibold text-foreground/70">
              일정 없음
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
