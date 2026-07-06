import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MonitorPlay } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { cn } from "@/lib/utils";
import {
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  dedupeChannelIds,
  parseMultiviewUrlState,
} from "./multiview-utils";
import type { MultiviewSource, MultiviewUrlState } from "./types";
import { useMultiviewSources } from "./use-multiview-sources";

const getInitialUrlState = (): MultiviewUrlState => {
  if (typeof window === "undefined") {
    return { channelIds: [] };
  }

  return parseMultiviewUrlState(new URLSearchParams(window.location.search));
};

const getSourceName = (source: MultiviewSource) =>
  source.member?.name ??
  source.liveStatus?.channelName ??
  source.channelId.slice(0, 8);

const formatViewerCount = (value?: number | null) => {
  if (value == null) return null;
  return `${new Intl.NumberFormat("ko-KR").format(value)}명 시청 중`;
};

interface MemberChipProps {
  source: MultiviewSource;
  selected: boolean;
  onClick: (channelId: string) => void;
}

const MemberChip = ({ source, selected, onClick }: MemberChipProps) => {
  const name = getSourceName(source);
  const liveTitle = source.liveStatus?.liveTitle?.trim();
  const viewerCount = formatViewerCount(source.liveStatus?.concurrentUserCount);

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${name} ${selected ? "선택 해제" : "선택"}`}
      onClick={() => onClick(source.channelId)}
      className={cn(
        "inline-flex h-14 min-w-44 max-w-64 shrink-0 items-center gap-2 rounded-md border px-2.5 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10 text-foreground shadow-sm"
          : "border-border bg-card text-card-foreground hover:border-primary/50 hover:bg-accent",
      )}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
        {source.member ? (
          <img
            src={`/profile/${source.member.code}.webp`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <MonitorPlay className="m-2 h-5 w-5 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{name}</span>
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none",
              source.isLive
                ? "bg-destructive text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {source.isLive ? "LIVE" : "OFF"}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
          {source.isLive
            ? viewerCount ?? liveTitle ?? "방송 중"
            : "현재 방송 없음"}
        </span>
      </span>
    </button>
  );
};

export const MultiviewPage = () => {
  const [urlState, setUrlState] = useState(getInitialUrlState);
  const { members } = useScheduleData();
  const { sources, loading: sourcesLoading } = useMultiviewSources(members);
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
        const normalized = {
          channelIds: dedupeChannelIds(resolved.channelIds),
        };

        if (typeof window !== "undefined") {
          const params = buildMultiviewSearchParams(normalized);
          const search = params.toString();
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${search ? `?${search}` : ""}`,
          );
        }

        return normalized;
      });
    },
    [],
  );

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
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <section
        aria-label="멀티뷰 멤버 선택"
        className="shrink-0 border-b border-border bg-background/95 px-3 py-2"
      >
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sources.map((source) => (
            <MemberChip
              key={source.channelId}
              source={source}
              selected={selectedSet.has(source.channelId)}
              onClick={toggleChannel}
            />
          ))}
          {sources.length === 0 && (
            <div className="flex h-14 min-w-64 items-center rounded-md border border-dashed border-border bg-card px-3 text-sm text-muted-foreground">
              {sourcesLoading ? "채널 불러오는 중" : "CHZZK 채널이 없습니다"}
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col bg-muted/20">
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-sm text-muted-foreground">
          <MonitorPlay className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            선택한 멤버 화면을 Mul.Live로 표시합니다.
          </span>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 gap-1 px-2 text-xs"
          >
            <a href={mulLiveUrl} target="_blank" rel="noopener noreferrer">
              새 창으로 열기
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
        <iframe
          key={mulLiveUrl}
          data-testid="multiview-mullive-frame"
          title="Mul.Live 멀티뷰"
          src={mulLiveUrl}
          className="block min-h-0 flex-1 border-0 bg-black"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </section>
    </main>
  );
};
