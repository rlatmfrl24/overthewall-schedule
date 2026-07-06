import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Notice } from "@/db/schema";
import { ChevronRight, ExternalLink, Megaphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { fetchNotices } from "@/lib/api/notices";
import { isNoticeVisibleOnDate } from "@/lib/notice-visibility";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const noticeTypeConfigs = {
  notice: {
    label: "공지",
    badgeClass:
      "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-400/10 dark:text-indigo-200",
    accentClass: "bg-indigo-600",
  },
  event: {
    label: "이벤트",
    badgeClass:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
    accentClass: "bg-amber-500",
  },
} as const;
type NoticeTypeKey = keyof typeof noticeTypeConfigs;

const resolveNoticeType = (value?: string): NoticeTypeKey => {
  if (value && value in noticeTypeConfigs) {
    return value as NoticeTypeKey;
  }
  return "notice";
};

const getNoticeSortTime = (notice: Notice) => {
  if (!notice.created_at) return notice.id ?? 0;

  const time = new Date(String(notice.created_at)).getTime();
  return Number.isNaN(time) ? notice.id ?? 0 : time;
};

const sortNoticesByLatest = (notices: Notice[]) =>
  [...notices].sort((a, b) => {
    const timeDiff = getNoticeSortTime(b) - getNoticeSortTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.id ?? 0) - (a.id ?? 0);
  });

export function NoticeBanner({
  notices: providedNotices,
}: { notices?: Notice[] } = {}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const navigate = useNavigate();
  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),
    staleTime: QUERY_STALE_TIME_MS,
    enabled: providedNotices === undefined,
  });
  const notices = useMemo(
    () => providedNotices ?? noticesQuery.data ?? [],
    [noticesQuery.data, providedNotices],
  );

  const visibleNotices = useMemo(
    () =>
      sortNoticesByLatest(
        notices.filter((notice) => isNoticeVisibleOnDate(notice)),
      ),
    [notices],
  );

  useEffect(() => {
    setCurrentIndex((prev) =>
      visibleNotices.length ? Math.min(prev, visibleNotices.length - 1) : 0,
    );
  }, [visibleNotices.length]);

  useEffect(() => {
    if (visibleNotices.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % visibleNotices.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [visibleNotices.length]);

  const currentNotice = visibleNotices[currentIndex];

  if (!currentNotice) return null;

  const noticeType = resolveNoticeType(currentNotice.type);
  const noticeConfig = noticeTypeConfigs[noticeType];
  const hasLink = Boolean(currentNotice.url);
  const noticeIndexLabel =
    visibleNotices.length > 1
      ? `${currentIndex + 1}/${visibleNotices.length}`
      : null;

  const handleNoticeClick = () => {
    if (hasLink) {
      window.open(currentNotice.url!, "_blank", "noopener,noreferrer");
      return;
    }
    navigate({ to: "/notice" });
  };

  return (
    <div className="h-full w-full" data-snapshot-exclude="true">
      <div className="group/banner relative h-full min-h-12 overflow-hidden rounded-lg border border-border/80 bg-card shadow-sm transition-colors hover:border-foreground/20">
        <div
          className={cn("absolute inset-y-0 left-0 w-1", noticeConfig.accentClass)}
          aria-hidden="true"
        />

        <div className="flex h-full min-h-12 items-center gap-2 py-2 pl-3 pr-2 sm:pl-4 sm:pr-3">
          <Link
            to="/notice"
            title="공지사항&이벤트 전체보기"
            aria-label="공지사항&이벤트 전체보기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground transition-colors group-hover/banner:bg-muted/80"
          >
            <Megaphone className="h-4 w-4" />
          </Link>

          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md px-2 py-1.5 text-left transition-colors",
              "hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            )}
            onClick={handleNoticeClick}
            aria-label={
              hasLink ? "안내 링크 열기" : "공지사항&이벤트 페이지로 이동"
            }
          >
            <div className="relative h-6 min-w-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentNotice.id ?? currentIndex}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="absolute inset-0 flex min-w-0 items-center gap-2"
                  aria-live="polite"
                >
                  <span
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center rounded-md border px-2 text-[11px] font-bold leading-none",
                      noticeConfig.badgeClass,
                    )}
                  >
                    {noticeConfig.label}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-semibold text-foreground sm:text-sm">
                    {currentNotice.content}
                  </span>
                  {hasLink ? (
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </button>

          {noticeIndexLabel ? (
            <span className="hidden shrink-0 text-xs font-semibold text-muted-foreground sm:inline">
              {noticeIndexLabel}
            </span>
          ) : null}

          <Link
            to="/notice"
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-foreground bg-foreground px-2 text-xs font-semibold text-background shadow-xs transition-colors hover:bg-foreground/90 sm:px-3"
          >
            <span className="hidden sm:inline">전체보기</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
