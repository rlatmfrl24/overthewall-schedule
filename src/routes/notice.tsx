import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Notice } from "@/db/schema";
import { ArrowLeft, Calendar, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const noticeTypeConfigs = {
  notice: {
    label: "공지사항",
    badgeClass:
      "bg-blue-100 text-blue-700 hover:bg-blue-100/80 border-blue-200",
  },
  event: {
    label: "이벤트",
    badgeClass:
      "bg-purple-100 text-purple-700 hover:bg-purple-100/80 border-purple-200",
  },
} as const;

type NoticeTypeKey = keyof typeof noticeTypeConfigs;

export const Route = createFileRoute("/notice")({
  component: NoticePage,
});

function NoticePage() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notices");
      if (!response.ok) throw new Error("공지사항을 불러오지 못했습니다.");
      const data = (await response.json()) as Notice[];
      setNotices(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotices();
  }, [loadNotices]);

  const activeNotices = useMemo(
    () => notices.filter((notice) => notice.is_active !== "0"),
    [notices]
  );

  const router = useRouter();

  return (
    <div className="w-full flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-4 py-6 md:py-8 space-y-6">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="border border-border/50 text-foreground hover:text-foreground/80"
            onClick={() => {
              router.history.back();
            }}
            aria-label="공지사항 목록으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 space-y-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                이벤트 및 공지사항
              </h1>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-[28px] border border-border/40 bg-card/80 p-6 text-sm text-muted-foreground shadow-lg">
            불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-inner">
            {error}
          </div>
        ) : activeNotices.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-muted/60 bg-muted/20 px-6 py-10 text-center space-y-2 shadow-sm">
            <p className="font-semibold">표시할 공지사항이 없습니다.</p>
            <p className="text-sm text-muted-foreground">
              새로운 소식이 등록되면 이곳에 표시됩니다.
            </p>
          </div>
        ) : (
          <section className="grid gap-5">
            {activeNotices.map((notice) => {
              const badge = noticeTypeConfigs[notice.type as NoticeTypeKey];
              const period =
                notice.started_at || notice.ended_at
                  ? `${notice.started_at?.replace(/-/g, ".") ?? "..."} ~ ${
                      notice.ended_at?.replace(/-/g, ".") ?? "..."
                    }`
                  : "기간 설정 없음";
              const isActive = notice.is_active === "1";
              const statusLabel = isActive ? "게시중" : "종료됨";
              const statusClass = isActive
                ? "text-emerald-700 bg-emerald-100/80"
                : "text-rose-600 bg-rose-100/70";

              return (
                <article
                  key={notice.id}
                  className="rounded-[28px] border border-border/70 bg-card/80 p-6 shadow-lg"
                >
                  <header className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-semibold border shadow-xs h-6",
                          badge?.badgeClass
                        )}
                      >
                        {badge?.label ?? notice.type}
                      </Badge>
                      <span
                        className={cn(
                          "px-2 py-0.5 text-[11px] font-bold rounded-full",
                          statusClass
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>
                  </header>

                  <p className="mt-4 text-2xl font-bold leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {notice.content}
                  </p>

                  <footer className="mt-6 flex flex-col gap-3 text-xs md:flex-row md:items-center md:justify-start">
                    {notice.url ? (
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-[180px] items-center gap-2 rounded-full border border-border/60 bg-white px-3 py-2 text-primary shadow-sm transition hover:bg-primary/5"
                        title={notice.url}
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-sm font-medium text-primary underline-offset-4 break-all">
                          {notice.url}
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground/80">
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>연결 링크 없음</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 rounded-full border border-border/50 px-4 py-2 text-sm font-semibold text-foreground">
                      <Calendar className="w-4 h-4 text-foreground/70" />
                      <span className="tracking-wide">{period}</span>
                    </div>
                  </footer>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
