import { useMemo, type CSSProperties } from "react";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { getContrastColor } from "@/shared/lib/utils";
import {
  buildNoScheduleMemberEntries,
  buildScheduleBoardModel,
  formatScheduleTime,
  getScheduleDisplayTitle,
  type NoScheduleMemberEntry,
  type ScheduleBoardEntry,
  type ScheduleSideGroupKey,
} from "../chronological-schedule-utils";

const sideGroupMeta = {
  guerrilla: { title: "게릴라 예정" },
  undecided: { title: "미정" },
  off: { title: "휴방" },
};

function memberColors(member: Member): CSSProperties {
  const main = /^#[0-9a-f]{6}$/i.test(member.main_color ?? "") ? member.main_color! : "#31A4A9";
  return {
    "--snapshot-member-main": main,
    "--snapshot-member-sub": member.sub_color || main,
    "--snapshot-member-ink": getContrastColor(main),
  } as CSSProperties;
}

export const SnapshotTimeline = ({ members, schedules }: { members: Member[]; schedules: ScheduleItem[] }) => {
  const board = useMemo(() => buildScheduleBoardModel(schedules), [schedules]);
  const noSchedule = useMemo(() => buildNoScheduleMemberEntries(members, schedules), [members, schedules]);
  const memberMap = useMemo(() => new Map(members.map(member => [member.uid, member])), [members]);
  const timed = board.mainItems.filter(entry => memberMap.has(entry.schedule.member_uid));
  const pending = ["guerrilla", "undecided"] as const;
  const hasPending = pending.some(key => board.sideGroups[key].some(entry => memberMap.has(entry.schedule.member_uid)));
  const off = board.sideGroups.off.filter(entry => memberMap.has(entry.schedule.member_uid));

  return <div className="snapshot-programme">
    <section className="snapshot-broadcasts" aria-label="방송 일정">
      <div className="snapshot-section-heading">
        <h2>방송 일정</h2>
      </div>
      {timed.length ? <ol className="snapshot-running-order">
        {timed.map(entry => <SnapshotScheduleRow key={entry.schedule.id} entry={entry} member={memberMap.get(entry.schedule.member_uid)!} />)}
      </ol> : <p className="snapshot-empty">시간이 확정된 방송이 없습니다.</p>}
    </section>

    {hasPending && <div className="snapshot-pending">
      {pending.map(key => <SnapshotSideGroup key={key} groupKey={key} items={board.sideGroups[key]} memberMap={memberMap} />)}
    </div>}

    {(off.length > 0 || noSchedule.length > 0) && <div className="snapshot-status-summary">
      {off.length > 0 && <SnapshotSideGroup groupKey="off" items={off} memberMap={memberMap} />}
      {noSchedule.length > 0 && <SnapshotNoScheduleGroup entries={noSchedule} />}
    </div>}
    {members.length === 0 && <p className="snapshot-empty">표시할 멤버가 없습니다.</p>}
  </div>;
};

function SnapshotScheduleRow({ entry, member }: { entry: ScheduleBoardEntry; member: Member }) {
  const title = getScheduleDisplayTitle(entry.schedule);
  return <li className="snapshot-programme-row" style={memberColors(member)}>
    <time className="snapshot-time" dateTime={entry.schedule.start_time ?? undefined}>{formatScheduleTime(entry.schedule.start_time)}</time>
    <div className="snapshot-programme-copy">
      <div className="snapshot-member-line">
        {member.unit_name && <span className="snapshot-unit">{member.unit_name}</span>}
        <p className="snapshot-member-name">{member.name}</p>
      </div>
      <h3 className="snapshot-programme-title whitespace-normal break-words">{title}</h3>
    </div>
    <img src={`/profile/${member.code}.webp`} alt="" className="snapshot-portrait" />
  </li>;
}

function SnapshotSideGroup({ groupKey, items, memberMap }: {
  groupKey: ScheduleSideGroupKey; items: ScheduleBoardEntry[]; memberMap: Map<number, Member>;
}) {
  const entries = items.filter(entry => memberMap.has(entry.schedule.member_uid));
  if (!entries.length) return null;
  const { title } = sideGroupMeta[groupKey];
  return <section className="snapshot-side-group" data-snapshot-status={groupKey} aria-label={title}>
    <div className="snapshot-section-heading snapshot-secondary-heading">
      <h2>{title}</h2>
    </div>
    <ul className="snapshot-member-grid">
      {entries.map(({ schedule }) => {
        const member = memberMap.get(schedule.member_uid)!;
        const title = schedule.title?.trim();
        const time = formatScheduleTime(schedule.start_time);
        // The group already states the status; retain any actual editorial title.
        const showTitle = title && title !== schedule.status;
        return <li key={schedule.id} className="snapshot-compact-member" style={memberColors(member)}>
          <img src={`/profile/${member.code}.webp`} alt="" className="snapshot-small-portrait" />
          <div>
            <p className="snapshot-compact-name">{member.name}{time && <time className="snapshot-side-time" dateTime={schedule.start_time ?? undefined}>{time}</time>}</p>
            {showTitle && <p className="snapshot-compact-title">{getScheduleDisplayTitle(schedule)}</p>}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}

function SnapshotNoScheduleGroup({ entries }: { entries: NoScheduleMemberEntry[] }) {
  return <section className="snapshot-side-group" aria-label="일정 없음">
    <div className="snapshot-section-heading snapshot-secondary-heading">
      <h2>일정 없음</h2>
    </div>
    <p className="snapshot-group-note">오늘 등록된 일정이 없습니다</p>
    <ul className="snapshot-member-grid">
      {entries.map(({ member }) => <li key={member.uid} className="snapshot-compact-member" style={memberColors(member)}>
        <img src={`/profile/${member.code}.webp`} alt="" className="snapshot-small-portrait" />
        <p className="snapshot-compact-name">{member.name}</p>
      </li>)}
    </ul>
  </section>;
}
