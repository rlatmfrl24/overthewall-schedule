import type { MemberDto } from "@contracts/members";
import { cn, getContrastColor } from "@/shared/lib/utils";
import { FilterChip } from "@/shared/ui/filter-chip";

export function MemberFilter({ members, selectedUids, onChange, layout = "wrap", deselectOnRepeat = true }: {
  members: Pick<MemberDto, "uid" | "name" | "main_color" | "oshi_mark">[];
  selectedUids: number[] | null;
  onChange: (uids: number[] | null) => void;
  layout?: "wrap" | "vertical";
  deselectOnRepeat?: boolean;
}) {
  const all = !selectedUids?.length;
  return <div role="group" aria-label="멤버 필터" className={cn("flex gap-2 px-px py-1", layout === "vertical" ? "flex-col" : "flex-wrap")}>
    <FilterChip selected={all} layout={layout} onClick={() => onChange(null)}
      className={layout === "vertical" && all ? "border-foreground bg-foreground text-background" : undefined}>전체</FilterChip>
    {members.map((member) => {
      const selected = selectedUids?.includes(member.uid) ?? false;
      const accent = member.main_color || "#6366f1";
      return <FilterChip key={member.uid} selected={selected} layout={layout} aria-label={member.name}
        onClick={() => onChange(selected && deselectOnRepeat ? null : [member.uid])}
        className={layout === "vertical" ? cn("bg-background", selected ? "text-foreground" : "text-muted-foreground") : undefined}
        style={layout === "vertical" ? selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}` } : undefined : {
          backgroundColor: selected ? accent : "transparent", borderColor: accent,
          color: selected ? getContrastColor(accent) : "var(--foreground)",
        }}>
        {member.oshi_mark && <span aria-hidden="true" className="text-xs">{member.oshi_mark}</span>}
        <span className="min-w-0 break-words">{member.name}</span>
      </FilterChip>;
    })}
  </div>;
}
