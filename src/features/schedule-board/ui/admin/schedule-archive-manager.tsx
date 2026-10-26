import { useState } from "react";
import { addDays, format, subDays } from "date-fns";
import { getHiddenMemberCodes } from "@contracts/site-publication";
import { MemberProfilePage } from "@/features/members";
import { site } from "@/shared/config/site";
import { Button } from "@/shared/ui/button";
import { DateNavigation } from "@/shared/ui/date-navigation";
import { useScheduleBoard } from "../../queries/use-schedule-board";

/** Normal authenticated admin content navigation; source archives are read-only. */
export function ScheduleArchiveManager() {
  const [profile, setProfile] = useState<string | null>(null);
  const [date, setDate] = useState(new Date());
  const day = format(date, "yyyy-MM-dd");
  const { members, schedules, loading, error } = useScheduleBoard(day, day, true);
  const hiddenCodes = getHiddenMemberCodes(site.id, Date.now());
  const profileMembers = members.filter(member => !hiddenCodes.includes(member.code));
  return <section className="space-y-4" aria-label="일정 보관 조회">
    <h2 className="font-semibold">일정 보관 조회</h2>
    <p className="text-sm text-muted-foreground">관리자 보관 일정은 읽기 전용입니다. 일반 일정은 일정 화면에서 관리할 수 있습니다.</p>
    <div className="flex items-center gap-3"><label>조회 날짜 <input aria-label="조회 날짜" type="date" value={day} onChange={event => {
      if (event.target.value) setDate(new Date(`${event.target.value}T12:00:00`));
    }} /></label><DateNavigation previousLabel="이전 날짜" nextLabel="다음 날짜" todayLabel="오늘" compactTodayLabel="오늘"
      isCurrent={day === format(new Date(), "yyyy-MM-dd")} onPrevious={() => setDate(subDays(date, 1))}
      onNext={() => setDate(addDays(date, 1))} onToday={() => setDate(new Date())} /></div>
    <div className="flex flex-wrap gap-2">{profileMembers.map(member => <Button variant="outline" key={member.uid} onClick={() => setProfile(profile === member.code ? null : member.code)}>{member.name} 프로필{member.content_access === "admin_archive" ? " · 관리자 보관" : ""}</Button>)}</div>
    {profile && profileMembers.some(member => member.code === profile) && <MemberProfilePage code={profile} includeArchived />}
    {error ? <p role="alert">일정을 불러오지 못했습니다. 관리자 로그인 상태를 확인해 주세요.</p>
      : loading ? <p>불러오는 중…</p> : <ul className="divide-y rounded border">
        {schedules.map(schedule => <li key={schedule.id} className="space-y-1 p-3">
          <p className="font-medium">{members.find(member => member.uid === schedule.member_uid)?.name ?? `멤버 ${schedule.member_uid}`} · {schedule.start_time ?? "시간 미정"} · {schedule.status}</p>
          <p className="whitespace-pre-wrap">{schedule.title}</p>
          <span className="text-xs text-muted-foreground">{schedule.content_access === "admin_archive" ? "관리자 보관 · 읽기 전용" : "일반 공개 일정"}</span>
        </li>)}{!schedules.length && <li className="p-3">등록된 일정이 없습니다.</li>}
      </ul>}
  </section>;
}
