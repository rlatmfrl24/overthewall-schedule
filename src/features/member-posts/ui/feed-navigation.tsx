import { Clock3 } from "lucide-react";
import type { MemberDto } from "@contracts/members";
import { FilterChip } from "@/shared/ui/filter-chip";
import { getContrastColor } from "@/shared/lib/utils";

export function FeedMemberList({ members, selected, onSelect }: {
  members: MemberDto[]; selected: number | null; onSelect: (uid: number | null) => void;
}) {
  return <nav aria-label="멤버 선택" className="flex min-w-0 flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap">
    <FilterChip selected={selected === null} className="px-2 py-1 text-xs lg:min-h-10 lg:w-full lg:justify-start lg:px-3" onClick={() => onSelect(null)}>전체 멤버</FilterChip>
    {members.map(member => {
      const active = selected === member.uid;
      const accent = member.main_color || "#6366f1";
      return <FilterChip key={member.uid} selected={active} aria-label={member.name}
        className="max-w-full gap-1 px-2 py-1 text-xs lg:min-h-10 lg:w-full lg:justify-start lg:px-3" onClick={() => onSelect(active ? null : member.uid)}
        style={{ borderColor: accent, backgroundColor: active ? accent : undefined, color: active ? getContrastColor(accent) : "var(--foreground)" }}>
        {member.oshi_mark && <span aria-hidden="true">{member.oshi_mark}</span>}
        <span className="min-w-0 break-words">{member.name}</span>
      </FilterChip>;
    })}
  </nav>;
}

export function FeedUpdatedAt({ value, loading }: { value: string | null; loading: boolean }) {
  const date = value ? new Date(value) : null;
  const valid = date && !Number.isNaN(date.getTime());
  const text = valid ? date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }) : null;
  return <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground" title="현재 피드에 포함된 게시글 데이터가 마지막으로 수집·갱신된 시각입니다.">
    <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
    <span>피드 업데이트</span>
    {text ? <time dateTime={date?.toISOString()}>{text} KST</time> : <span>{loading ? "확인 중" : "시각 확인 불가"}</span>}
    {loading && text && <span>· 확인 중</span>}
  </div>;
}
