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
    if (isAllSelected) {
      // 전체 선택 상태에서 멤버 클릭 -> 해당 멤버만 선택
      onChange([uid]);
    } else if (selectedUids?.includes(uid)) {
      // 이미 선택된 멤버 클릭 -> 선택 해제
      const newUids = selectedUids.filter((id) => id !== uid);
      if (newUids.length === 0) {
        onChange(null); // 모두 해제되면 전체 선택
      } else {
        onChange(newUids);
      }
    } else {
      // 선택되지 않은 멤버 클릭 -> 선택 추가
      onChange([...(selectedUids || []), uid]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {/* 전체 선택 Chip */}
      <button
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
