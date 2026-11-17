import type { CSSProperties, MouseEvent } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Plus, UserRound } from "lucide-react";
import type { Member } from "@/features/members";
import type { ScheduleItem } from "@/features/schedules";
import { buildChzzkLiveUrl, convertChzzkToLiveUrl, type ChzzkLiveStatusMap } from "@/features/chzzk";
import { AuthenticatedImage } from "@/shared/ui/authenticated-image";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { cn, getContrastColor } from "@/shared/lib/utils";
import iconX from "@/assets/icon_x.svg";
import iconYoutube from "@/assets/icon_youtube.svg";
import iconChzzk from "@/assets/icon_chzzk.png";
import { CardSchedule } from "./card-schedule";
import "./luvdia-member-card.css";

interface LuvDiaMemberCardProps {
  member: Member;
  schedules: ScheduleItem[];
  isToday: boolean;
  liveStatus?: ChzzkLiveStatusMap[number];
  isLiveStatusPending?: boolean;
  onScheduleClick?: (schedule: ScheduleItem) => void;
  onAddSchedule?: (memberUid: number) => void;
}

export function LuvDiaMemberCard({
  member,
  schedules,
  isToday,
  liveStatus,
  isLiveStatusPending = false,
  onScheduleClick,
  onAddSchedule,
}: LuvDiaMemberCardProps) {
  const mainColor = member.main_color || "#e5e7eb";
  const isLive = isToday && liveStatus?.status === "OPEN";
  const liveUrl = buildChzzkLiveUrl(liveStatus?.channelId) || convertChzzkToLiveUrl(member.url_chzzk);
  const channelUrl = isLive ? liveUrl : member.url_chzzk;
  const viewerCount = liveStatus?.concurrentUserCount;
  const statusText = isLiveStatusPending
    ? "상태 확인 중"
    : liveStatus?.status === "CLOSE"
      ? null
      : "상태 확인 불가";

  const openBroadcast = (event: MouseEvent<HTMLElement>) => {
    if (!isLive || !liveUrl) return;
    if (event.target instanceof Element && event.target.closest('a, button, [role="button"]')) return;
    window.open(liveUrl, "_blank", "noreferrer");
  };

  return (
    <article
      aria-label={`${member.name} 스케쥴`}
      data-daily-member-card="true"
      className={cn("luvdia-member-card", isLive && liveUrl && "is-live")}
      style={{
        "--member-main": mainColor,
        "--member-sub": member.sub_color || mainColor,
        "--member-text": getContrastColor(mainColor),
      } as CSSProperties}
      onClick={openBroadcast}
    >
      <header className="luvdia-member-header">
        <div className="luvdia-member-avatar-slot">
          <AuthenticatedImage protectedImage={false} showPlaceholder src={`/profile/${member.code}.webp`} alt={member.name} className="luvdia-member-avatar" />
          {isLive && (
            <span
              className="luvdia-member-live"
              aria-label={typeof viewerCount === "number" ? `LIVE, ${viewerCount.toLocaleString()}명 시청중` : "LIVE"}
            >
              <span className="luvdia-live-dot" aria-hidden="true" />
              LIVE
              {typeof viewerCount === "number" && <span className="luvdia-live-viewers">{viewerCount.toLocaleString()} 시청중</span>}
            </span>
          )}
        </div>
        <div className="luvdia-member-identity">
          <h2 data-member-name="true">{member.name}</h2>
          {isToday && !isLive && statusText && <span className="luvdia-member-status" aria-live="polite">{statusText}</span>}
        </div>
        <div className="luvdia-member-links">
          {(member.url_youtube || member.url_twitter) && (
            <nav aria-label={`${member.name} 외부 채널`} className="luvdia-member-socials">
              {member.url_youtube && <a href={member.url_youtube} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} YouTube`} title="YouTube"><img src={iconYoutube} alt="" /></a>}
              {member.url_twitter && <a href={member.url_twitter} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} X`} title="X"><img src={iconX} alt="" /></a>}
            </nav>
          )}
          <Link to="/profile/$code" params={{ code: member.code }} aria-label={`${member.name} 프로필`} className="luvdia-member-profile">프로필<UserRound aria-hidden="true" /></Link>
        </div>
      </header>
      <div className="luvdia-member-body">
        <div className="luvdia-member-schedules">
          {schedules.length > 0 ? schedules.map(schedule => (
            <CardSchedule key={schedule.id} schedule={schedule} onClick={onScheduleClick} accentColor={mainColor} />
          )) : (
            <div className="luvdia-member-empty" data-schedule-empty-state="true">
              <span>일정 없음</span>
              {onAddSchedule && <Button variant="outline" size="sm" onClick={event => { event.stopPropagation(); onAddSchedule(member.uid); }}><Plus aria-hidden="true" />스케쥴 추가하기</Button>}
            </div>
          )}
        </div>
        {(channelUrl || (onAddSchedule && schedules.length > 0)) && (
          <div className="luvdia-member-actions">
            {channelUrl && (
              <a href={channelUrl} target="_blank" rel="noopener noreferrer" className={cn("luvdia-member-watch", isLive && "is-live")} aria-label={`${member.name} ${isLive ? "치지직 방송 보기" : "치지직 채널"}`}>
                <img src={iconChzzk} alt="" />{isLive ? "방송 보기" : "치지직 채널"}<ArrowUpRight aria-hidden="true" />
              </a>
            )}
            {onAddSchedule && schedules.length > 0 && <Button variant="outline" size="icon" className="luvdia-member-add" aria-label={`${member.name} 스케쥴 추가`} title="스케쥴 추가" onClick={event => { event.stopPropagation(); onAddSchedule(member.uid); }}><Plus aria-hidden="true" /></Button>}
          </div>
        )}
      </div>
    </article>
  );
}

export function LuvDiaMemberCardSkeleton() {
  return (
    <article aria-label="멤버 일정 불러오는 중" aria-busy="true" className="luvdia-member-card luvdia-member-skeleton">
      <div className="luvdia-member-header">
        <Skeleton className="luvdia-member-avatar" />
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-full rounded-full" />
      </div>
      <div className="luvdia-member-body">
        <div className="luvdia-member-schedules"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-24 w-full rounded-xl" /></div>
        <Skeleton className="mt-4 h-11 w-full rounded-xl" />
      </div>
    </article>
  );
}
