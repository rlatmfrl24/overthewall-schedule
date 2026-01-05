import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type Notice } from "@/db/schema";
import { ArrowLeft, Calendar, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="w-full flex-1 overflow-y-auto bg-linear-to-b from-background via-background to-muted/10">
      <div className="max-w-6xl mx-auto w-full px-4 py-6 md:py-10 space-y-6 md:space-y-8">
        <div className="flex items-start gap-4 md:gap-5">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-xl border border-border/40 bg-card/50 backdrop-blur-sm text-foreground/70 hover:text-foreground hover:bg-card hover:border-border/60 hover:shadow-md transition-all duration-200 hover:scale-105"
            onClick={() => {
              router.history.back();
            }}
            aria-label="공지사항 목록으로 돌아가기"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-primary/60" />
                <h1 className="text-3xl font-bold tracking-tight bg-linear-to-r from-foreground via-foreground/95 to-foreground/80 bg-clip-text text-transparent">
                  이벤트 및 공지사항
                </h1>
              </div>
            </div>
            <p className="text-sm md:text-base text-muted-foreground/80 leading-relaxed max-w-2xl">
              최신 소식과 이벤트를 확인하고 놓치지 마세요
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-border/30 bg-card/70 backdrop-blur-sm p-8 text-center text-muted-foreground shadow-sm">
            <div className="inline-flex items-center gap-2">
              <div className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary"></div>
              <span className="text-sm font-medium">불러오는 중입니다...</span>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-destructive/30 bg-destructive/5 backdrop-blur-sm px-6 py-4 text-sm text-destructive shadow-sm">
            <p className="font-medium">{error}</p>
          </div>
        ) : activeNotices.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-muted/50 bg-muted/10 backdrop-blur-sm px-8 py-14 text-center space-y-3 shadow-sm">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/40" />
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
              const isActive = notice.is_active === "1";
              const statusLabel = isActive ? "게시중" : "종료됨";
              const statusClass = isActive
                ? "text-emerald-700 bg-emerald-100/80"
                : "text-rose-600 bg-rose-100/70";

              return (
                <article
                  key={notice.id}
                  className={cn(
                    "group flex h-full flex-col overflow-hidden rounded-3xl border border-border/50 bg-card/90",
                    "shadow-[0_12px_32px_rgba(0,0,0,0.06)] transition-all duration-300 ease-out",
                    "hover:shadow-[0_18px_38px_rgba(0,0,0,0.08)]",
                    "bg-linear-to-br from-background via-card/95 to-muted/20",
                    "backdrop-blur-sm"
                  )}
                >
                  <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "font-semibold border h-7 px-3 shadow-sm transition-all duration-200",
                          "group-hover:scale-105",
                          badge?.badgeClass
                        )}
                      >
                        {badge?.label ?? notice.type}
                      </Badge>
                      <span
                        className={cn(
                          "px-3 py-1 text-xs font-bold rounded-full shadow-sm transition-all duration-200",
                          "group-hover:scale-105",
                          statusClass
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

                  <div className="flex-1 px-6 py-5">
                    <p className="text-lg md:text-xl font-semibold leading-relaxed text-foreground whitespace-pre-wrap tracking-tight">
                      {notice.content}
                    </p>
                  </div>

                  <footer className="flex flex-col gap-3 px-6 pb-6 pt-4 border-t border-border/30">
                    {notice.url ? (
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group/link flex items-center gap-2.5 rounded-xl border border-border/40 bg-linear-to-r from-primary/5 to-primary/3 px-3 py-2 text-sm font-medium text-primary shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-linear-to-r hover:from-primary/10 hover:to-primary/5 hover:shadow-md hover:scale-[1.01] max-w-full"
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
      </div>
    </div>
  );
}
