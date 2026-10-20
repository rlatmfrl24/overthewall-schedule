import { User } from "lucide-react";
import type { Member } from "@/features/members";
import { AuthenticatedImage } from "@/shared/ui/authenticated-image";

interface WeeklyGridMemberCellProps {
  member: Member;
  mainColor: string;
}

export const WeeklyGridMemberCell = ({
  member,
  mainColor,
}: WeeklyGridMemberCellProps) => {
  return (
    <div role="rowheader" className="sticky left-0 z-20 bg-card border-r border-border border-b border-border group-last:border-b-0" style={{ borderLeft: `4px solid ${mainColor}` }}>
      <div
        className="sticky top-[6rem] w-full flex flex-col items-center p-2 py-3 gap-2 transition-colors hover:bg-muted/50"
      >
        <div className="relative shrink-0 w-10 h-10 lg:w-12 lg:h-12">
          <AuthenticatedImage protectedImage={false} showPlaceholder
            fallback={<span aria-hidden="true" className="absolute inset-0 flex items-center justify-center rounded-full bg-muted text-muted-foreground"><User className="h-5 w-5" /></span>}
            src={`/profile/${member.code}.webp`}
            alt=""
            className="w-full h-full rounded-full object-cover border shadow-sm"
            style={{ borderColor: mainColor }}
          />
        </div>
        <span className="text-sm lg:text-base font-bold text-center text-foreground [overflow-wrap:anywhere] leading-normal">
          {member.name}
        </span>
      </div>
    </div>
  );
};
