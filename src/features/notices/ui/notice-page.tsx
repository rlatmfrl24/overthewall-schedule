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
  ExternalLink,
  Megaphone,
  RefreshCw,
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
    card: "border-indigo-200/80 bg-indigo-50/70 dark:border-indigo-400/20 dark:bg-indigo-400/10",
    image: "border-indigo-200/80 bg-indigo-50/80 dark:border-indigo-400/20 dark:bg-indigo-400/10",
    icon: "bg-indigo-600 text-white",
  },
  event: {
    label: "이벤트",
    badge: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
    card: "border-amber-200/80 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/10",
    image: "border-amber-200/80 bg-amber-50/80 dark:border-amber-400/20 dark:bg-amber-400/10",
    icon: "bg-amber-500 text-white",
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

const formatPeriod = (notice: Notice) =>
  !notice.started_at && !notice.ended_at
    ? "상시 게시"
    : `${formatDate(notice.started_at) ?? "..."} ~ ${formatDate(notice.ended_at) ?? "..."}`;

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
                <h2 className="text-base font-semibold">진행중인 전체 안내</h2>
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
  return <Badge variant="secondary" className={cn("h-7 border px-3 font-semibold", config.badge)}>{config.label}</Badge>;
}

function RelatedMemberTags({ notice, memberMap }: { notice: Notice; memberMap: NoticeMemberMap }) {
  const uids = getNoticeRelatedMemberUids(notice);
  if (uids.length === 0) return <span className="text-sm font-medium text-muted-foreground">OTW</span>;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="관련 멤버">
      {uids.map((uid) => {
        const member = memberMap.get(uid);
        return <Badge key={uid} variant="outline">{member ? `${member.oshi_mark ? `${member.oshi_mark} ` : ""}${member.name}` : `멤버 ${uid}`}</Badge>;
      })}
    </div>
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
  const config = configs[resolveType(notice.type)];
  const go = (direction: -1 | 1) => setIndex((value) => (value + direction + imageUrls.length) % imageUrls.length);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-lg border shadow-sm",
        config.image,
        compact ? "aspect-[4/3] min-h-28 sm:h-32 sm:w-44 sm:shrink-0" : "min-h-56 sm:min-h-64 lg:min-h-full",
      )}
      aria-roledescription="carousel"
      aria-label="공지 이미지"
    >
      {current ? (
        <img src={current} alt={`${notice.content} 이미지 ${index + 1}`} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center"><img src="/logo_otw.svg" alt="OTW" className={cn("max-w-[70%] opacity-90", compact ? "max-h-10" : "max-h-20")} /></div>
      )}
      {imageUrls.length > 1 ? (
        <>
          <Button type="button" variant="secondary" size="icon-sm" className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90" aria-label="이전 이미지" onClick={() => go(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" variant="secondary" size="icon-sm" className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/90" aria-label="다음 이미지" onClick={() => go(1)}><ChevronRight className="h-4 w-4" /></Button>
          <span className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/90 px-2 py-1 text-xs font-semibold" aria-live="polite">{index + 1} / {imageUrls.length}</span>
        </>
      ) : null}
    </div>
  );
}

function NoticeLinks({ notice, compact = false }: { notice: Notice; compact?: boolean }) {
  const links = getNoticeLinks(notice);
  if (links.length === 0) return compact ? null : <div className="flex items-center gap-2 rounded-lg border border-dashed bg-background/70 px-3 py-2 text-sm text-muted-foreground"><ExternalLink className="h-4 w-4" />상세 링크 준비중</div>;
  return (
    <div className={cn("flex flex-wrap gap-2", !compact && "flex-col items-stretch sm:flex-row")} aria-label="관련 링크">
      {links.map((link, index) => (
        <Button key={`${link.url}-${index}`} variant={compact ? "outline" : index === 0 ? "default" : "outline"} size={compact ? "sm" : "default"} asChild className={cn("h-auto max-w-full min-w-0 whitespace-normal break-words text-left", !compact && "justify-between")}>
          <a href={link.url} target="_blank" rel="noopener noreferrer" title={link.url}>{link.label}<ArrowUpRight className="h-4 w-4" /></a>
        </Button>
      ))}
    </div>
  );
}

function FeaturedNoticeCard({ notice, memberMap, focused }: { notice: Notice; memberMap: NoticeMemberMap; focused: boolean }) {
  const config = configs[resolveType(notice.type)];
  return (
    <article className={cn("overflow-hidden rounded-lg border bg-card shadow-sm", config.card)} data-focused-notice={focused || undefined}>
      <div className="grid min-h-[360px] lg:grid-cols-[22rem_minmax(0,1fr)] xl:grid-cols-[26rem_minmax(0,1fr)]">
        <NoticeCarousel notice={notice} />
        <div className="flex min-w-0 flex-col justify-between gap-8 p-6 sm:p-7 lg:p-8 xl:p-9">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", config.icon)} aria-hidden="true"><Megaphone className="h-4.5 w-4.5" /></span>
            <NoticeTypeBadge notice={notice} />
            {focused ? <Badge variant="outline">선택한 안내</Badge> : null}
          </div>
          <div className="min-w-0 space-y-5">
            <p className="max-w-5xl whitespace-pre-wrap break-words text-2xl font-semibold leading-relaxed sm:text-3xl lg:text-[2.35rem]">{notice.content}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="mb-1 text-xs font-semibold text-muted-foreground">게시자</dt><dd className="font-medium">OTW</dd></div>
              <div><dt className="mb-1 text-xs font-semibold text-muted-foreground">진행 기간</dt><dd className="flex items-center gap-2 font-medium"><CalendarDays className="h-4 w-4" />{formatPeriod(notice)}</dd></div>
            </dl>
            <div><p className="mb-2 text-xs font-semibold text-muted-foreground">관련 멤버</p><RelatedMemberTags notice={notice} memberMap={memberMap} /></div>
          </div>
          <NoticeLinks notice={notice} />
        </div>
      </div>
    </article>
  );
}

function NoticeListItem({ notice, memberMap }: { notice: Notice; memberMap: NoticeMemberMap }) {
  return (
    <article className="grid gap-5 border-b border-border/70 p-5 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:p-6">
      <NoticeCarousel notice={notice} compact />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2"><NoticeTypeBadge notice={notice} /><span className="text-sm font-medium text-muted-foreground">OTW</span><span className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><CalendarDays className="h-4 w-4" />{formatPeriod(notice)}</span></div>
        <p className="whitespace-pre-wrap break-words text-lg font-semibold leading-relaxed sm:text-xl">{notice.content}</p>
        <RelatedMemberTags notice={notice} memberMap={memberMap} />
        <NoticeLinks notice={notice} compact />
      </div>
    </article>
  );
}

function NoticePageSkeleton() {
  return <div className="space-y-5" aria-label="공지사항 로딩 중"><div className="grid min-h-[360px] overflow-hidden rounded-lg border bg-card lg:grid-cols-[22rem_minmax(0,1fr)]"><Skeleton className="min-h-56 rounded-none" /><div className="p-8"><Skeleton className="h-9 w-28" /><Skeleton className="mt-10 h-10 w-full" /><Skeleton className="mt-4 h-10 w-4/5" /></div></div></div>;
}

function NoticeError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-destructive sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5" /><p className="text-sm font-medium">{message}</p></div><Button type="button" variant="outline" size="sm" onClick={onRetry}><RefreshCw className="h-4 w-4" />다시 불러오기</Button></div>;
}

function NoticeEmptyState() {
  return <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-6 py-14 text-center"><Megaphone className="h-8 w-8 text-muted-foreground" /><p className="font-semibold">표시할 공지사항이 없습니다.</p><p className="text-sm text-muted-foreground">새로운 소식이 등록되면 이곳에 표시됩니다.</p></div>;
}
