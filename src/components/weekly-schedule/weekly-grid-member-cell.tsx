import type { Member } from "@/lib/types";

interface WeeklyGridMemberCellProps {
  member: Member;
  mainColor: string;
}

export const WeeklyGridMemberCell = ({
  member,
  mainColor,
}: WeeklyGridMemberCellProps) => {
  return (
    <div className="sticky left-0 z-20 bg-white border-r border-gray-200 border-b border-gray-100 group-last:border-b-0">
      <div
        className="w-full h-full flex flex-col items-center justify-center p-1 md:p-2 gap-1 md:gap-2 transition-colors hover:bg-gray-50"
        style={{
          borderLeft: `4px solid ${mainColor}`,
        }}
      >
        <div className="relative shrink-0 w-8 h-8 md:w-12 md:h-12">
          <img
            src={`/profile/${member.code}.webp`}
            alt={member.name}
            className="w-full h-full rounded-full object-cover border shadow-sm"
            style={{ borderColor: mainColor }}
          />
        </div>
        <span className="text-[10px] md:text-xs font-bold text-center text-gray-900 break-keep leading-tight">
          {member.name}
        </span>
      </div>
    </div>
  );
};
