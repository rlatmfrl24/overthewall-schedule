import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const navigate = useNavigate();

  const loadNotices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notices");
      if (!response.ok) throw new Error("공지사항을 불러오지 못했습니다.");
      const data = (await response.json()) as Notice[];
      setNotices(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
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

  return (
    <div className="w-full flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full px-4 py-6 md:py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              전체 공지사항
            </h1>
            <p className="text-sm text-muted-foreground">
              서비스에 게시된 최신 공지와 이벤트를 확인하세요.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="px-3 gap-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-4 h-4" />
            뒤로가기
          </Button>
        </div>

        <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-transparent to-muted/20 px-4 py-3 text-xs text-muted-foreground shadow-inner">
          <p className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-primary">Tip</span>
            <span>
              최근 공지는 위쪽, 오래된 공지는 아래쪽으로 정렬되며,
              링크가 있는 공지를 통해 상세 페이지를 빠르게 확인할 수 있습니다.
            </span>
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
            불러오는 중입니다...
          </div>
        ) : error ? (
          <div className="rounded-2xl border bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        ) : activeNotices.length === 0 ? (
          <div className="rounded-2xl border bg-muted/30 text-muted-foreground px-6 py-10 text-center space-y-2">
            <p className="font-semibold">표시할 공지사항이 없습니다.</p>
            <p className="text-sm">새로운 소식이 등록되면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="flex flex-col divide-y rounded-[28px] border border-primary/20 bg-gradient-to-br from-card/90 to-muted/70 shadow-[0_15px_45px_rgba(15,23,42,0.15)]">
            {activeNotices.map((notice) => {
              const badge = noticeTypeConfigs[notice.type as NoticeTypeKey];
              const period =
                notice.started_at || notice.ended_at
                  ? `${notice.started_at?.replace(/-/g, ".") ?? "..."} ~ ${
                      notice.ended_at?.replace(/-/g, ".") ?? "..."
                    }`
                  : "기간 설정 없음";

              return (
                <div
                  key={notice.id}
                  className={cn(
                    "flex flex-col gap-3 px-4 py-4 transition-colors",
                    "hover:bg-muted/10"
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "font-medium border shadow-xs h-6",
                        badge?.badgeClass
                      )}
                    >
                      {badge?.label ?? notice.type}
                    </Badge>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                      게시중
                    </span>
                    <span className="text-xs text-muted-foreground">{period}</span>
                  </div>

                  <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground/90">
                    {notice.content}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{period}</span>
                    </div>
                    {notice.url ? (
                      <a
                        href={notice.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/30 hover:bg-muted transition-colors text-foreground"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span className="underline underline-offset-4">
                          {notice.url}
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/10 text-muted-foreground/60 select-none">
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                        <span>연결 링크 없음</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
