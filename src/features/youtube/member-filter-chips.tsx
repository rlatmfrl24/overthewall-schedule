import type { MouseEvent } from "react";
import type { Member } from "@/lib/types";
import { cn, getContrastColor } from "@/lib/utils";

interface MemberFilterChipsProps {
  members: Member[];
  selectedUids: number[] | null; // null이면 전체 선택
  onChange: (selectedUids: number[] | null) => void;
}

export const MemberFilterChips = ({
  members,
  selectedUids,
  onChange,
}: MemberFilterChipsProps) => {
  const isAllSelected = selectedUids === null || selectedUids.length === 0;

  const createRipple = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;
    const ripple = document.createElement("span");

    ripple.style.width = `${diameter}px`;
    ripple.style.height = `${diameter}px`;
    ripple.style.left = `${event.clientX - rect.left - radius}px`;
    ripple.style.top = `${event.clientY - rect.top - radius}px`;
    ripple.className = "ripple";

    const existingRipple = button.querySelector(".ripple");
    if (existingRipple) {
      existingRipple.remove();
    }

    button.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 600);
  };

  const handleAllClick = () => {
    onChange(null);
  };

  const handleMemberClick = (uid: number) => {
    if (!isAllSelected && selectedUids?.includes(uid)) {
      onChange(null);
    } else {
      onChange([uid]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* 전체 선택 Chip */}
      <button
        data-member-filter-chip="all"
        onClick={(event) => {
          createRipple(event);
          handleAllClick();
        }}
        className={cn(
          "px-3 py-1.5 rounded-full text-sm font-medium",
          "border-2",
          "relative overflow-hidden",
          "transition-all duration-200 ease-out",
          "hover:scale-105",
          isAllSelected
            ? "bg-primary text-primary-foreground border-primary shadow-sm"
            : "bg-transparent text-muted-foreground border-border hover:border-primary/50"
        )}
      >
        전체
      </button>

      {/* 멤버별 Chip */}
      {members.map((member) => {
        const isSelected = selectedUids?.includes(member.uid);
        const mainColor = member.main_color || "#6366f1";
        const textColor = isSelected ? getContrastColor(mainColor) : mainColor;

        return (
          <button
            key={member.uid}
            data-member-filter-chip="member"
            data-member-uid={member.uid}
            onClick={(event) => {
              createRipple(event);
              handleMemberClick(member.uid);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium",
              "border-2",
              "relative overflow-hidden",
              "transition-all duration-200 ease-out",
              "hover:scale-105",
              isSelected && "shadow-sm"
            )}
            style={{
              backgroundColor: isSelected ? mainColor : "transparent",
              borderColor: mainColor,
              color: textColor,
            }}
          >
            {member.oshi_mark && (
              <span className="text-xs">{member.oshi_mark}</span>
            )}
            {member.name}
          </button>
        );
      })}
    </div>
  );
};
