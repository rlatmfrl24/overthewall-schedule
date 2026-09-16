import { useMemo, type CSSProperties } from "react";
import { format, parseISO } from "date-fns";
import { ko } from "date-fns/locale";
import { Calendar, HelpCircle, Moon, Zap } from "lucide-react";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { ScheduleUpdatedAt } from "../../components/schedule-updated-at";
import { buildScheduleBoardModel, buildNoScheduleMemberEntries, formatScheduleTime, getScheduleDisplayTitle } from "../chronological-schedule-utils";
import "./snapshot-legacy.css";

const groups = [
  { key: "guerrilla", title: "게릴라 예정", icon: Zap },
  { key: "undecided", title: "미정", icon: HelpCircle },
  { key: "off", title: "휴방", icon: Moon },
] as const;

function Portrait({ member }: { member: Member }) {
  return <img src={`/profile/${member.code}.webp`} alt="" className="legacy-avatar"
    style={{ "--legacy-member": member.main_color || "var(--legacy-accent)" } as CSSProperties} />;
}

export function SnapshotLegacy({ date, members, schedules, updatedAt }: {
  date: string; members: Member[]; schedules: ScheduleItem[]; updatedAt: string | null | undefined;
}) {
  const board = useMemo(() => buildScheduleBoardModel(schedules), [schedules]);
  const memberMap = useMemo(() => new Map(members.map(member => [member.uid, member])), [members]);
  const noSchedule = useMemo(() => buildNoScheduleMemberEntries(members, schedules), [members, schedules]);
  const timed = board.mainItems.filter(entry => memberMap.has(entry.schedule.member_uid));
  return <>
    <header className="legacy-header legacy-panel">
      <div className="legacy-brand"><h1>오늘의 편성표</h1><img src="/logo_otw.svg" alt="오버더월" width={76} height={25} /></div>
      <time className="legacy-date" dateTime={date}>{format(parseISO(date), "yyyy년 M월 d일 EEEE", { locale: ko })}</time>
      <ScheduleUpdatedAt updatedAt={updatedAt} label="최종 편집" className="legacy-updated" />
    </header>
    {timed.length > 0 && <section className="legacy-panel" aria-label="방송 일정">
      <div className="legacy-table-heading"><span>시간</span><span>멤버 / 일정</span></div>
      <ol className="legacy-list">{timed.map(({ schedule }) => {
        const member = memberMap.get(schedule.member_uid)!;
        return <li key={schedule.id} className="legacy-broadcast">
          <time className="legacy-time" dateTime={schedule.start_time ?? undefined}>{formatScheduleTime(schedule.start_time)}</time>
          <div className="legacy-programme"><Portrait member={member} /><div className="legacy-copy">
            <div className="legacy-member-line"><span>{member.name}</span>{member.unit_name && <span className="legacy-unit">{member.unit_name}</span>}</div>
            <h3>{getScheduleDisplayTitle(schedule)}</h3>
          </div></div>
        </li>;
      })}</ol>
    </section>}
    {groups.map(({ key, title, icon: Icon }) => {
      const entries = board.sideGroups[key].filter(entry => memberMap.has(entry.schedule.member_uid));
      if (!entries.length) return null;
      return <section key={key} className="legacy-panel" aria-label={title}>
        <div className="legacy-group-heading"><Icon aria-hidden="true" /><h2>{title}</h2><span>{entries.length}건</span></div>
        <ul className="legacy-list">{entries.map(({ schedule }) => {
          const member = memberMap.get(schedule.member_uid)!;
          const time = formatScheduleTime(schedule.start_time);
          return <li key={schedule.id} className="legacy-side-member"><Portrait member={member} /><div className="legacy-copy">
            <h3>{member.name}</h3><p>{getScheduleDisplayTitle(schedule)}</p>
          </div>{time && <time dateTime={schedule.start_time ?? undefined}>{time}</time>}</li>;
        })}</ul>
      </section>;
    })}
    {noSchedule.length > 0 && <section className="legacy-panel legacy-unscheduled" aria-label="일정 없음">
      <div className="legacy-group-heading"><Calendar aria-hidden="true" /><h2>일정 없음</h2><span>{noSchedule.length}명</span></div>
      <p>오늘 등록된 일정이 없습니다</p>
      <ul className="legacy-list">{noSchedule.map(({ member }) => <li className="legacy-side-member" key={member.uid}><Portrait member={member} /><h3>{member.name}</h3></li>)}</ul>
    </section>}
    {members.length === 0 && <p className="legacy-empty">표시할 멤버가 없습니다.</p>}
    <footer className="legacy-footer"><span>한국시간(KST) 기준 · 일정은 변경될 수 있습니다</span><span>otw-schedule.info</span></footer>
  </>;
}
