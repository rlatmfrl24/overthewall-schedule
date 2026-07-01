import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Monitor,
  Palette,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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
const MIN_PREVIEW_VIEWPORT_HEIGHT = 320;
const PREVIEW_VIEWPORT_BOTTOM_GAP = 16;
const PREVIEW_CANVAS_PADDING = 24;
const HEIGHT_SYNC_INTERVAL_MS = 200;
const HEIGHT_SYNC_MAX_TICKS = 50;
const SNAPSHOT_WIDTH_BY_MODE = {
  grid: 1280,
  timeline: 520,
} as const;
const SNAPSHOT_MODE_OPTIONS = [
  { value: "grid", label: "일정표" },
  { value: "timeline", label: "편성표" },
] as const;
const SNAPSHOT_THEME_OPTIONS = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
] as const;

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
  const [previewViewport, setPreviewViewport] = useState({
    width: 0,
    height: MIN_IFRAME_HEIGHT,
  });
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const heightSyncTimerRef = useRef<number | null>(null);

  const today = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const baseUrl = useMemo(
    () =>
      `/snapshot?date=${encodeURIComponent(date)}&mode=${mode}&theme=${theme}`,
    [date, mode, theme],
  );
  const dateLabel = useMemo(() => {
    if (!DATE_REGEX.test(date)) return date;
    const parsedDate = parseISO(date);
    if (Number.isNaN(parsedDate.getTime())) return date;
    return format(parsedDate, "yyyy년 M월 d일");
  }, [date]);
  const modeLabel = mode === "grid" ? "일정표" : "편성표";
  const themeLabel = theme === "dark" ? "다크" : "라이트";
  const snapshotWidth = SNAPSHOT_WIDTH_BY_MODE[mode];
  const widthLabel = `${snapshotWidth}px`;

  const iframeSrc = useMemo(
    () => `${baseUrl}&t=${refreshNonce}`,
    [baseUrl, refreshNonce],
  );
  const previewScale = useMemo(() => {
    const availableWidth = Math.max(
      0,
      previewViewport.width - PREVIEW_CANVAS_PADDING,
    );
    const availableHeight = Math.max(
      0,
      previewViewport.height - PREVIEW_CANVAS_PADDING,
    );
    const widthScale = availableWidth > 0 ? availableWidth / snapshotWidth : 1;
    const heightScale = availableHeight > 0 ? availableHeight / iframeHeight : 1;

    return Math.min(1, widthScale, heightScale);
  }, [iframeHeight, previewViewport.height, previewViewport.width, snapshotWidth]);
  const scaledPreviewHeight = Math.ceil(iframeHeight * previewScale);
  const scaledPreviewWidth = Math.ceil(snapshotWidth * previewScale);
  const previewScaleLabel = `${Math.round(previewScale * 100)}%`;

  const measurePreviewViewport = useCallback(() => {
    if (typeof window === "undefined") return;

    const element = previewViewportRef.current;
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const nextViewport = {
      width: Math.max(0, Math.floor(rect.width)),
      height: Math.max(
        MIN_PREVIEW_VIEWPORT_HEIGHT,
        Math.floor(window.innerHeight - rect.top - PREVIEW_VIEWPORT_BOTTOM_GAP),
      ),
    };

    setPreviewViewport((prev) =>
      prev.width === nextViewport.width && prev.height === nextViewport.height
        ? prev
        : nextViewport,
    );
  }, []);

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
      measurePreviewViewport();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [measureIframeHeight, measurePreviewViewport]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    measurePreviewViewport();

    const element = previewViewportRef.current;
    if (!element || !("ResizeObserver" in window)) return;

    const resizeObserver = new ResizeObserver(() => {
      measurePreviewViewport();
    });
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [measurePreviewViewport]);

  useEffect(() => {
    measurePreviewViewport();
  }, [iframeHeight, measurePreviewViewport, mode]);

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
    <section className="min-h-full">
      <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start 2xl:grid-cols-[232px_minmax(0,1fr)]">
        <Card className="gap-0 overflow-hidden py-0 lg:sticky lg:top-5">
          <header className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold leading-none">옵션</h2>
          </header>
          <CardContent className="space-y-2.5 p-3">
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="snapshot-preview-date">
                날짜
              </Label>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
                <Input
                  id="snapshot-preview-date"
                  type="date"
                  value={date}
                  className="h-8 text-xs"
                  onChange={(event) => handleDateInputChange(event.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => onDateChange(today)}
                >
                  오늘
                </Button>
              </div>
            </div>

            <SnapshotSegmentedControl
              id="snapshot-preview-mode"
              label="모드"
              value={mode}
              options={SNAPSHOT_MODE_OPTIONS}
              onChange={(nextMode) =>
                onModeChange(nextMode as "grid" | "timeline")
              }
            />

            <SnapshotSegmentedControl
              id="snapshot-preview-theme"
              label="테마"
              value={theme}
              options={SNAPSHOT_THEME_OPTIONS}
              onChange={(nextTheme) =>
                onThemeChange(nextTheme as "light" | "dark")
              }
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 gap-0 overflow-hidden py-0 shadow-sm">
          <header className="border-b bg-background/80 px-3 py-2">
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="shrink-0 text-base font-semibold leading-none">
                  스냅샷 미리보기
                </h2>
                <dl className="flex flex-wrap gap-1.5 text-[11px]">
                  <SnapshotPreviewMetaItem
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    label="날짜"
                    value={dateLabel}
                  />
                  <SnapshotPreviewMetaItem
                    icon={<Monitor className="h-3.5 w-3.5" />}
                    label="모드"
                    value={modeLabel}
                  />
                  <SnapshotPreviewMetaItem
                    icon={<Palette className="h-3.5 w-3.5" />}
                    label="테마"
                    value={themeLabel}
                  />
                  <SnapshotPreviewMetaItem
                    icon={<ImageIcon className="h-3.5 w-3.5" />}
                    label="출력"
                    value={widthLabel}
                  />
                  <SnapshotPreviewMetaItem
                    icon={<Monitor className="h-3.5 w-3.5" />}
                    label="보기"
                    value={previewScaleLabel}
                  />
                </dl>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="ml-1">새로고침</span>
                </Button>
                <Button size="sm" className="h-8 px-2" asChild>
                  <a href={baseUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span className="ml-1">새 탭</span>
                  </a>
                </Button>
              </div>
            </div>
          </header>
          <CardContent
            ref={previewViewportRef}
            className="relative overflow-auto bg-muted/20 p-0"
            style={{
              maxHeight: `${previewViewport.height}px`,
            }}
          >
            <div className="flex justify-center p-3">
              <div
                className="shrink-0 overflow-hidden rounded-lg border bg-background shadow-sm"
                style={{
                  width: `${scaledPreviewWidth}px`,
                  height: `${scaledPreviewHeight}px`,
                }}
              >
                <iframe
                  ref={iframeRef}
                  title="스냅샷 프리뷰"
                  src={iframeSrc}
                  className="block border-0 bg-background"
                  style={{
                    width: `${snapshotWidth}px`,
                    height: `${iframeHeight}px`,
                    transform: `scale(${previewScale})`,
                    transformOrigin: "top left",
                  }}
                  onLoad={() => {
                    setIsFrameLoading(false);
                    setIsFrameError(false);
                    startHeightSync();
                    measurePreviewViewport();
                  }}
                  onError={() => {
                    setIsFrameLoading(false);
                    setIsFrameError(true);
                    stopHeightSync();
                  }}
                />
              </div>
            </div>

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
      </div>
    </section>
  );
}

function SnapshotSegmentedControl({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const labelId = `${id}-label`;

  return (
    <div className="space-y-1.5">
      <Label id={labelId} className="text-xs">
        {label}
      </Label>
      <div
        role="group"
        aria-labelledby={labelId}
        className="grid grid-cols-2 gap-1 rounded-md bg-muted/50 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={selected}
              className={cn(
                "h-7 rounded px-2 text-xs",
                selected
                  ? "bg-background text-foreground shadow-sm hover:bg-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={() => {
                if (!selected) onChange(option.value);
              }}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function SnapshotPreviewMetaItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex h-7 items-center gap-1 rounded-full border bg-muted/30 px-2 text-muted-foreground">
      <span aria-hidden="true" className="text-muted-foreground">
        {icon}
      </span>
      <dt className="font-medium">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}
