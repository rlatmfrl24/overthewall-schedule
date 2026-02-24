import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminSectionHeader } from "./components/admin-section-header";

interface SnapshotPreviewManagerProps {
  date: string;
  mode: "grid" | "timeline";
  theme: "light" | "dark";
  onDateChange: (nextDate: string) => void;
  onModeChange: (nextMode: "grid" | "timeline") => void;
  onThemeChange: (nextTheme: "light" | "dark") => void;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MIN_IFRAME_HEIGHT = 640;
const HEIGHT_SYNC_INTERVAL_MS = 200;
const HEIGHT_SYNC_MAX_TICKS = 50;

export function SnapshotPreviewManager({
  date,
  mode,
  theme,
  onDateChange,
  onModeChange,
  onThemeChange,
}: SnapshotPreviewManagerProps) {
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isFrameLoading, setIsFrameLoading] = useState(true);
  const [isFrameError, setIsFrameError] = useState(false);
  const [iframeHeight, setIframeHeight] = useState<number>(MIN_IFRAME_HEIGHT);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const heightSyncTimerRef = useRef<number | null>(null);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const baseUrl = useMemo(
    () =>
      `/snapshot?date=${encodeURIComponent(date)}&mode=${mode}&theme=${theme}`,
    [date, mode, theme],
  );

  const iframeSrc = useMemo(
    () => `${baseUrl}&t=${refreshNonce}`,
    [baseUrl, refreshNonce],
  );

  useEffect(() => {
    if (heightSyncTimerRef.current !== null) {
      window.clearInterval(heightSyncTimerRef.current);
      heightSyncTimerRef.current = null;
    }
    setIsFrameLoading(true);
    setIsFrameError(false);
  }, [iframeSrc]);

  const stopHeightSync = useCallback(() => {
    if (heightSyncTimerRef.current !== null) {
      window.clearInterval(heightSyncTimerRef.current);
      heightSyncTimerRef.current = null;
    }
  }, []);

  const measureIframeHeight = useCallback((): boolean => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return false;

    const snapshotRoot = doc.querySelector<HTMLElement>("[data-snapshot-root='true']");
    const rootHeight = snapshotRoot?.scrollHeight ?? 0;
    const bodyHeight = doc.body?.scrollHeight ?? 0;
    const documentHeight = doc.documentElement?.scrollHeight ?? 0;
    const nextHeight = Math.max(
      rootHeight,
      bodyHeight,
      documentHeight,
      MIN_IFRAME_HEIGHT,
    );

    setIframeHeight((prev) => (prev === nextHeight ? prev : nextHeight));

    return snapshotRoot?.dataset.snapshotReady === "true";
  }, []);

  const startHeightSync = useCallback(() => {
    if (typeof window === "undefined") return;

    stopHeightSync();
    let ticks = 0;

    measureIframeHeight();
    heightSyncTimerRef.current = window.setInterval(() => {
      const isReady = measureIframeHeight();
      ticks += 1;

      if (isReady || ticks >= HEIGHT_SYNC_MAX_TICKS) {
        stopHeightSync();
        measureIframeHeight();
      }
    }, HEIGHT_SYNC_INTERVAL_MS);
  }, [measureIframeHeight, stopHeightSync]);

  useEffect(() => {
    return () => {
      stopHeightSync();
    };
  }, [stopHeightSync]);

  useEffect(() => {
    const handleResize = () => {
      measureIframeHeight();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureIframeHeight]);

  const handleDateInputChange = (value: string) => {
    if (!DATE_REGEX.test(value)) return;
    onDateChange(value);
  };

  const handleRefresh = () => {
    setRefreshNonce((prev) => prev + 1);
  };

  const handleRetry = () => {
    setRefreshNonce((prev) => prev + 1);
  };

  return (
    <section className="space-y-4">
      <AdminSectionHeader
        title="스냅샷 프리뷰"
        description="날짜/모드를 선택해 실제 스냅샷 렌더 결과를 미리 확인합니다."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-4 w-4" />
              <span className="ml-1">새로고침</span>
            </Button>
            <Button size="sm" asChild>
              <a href={baseUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" />
                <span className="ml-1">새 탭 열기</span>
              </a>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">프리뷰 옵션</CardTitle>
          <CardDescription>
            날짜와 모드를 바꾸면 프리뷰가 즉시 갱신됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_220px_220px_auto] md:items-end">
          <div className="space-y-1">
            <Label htmlFor="snapshot-preview-date">날짜</Label>
            <Input
              id="snapshot-preview-date"
              type="date"
              value={date}
              onChange={(event) => handleDateInputChange(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="snapshot-preview-mode">모드</Label>
            <Select
              value={mode}
              onValueChange={(value) => onModeChange(value as "grid" | "timeline")}
            >
              <SelectTrigger id="snapshot-preview-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="grid">일정표(grid)</SelectItem>
                <SelectItem value="timeline">편성표(timeline)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="snapshot-preview-theme">테마</Label>
            <Select
              value={theme}
              onValueChange={(value) => onThemeChange(value as "light" | "dark")}
            >
              <SelectTrigger id="snapshot-preview-theme">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">라이트(light)</SelectItem>
                <SelectItem value="dark">다크(dark)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onDateChange(today)}
            >
              오늘
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">스냅샷 미리보기</CardTitle>
          <CardDescription>
            현재 설정 기준으로 <code>/snapshot</code> 페이지를 렌더링합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="relative p-0">
          <iframe
            ref={iframeRef}
            title="스냅샷 프리뷰"
            src={iframeSrc}
            className="block min-h-[640px] w-full border-0 bg-background"
            style={{ height: `${iframeHeight}px` }}
            onLoad={() => {
              setIsFrameLoading(false);
              setIsFrameError(false);
              startHeightSync();
            }}
            onError={() => {
              setIsFrameLoading(false);
              setIsFrameError(true);
              stopHeightSync();
            }}
          />

          {isFrameLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                프리뷰 로딩 중...
              </div>
            </div>
          ) : null}

          {isFrameError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/95 px-4 text-center">
              <p className="text-sm text-muted-foreground">
                프리뷰를 불러오지 못했습니다. 다시 시도해주세요.
              </p>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                다시 시도
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
