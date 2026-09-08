import { QueryState } from "@/shared/ui/query-state";
import { useEffect, useMemo, useState } from "react";
import type { Member } from "@/features/members";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ContentPageShell } from "@/shared/ui/content-page-shell";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Megaphone,
  Users,
} from "lucide-react";
import {
  isNoticeVisibleOnDate,
  selectFeaturedNotice,
} from "../model/notice-visibility";
import {
  getNoticeImageUrls,
  getNoticeLinks,
  getNoticeRelatedMemberUids,
} from "../model/notice-content";
import type { Notice } from "../model/types";
import { useNoticePageData } from "../queries/use-notice-page-data";

const configs = {
  notice: {
    label: "공지사항",
    badge: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-200",
  },
  event: {
    label: "이벤트",
    badge: "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/10 dark:text-purple-200",
  },
} as const;

type NoticeMemberMap = Map<number, Member>;
type NoticeTypeKey = keyof typeof configs;

const resolveType = (value?: string | null): NoticeTypeKey =>
  value === "event" ? "event" : "notice";

const formatDate = (value?: number | string | null) => {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value);
  const prefix = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  return prefix?.replace(/-/g, ".") ?? raw;
};

const formatPeriod = (notice: Notice) => {
  const start = formatDate(notice.started_at);
  const end = formatDate(notice.ended_at);
  if (start && end) return `${start} ~ ${end}`;
  if (start) return `${start}부터`;
  if (end) return `${end}까지`;
  return "상시 게시";
};

const getSortTime = (notice: Notice) => {
  const time = notice.created_at ? new Date(String(notice.created_at)).getTime() : NaN;
  return Number.isNaN(time) ? notice.id ?? 0 : time;
};

const sortLatest = (notices: Notice[]) =>
  [...notices].sort((a, b) => getSortTime(b) - getSortTime(a) || (b.id ?? 0) - (a.id ?? 0));

export function NoticePage({ focusedNoticeId }: { focusedNoticeId?: number } = {}) {
  const { notices, memberMap, loading, error, refetch } = useNoticePageData();
  const activeNotices = useMemo(
    () => sortLatest(notices.filter((notice) => isNoticeVisibleOnDate(notice))),
    [notices],
  );
  const focusedNotice = focusedNoticeId
    ? activeNotices.find((notice) => notice.id === focusedNoticeId)
    : undefined;
  const featuredNotice = focusedNotice ?? selectFeaturedNotice(activeNotices);
  const noticeList = featuredNotice
    ? activeNotices.filter((notice) => notice.id !== featuredNotice.id)
    : [];

  return (
    <ContentPageShell
      title="공지사항&이벤트"
      leadingIcon={<Megaphone className="h-4.5 w-4.5 text-foreground" />}
      contentClassName="max-w-6xl gap-6"
    >
      {loading ? (
        <NoticePageSkeleton />
      ) : error ? (
        <NoticeError message={error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."} onRetry={() => void refetch()} />
      ) : !featuredNotice ? (
        <NoticeEmptyState />
      ) : (
        <>
          <FeaturedNoticeCard notice={featuredNotice} memberMap={memberMap} focused={Boolean(focusedNotice)} />
          {noticeList.length > 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">함께 확인할 안내</h2>
                <span className="text-sm font-medium text-muted-foreground">{noticeList.length}건</span>
              </div>
              <div className="overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm">
                {noticeList.map((notice) => <NoticeListItem key={notice.id} notice={notice} memberMap={memberMap} />)}
              </div>
            </section>
          ) : null}
        </>
      )}
    </ContentPageShell>
  );
}

function NoticeTypeBadge({ notice }: { notice: Notice }) {
  const config = configs[resolveType(notice.type)];
  return <Badge variant="secondary" className={cn("min-h-6 border px-2.5 font-semibold", config.badge)}>{config.label}</Badge>;
}

function RelatedMemberTags({ notice, memberMap }: { notice: Notice; memberMap: NoticeMemberMap }) {
  const uids = getNoticeRelatedMemberUids(notice);
  if (uids.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="관련 멤버">
      {uids.map((uid) => {
        const member = memberMap.get(uid);
        return <Badge key={uid} variant="outline" className="min-h-6 max-w-full break-words bg-background px-2.5 py-1 font-medium">{member ? `${member.oshi_mark ? `${member.oshi_mark} ` : ""}${member.name}` : `멤버 ${uid}`}</Badge>;
      })}
    </div>
  );
}

function NoticeMetadata({ notice, memberMap, compact = false }: { notice: Notice; memberMap: NoticeMemberMap; compact?: boolean }) {
  const hasRelatedMembers = getNoticeRelatedMemberUids(notice).length > 0;
  return (
    <dl className={cn("grid gap-3 text-sm", compact && "lg:grid-cols-2 lg:gap-x-5")}>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
        <dt className="flex items-center gap-2 leading-6 text-muted-foreground"><CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />진행 기간</dt>
        <dd className="min-w-0 break-words font-medium leading-6 tabular-nums">{formatPeriod(notice)}</dd>
      </div>
      {hasRelatedMembers ? (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
          <dt className="flex items-center gap-2 leading-6 text-muted-foreground"><Users className="h-4 w-4 shrink-0" aria-hidden="true" />관련 멤버</dt>
          <dd className="min-w-0"><RelatedMemberTags notice={notice} memberMap={memberMap} /></dd>
        </div>
      ) : null}
    </dl>
  );
}

function NoticeCarousel({ notice, compact = false }: { notice: Notice; compact?: boolean }) {
  const imageUrls = getNoticeImageUrls(notice);
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [notice.id]);
  useEffect(() => {
    setIndex((value) => Math.min(value, Math.max(imageUrls.length - 1, 0)));
  }, [imageUrls.length]);
  const current = imageUrls[index];
  const go = (direction: -1 | 1) => setIndex((value) => (value + direction + imageUrls.length) % imageUrls.length);

  return (
    <div
      className={cn("min-w-0 overflow-hidden rounded-lg border border-border/70 bg-muted/40", compact && "sm:flex sm:flex-1 sm:flex-col")}
      role="group"
      aria-roledescription="carousel"
      aria-label="공지 이미지"
    >
      <div className={cn("relative aspect-[4/3]", compact && "sm:aspect-auto sm:min-h-32 sm:flex-1")}>
        {current ? (
          <img src={current} alt={`${notice.content} 이미지 ${index + 1}`} className="absolute inset-0 h-full w-full object-cover" loading={compact ? "lazy" : "eager"} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center"><img src="/logo_otw.svg" alt="OTW" className={cn("max-w-[70%] opacity-90", compact ? "max-h-10" : "max-h-16")} /></div>
        )}
      </div>
      {imageUrls.length > 1 ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border/70 bg-card px-1">
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="이전 이미지" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground" aria-live="polite" aria-atomic="true">{index + 1} / {imageUrls.length}</span>
          <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="다음 이미지" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      ) : null}
    </div>
  );
}

function NoticeLinks({ notice }: { notice: Notice }) {
  const links = getNoticeLinks(notice);
  if (links.length === 0) return null;
  return (
    <div className="min-w-0" role="group" aria-label="관련 링크">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        {links.map((link, index) => (
          <Button key={`${link.url}-${index}`} variant="outline" asChild className="h-auto min-h-11 min-w-0 max-w-full justify-between gap-4 whitespace-normal px-3 py-2.5 text-left">
            <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}><span className="min-w-0 break-words [overflow-wrap:anywhere]">{link.label}</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">(새 탭에서 열림)</span></a>
          </Button>
        ))}
      </div>
    </div>
  );
}

function NoticeCard({ notice, memberMap, featured = false, focused = false }: { notice: Notice; memberMap: NoticeMemberMap; featured?: boolean; focused?: boolean }) {
  const Heading = featured ? "h2" : "h3";
  return (
    <article
      className={cn("grid min-w-0 gap-4 bg-card p-4 sm:gap-x-6 sm:p-6", featured ? "rounded-lg border border-border/80 shadow-sm lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)] lg:gap-x-7" : "border-b border-border/70 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]")}
      aria-labelledby={`notice-title-${notice.id}`}
      data-focused-notice={focused || undefined}
    >
      <header className={cn("min-w-0 space-y-3", featured ? "lg:col-start-2" : "sm:col-start-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <NoticeTypeBadge notice={notice} />
          {focused ? <Badge variant="outline" className="font-medium">선택한 안내</Badge> : null}
        </div>
        <Heading id={`notice-title-${notice.id}`} className={cn("whitespace-pre-wrap break-words font-semibold leading-relaxed [overflow-wrap:anywhere] [word-break:keep-all]", featured ? "text-xl sm:text-2xl" : "text-base sm:text-lg")}>{notice.content}</Heading>
      </header>
      <div className={cn("min-w-0 self-start", featured ? "lg:col-start-1 lg:row-start-1 lg:row-span-3" : "sm:col-start-1 sm:row-start-1 sm:row-span-3 sm:flex sm:self-stretch")}>
        <NoticeCarousel notice={notice} compact={!featured} />
      </div>
      <div className={cn("min-w-0", featured ? "lg:col-start-2" : "sm:col-start-2")}>
        <NoticeMetadata notice={notice} memberMap={memberMap} compact={!featured} />
      </div>
      {getNoticeLinks(notice).length > 0 ? (
        <div className={cn("min-w-0", featured ? "lg:col-start-2" : "sm:col-start-2")}>
          <NoticeLinks notice={notice} />
        </div>
      ) : null}
    </article>
  );
}

function FeaturedNoticeCard({ notice, memberMap, focused }: { notice: Notice; memberMap: NoticeMemberMap; focused: boolean }) {
  return <NoticeCard notice={notice} memberMap={memberMap} featured focused={focused} />;
}

export function NoticeListItem({ notice, memberMap }: { notice: Notice; memberMap: NoticeMemberMap }) {
  return <NoticeCard notice={notice} memberMap={memberMap} />;
}

function NoticePageSkeleton() {
  return <div className="space-y-5" aria-label="공지사항 로딩 중"><div className="grid gap-5 rounded-lg border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]"><Skeleton className="aspect-[4/3]" /><div><Skeleton className="h-6 w-28" /><Skeleton className="mt-4 h-8 w-full" /><Skeleton className="mt-6 h-20 w-full" /><Skeleton className="mt-5 h-11 w-36" /></div></div></div>;
}

function NoticeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <QueryState state="error" title={message} icon={<AlertCircle aria-hidden="true" className="size-5 text-destructive" />}
    className="rounded-lg border border-destructive/30 bg-destructive/5 p-5" action={{ label: "다시 불러오기", onClick: onRetry }} />;
}

function NoticeEmptyState() {
  return <QueryState state="empty" title="표시할 공지사항이 없습니다." description="새로운 소식이 등록되면 이곳에 표시됩니다."
    icon={<Megaphone aria-hidden="true" className="size-8 text-muted-foreground" />} className="min-h-80 rounded-lg border border-dashed bg-muted/20 px-6 py-14" />;
}
