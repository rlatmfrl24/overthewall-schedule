import {
  Check,
  ExternalLink,
  MonitorPlay,
  Radio,
  RotateCcw,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { cn } from "@/lib/utils";
import {
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  dedupeMultiviewChannelIds,
  parseMultiviewUrlState,
} from "./multiview-utils";
import type { MultiviewSource, MultiviewUrlState } from "./types";
import { useMultiviewSources } from "./use-multiview-sources";

const SOURCE_PANEL_ID = "multiview-source-panel";

const getInitialUrlState = (): MultiviewUrlState => {
  if (typeof window === "undefined") {
    return { channelIds: [] };
  }

  return parseMultiviewUrlState(new URLSearchParams(window.location.search));
};

const replaceBrowserUrlState = (state: MultiviewUrlState) => {
  if (typeof window === "undefined") return;

  const params = buildMultiviewSearchParams(state);
  const search = params.toString();
  const nextPath = `${window.location.pathname}${search ? `?${search}` : ""}`;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (currentPath === nextPath) return;

  window.history.replaceState(null, "", nextPath);
};

const getSourceName = (source: MultiviewSource) =>
  source.member?.name ??
  source.liveStatus?.channelName ??
  source.channelId.slice(0, 8);

const formatViewerCount = (value?: number | null) => {
  if (value == null) return null;
  return `${new Intl.NumberFormat("ko-KR").format(value)}명 시청 중`;
};

interface SourceListItemProps {
  source: MultiviewSource;
  selected: boolean;
  onClick: (channelId: string) => void;
}

const LiveSourceListItem = ({
  source,
  selected,
  onClick,
}: SourceListItemProps) => {
  const name = getSourceName(source);
  const liveTitle = source.liveStatus?.liveTitle?.trim() || "방송 중";
  const viewerCount = formatViewerCount(
    source.liveStatus?.concurrentUserCount,
  );

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${name} ${selected ? "선택 해제" : "선택"}`}
      onClick={() => onClick(source.channelId)}
      className={cn(
        "grid min-h-16 w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {source.member ? (
          <img
            src={`/profile/${source.member.code}.webp`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <MonitorPlay className="m-2 h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none",
              "bg-destructive text-white",
            )}
          >
            LIVE
          </span>
        </span>
        <span className="mt-1 grid min-w-0 gap-0.5">
          <span className="truncate text-xs font-medium text-foreground">
            {liveTitle}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {viewerCount ?? "시청자 수 미집계"}
          </span>
        </span>
      </span>
      {selected ? (
        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </button>
  );
};

const MemberSourceListItem = ({
  source,
  selected,
  onClick,
}: SourceListItemProps) => {
  const name = getSourceName(source);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${name} ${selected ? "선택 해제" : "선택"}`}
      onClick={() => onClick(source.channelId)}
      className={cn(
        "grid min-h-11 w-full grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2.5 py-2 text-left outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover",
        selected
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-muted">
        {source.member ? (
          <img
            src={`/profile/${source.member.code}.webp`}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <MonitorPlay className="m-1.5 h-4 w-4 text-muted-foreground" />
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium">{name}</span>
        {source.isLive ? (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
        ) : null}
      </span>
      {selected ? (
        <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      ) : null}
    </button>
  );
};

interface SourceSectionProps {
  title: string;
  icon: typeof Radio;
  variant: "live" | "member";
  sources: MultiviewSource[];
  emptyLabel: string;
  selectedSet: Set<string>;
  onToggle: (channelId: string) => void;
}

const SourceSection = ({
  title,
  icon: Icon,
  variant,
  sources,
  emptyLabel,
  selectedSet,
  onToggle,
}: SourceSectionProps) => {
  const Item = variant === "live" ? LiveSourceListItem : MemberSourceListItem;

  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <h3>{title}</h3>
        <span className="ml-auto tabular-nums">{sources.length}</span>
      </div>
      <div className="space-y-2">
        {sources.length > 0 ? (
          sources.map((source) => (
            <Item
              key={source.channelId}
              source={source}
              selected={selectedSet.has(source.channelId)}
              onClick={onToggle}
            />
          ))
        ) : (
          <div className="flex min-h-14 items-center rounded-md border border-dashed border-border bg-background px-3 text-sm text-muted-foreground">
            {emptyLabel}
          </div>
        )}
      </div>
    </section>
  );
};

export function MultiviewPage() {
  const [urlState, setUrlState] = useState(getInitialUrlState);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(true);
  const { loading: membersLoading, members } = useScheduleData();
  const { sources, loading: sourcesLoading } = useMultiviewSources(members);
  const liveSources = useMemo(
    () => sources.filter((source) => source.isLive),
    [sources],
  );
  const selectedSet = useMemo(
    () => new Set(urlState.channelIds),
    [urlState.channelIds],
  );
  const mulLiveUrl = useMemo(
    () => buildMulLiveUrl(urlState.channelIds),
    [urlState.channelIds],
  );

  const updateUrlState = useCallback(
    (
      next:
        | MultiviewUrlState
        | ((current: MultiviewUrlState) => MultiviewUrlState),
    ) => {
      setUrlState((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        return {
          channelIds: dedupeMultiviewChannelIds(resolved.channelIds),
        };
      });
    },
    [],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      replaceBrowserUrlState(urlState);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [urlState]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      setUrlState(
        parseMultiviewUrlState(new URLSearchParams(window.location.search)),
      );
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!sourcePanelOpen || typeof window === "undefined") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSourcePanelOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sourcePanelOpen]);

  const toggleChannel = useCallback(
    (channelId: string) => {
      updateUrlState((current) => {
        const channelIds = selectedSet.has(channelId)
          ? current.channelIds.filter((id) => id !== channelId)
          : [...current.channelIds, channelId];

        return { channelIds };
      });
    },
    [selectedSet, updateUrlState],
  );

  return (
    <main
      data-testid="multiview-root"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background text-foreground"
    >
      <section className="z-30 shrink-0 border-b border-border bg-card text-card-foreground">
        <div className="flex h-12 items-center gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MonitorPlay className="h-4 w-4 shrink-0 text-primary" />
            <h1 className="truncate text-sm font-bold sm:text-base">
              오버더월 멀티뷰
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {urlState.channelIds.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 rounded-md px-2 text-xs"
                onClick={() => updateUrlState({ channelIds: [] })}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                초기화
              </Button>
            ) : null}
            <Button
              type="button"
              variant={sourcePanelOpen ? "secondary" : "outline"}
              size="icon"
              className="relative h-8 w-8 rounded-md"
              aria-label={
                sourcePanelOpen
                  ? "멀티뷰 멤버 목록 닫기"
                  : "멀티뷰 멤버 목록 열기"
              }
              aria-expanded={sourcePanelOpen}
              aria-controls={SOURCE_PANEL_ID}
              title="멤버 목록"
              onClick={() => setSourcePanelOpen((open) => !open)}
            >
              <Users className="h-4 w-4" />
              {urlState.channelIds.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                  {urlState.channelIds.length}
                </span>
              ) : null}
            </Button>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 rounded-md px-2 text-xs"
            >
              <a href={mulLiveUrl} target="_blank" rel="noopener noreferrer">
                Mul.Live
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>
      </section>

      {sourcePanelOpen ? (
        <>
          <button
            type="button"
            aria-label="멀티뷰 멤버 목록 닫기"
            className="absolute inset-x-0 bottom-0 top-12 z-10 bg-black/20"
            onClick={() => setSourcePanelOpen(false)}
          />
          <aside
            id={SOURCE_PANEL_ID}
            aria-label="멀티뷰 멤버 목록"
            className="absolute left-3 right-3 top-14 z-20 max-h-[min(32rem,calc(100%-4rem))] overflow-y-auto rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-xl sm:left-auto sm:right-4 sm:w-[min(34rem,calc(100%-2rem))]"
          >
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 shrink-0 text-primary" />
              <h2 className="text-sm font-semibold">멀티뷰 멤버</h2>
              <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                선택 {urlState.channelIds.length}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7 rounded-md"
                aria-label="멀티뷰 멤버 목록 닫기"
                title="닫기"
                onClick={() => setSourcePanelOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {membersLoading && sources.length === 0 ? (
              <div className="grid gap-2">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="h-14 rounded-md"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <SourceSection
                  title="라이브 리스트"
                  icon={Radio}
                  variant="live"
                  sources={liveSources}
                  emptyLabel={
                    sourcesLoading
                      ? "라이브 상태 불러오는 중"
                      : "현재 라이브 중인 멤버가 없습니다"
                  }
                  selectedSet={selectedSet}
                  onToggle={toggleChannel}
                />
                <SourceSection
                  title="멤버 목록"
                  icon={Users}
                  variant="member"
                  sources={sources}
                  emptyLabel={
                    sourcesLoading ? "채널 불러오는 중" : "CHZZK 채널이 없습니다"
                  }
                  selectedSet={selectedSet}
                  onToggle={toggleChannel}
                />
              </div>
            )}
          </aside>
        </>
      ) : null}

      <section className="min-h-0 flex-1 bg-black">
        <iframe
          key={mulLiveUrl}
          data-testid="multiview-mullive-frame"
          title="Mul.Live 멀티뷰"
          src={mulLiveUrl}
          className="block h-full w-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </section>
    </main>
  );
}
