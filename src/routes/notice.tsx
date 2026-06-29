import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ContentPageShell } from "@/components/content-page-shell";
import { Badge } from "@/components/ui/badge";
import { type Notice } from "@/db/schema";
import { Calendar, ExternalLink, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchNotices } from "@/lib/api/notices";
import { isNoticeVisibleOnDate } from "@/lib/notice-visibility";
import { QUERY_STALE_TIME_MS } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass:
      "bg-linear-to-br from-blue-50 to-blue-100/80 text-blue-700 border-blue-200/60 shadow-sm",
  },
  event: {
    label: "이벤트",
    badgeClass:
      "bg-linear-to-br from-purple-50 to-purple-100/80 text-purple-700 border-purple-200/60 shadow-sm",
  },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

export const Route = createFileRoute("/notice")({
  component: NoticePage,
});

function NoticePage() {
  const noticesQuery = useQuery<Notice[]>({
    queryKey: queryKeys.notices.public(),
    queryFn: () => fetchNotices(),
    staleTime: QUERY_STALE_TIME_MS,
  });
  const notices = useMemo(() => noticesQuery.data ?? [], [noticesQuery.data]);

  const activeNotices = useMemo(
    () => notices.filter((notice) => isNoticeVisibleOnDate(notice)),
    [notices],
  );

  return (
    <ContentPageShell
      title="공지사항"
      leadingIcon={<Megaphone className="h-4.5 w-4.5 text-foreground" />}
      contentClassName="max-w-6xl gap-5"
    >
        {noticesQuery.isLoading ? (
          <div className="rounded-lg border border-border/70 bg-card p-8 text-center text-muted-foreground shadow-sm">
            <div className="inline-flex items-center gap-2">
              <div className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"></div>
              <span className="text-sm font-medium">불러오는 중입니다...</span>
            </div>
          </div>
        ) : noticesQuery.error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-4 text-sm text-destructive shadow-sm">
            <p className="font-medium">
              {noticesQuery.error instanceof Error
                ? noticesQuery.error.message
                : "알 수 없는 오류가 발생했습니다."}
            </p>
          </div>
        ) : activeNotices.length === 0 ? (
          <div className="space-y-3 rounded-lg border border-dashed border-border/70 bg-muted/20 px-8 py-14 text-center shadow-sm">
            <Megaphone className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <p className="font-semibold text-base">
              표시할 공지사항이 없습니다.
            </p>
            <p className="text-sm text-muted-foreground/70">
              새로운 소식이 등록되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <section className="grid gap-4 grid-cols-1 auto-rows-fr">
            {activeNotices.map((notice) => {
              const badge = noticeTypeConfigs[notice.type as NoticeTypeKey];
              const period =
                notice.started_at || notice.ended_at
                  ? `${notice.started_at?.replace(/-/g, ".") ?? "..."} ~ ${
                      notice.ended_at?.replace(/-/g, ".") ?? "..."
                    }`
                  : "기간 설정 없음";
              const isActive = notice.is_active === true;
              const statusLabel = isActive ? "게시중" : "종료됨";
              const statusClass = isActive
                ? "text-emerald-700 bg-emerald-100/80"
                : "text-rose-600 bg-rose-100/70";

              return (
                <article
                  key={notice.id}
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-lg border border-border/70 bg-card",
                    "shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md",
                  )}
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-semibold border h-7 px-3 shadow-sm transition-all duration-200",
                          "group-hover:scale-105",
                          badge?.badgeClass,
                        )}
                      >
                        {badge?.label ?? notice.type}
                      </Badge>
                      <span
                        className={cn(
                          "px-3 py-1 text-xs font-bold rounded-full shadow-sm transition-all duration-200",
                          "group-hover:scale-105",
                          statusClass,
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground/80 shadow-sm">
                      <Calendar className="w-4 h-4 text-primary/60 shrink-0" />
                      <span className="tracking-wide">{period}</span>
                    </div>
                  </header>

                  <div className="flex-1 px-4 py-5 sm:px-5">
                    <p className="text-lg md:text-xl font-semibold leading-relaxed text-foreground whitespace-pre-wrap tracking-tight">
                      {notice.content}
                    </p>
                  </div>

                  <footer className="flex flex-col gap-3 border-t border-border/70 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                    {notice.url ? (
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group/link flex max-w-full items-center gap-2.5 rounded-lg border border-border/70 bg-primary/5 px-3 py-2 text-sm font-medium text-primary shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/10 hover:shadow-md"
                        title={notice.url}
                      >
                        <ExternalLink className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover/link:translate-x-0.5" />
                        <span className="break-all line-clamp-1">
                          {notice.url}
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/60 text-sm">
                        <ExternalLink className="w-4 h-4 shrink-0" />
                        <span>연결 링크 없음</span>
                      </div>
                    )}
                  </footer>
                </article>
              );
            })}
          </section>
        )}
    </ContentPageShell>
  );
}
