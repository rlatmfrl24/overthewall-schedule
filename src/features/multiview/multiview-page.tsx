import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  AlertTriangle,
  ExternalLink,
  LayoutGrid,
  MessageSquare,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useScheduleData } from "@/hooks/use-schedule-data";
import { cn } from "@/lib/utils";
import {
  HAS_SCHEDULE_PLUS_EXTENSION_STORE_URL,
  SCHEDULE_PLUS_EXTENSION_INSTALL_URL,
  type SchedulePlusExtensionState,
  type MultiviewWideModeResult,
} from "./schedule-plus-extension";
import {
  MULTIVIEW_CHAT_OPEN_STORAGE_KEY,
  MULTIVIEW_FRAME_SIZE_STORAGE_KEY,
  buildChzzkChatUrl,
  buildChzzkLiveUrl,
  buildMulLiveUrl,
  buildMultiviewSearchParams,
  calculateMultiviewFrameViewport,
  calculateMultiviewGrid,
  dedupeChannelIds,
  getFrameSizePreset,
  parseMultiviewUrlState,
  parseStoredFrameSize,
} from "./multiview-utils";
import type {
  MultiviewFrameSize,
  MultiviewSource,
  MultiviewUrlState,
  SelectedMultiviewSource,
} from "./types";
import { useSchedulePlusExtension } from "./use-schedule-plus-extension";
import { useMultiviewSources } from "./use-multiview-sources";

type MultiviewGridStyle = CSSProperties & {
  "--mv-frame-height": string;
  "--mv-frame-scale": string;
  "--mv-frame-width": string;
  "--mv-tile-header-height": string;
  "--mv-tile-min-height": string;
  "--mv-tile-min-width": string;
};

interface ElementSize {
  height: number;
  width: number;
}

const TILE_HEADER_HEIGHT = 36;

const getInitialUrlState = (): MultiviewUrlState => {
  if (typeof window === "undefined") {
    return { channelIds: [], chatChannelId: null, layout: "auto" };
  }
  return parseMultiviewUrlState(new URLSearchParams(window.location.search));
};

const getInitialFrameSize = (): MultiviewFrameSize => {
  if (typeof window === "undefined") return "comfortable";
  return parseStoredFrameSize(
    window.localStorage.getItem(MULTIVIEW_FRAME_SIZE_STORAGE_KEY),
  );
};

const getInitialChatOpen = () => {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).has("chat")) return true;
  const stored = window.localStorage.getItem(MULTIVIEW_CHAT_OPEN_STORAGE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return true;
};

const useElementSize = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ height: 0, width: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const updateSize = () => {
      setSize({
        height: node.clientHeight,
        width: node.clientWidth,
      });
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
};

const getMediaQueryMatches = (query: string) => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
};

const useMediaQuery = (query: string) => {
  const [matches, setMatches] = useState(() => getMediaQueryMatches(query));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia(query);
    const updateMatches = () => setMatches(mediaQuery.matches);

    updateMatches();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateMatches);
      return () => mediaQuery.removeEventListener("change", updateMatches);
    }

    mediaQuery.addListener(updateMatches);
    return () => mediaQuery.removeListener(updateMatches);
  }, [query]);

  return matches;
};

const getDisplayName = (source: SelectedMultiviewSource) =>
  source.source?.member?.name ??
  source.source?.liveStatus?.channelName ??
  source.channelId.slice(0, 8);

const getSourceName = (source: MultiviewSource) =>
  source.member?.name ?? source.liveStatus?.channelName ?? source.channelId.slice(0, 8);

const formatViewerCount = (value?: number | null) => {
  if (value == null) return null;
  return `${new Intl.NumberFormat("ko-KR").format(value)}명 시청 중`;
};

const getExtensionStatusLabel = (status: SchedulePlusExtensionState["status"]) => {
  switch (status) {
    case "ready":
      return "확장 연결됨";
    case "permission_missing":
      return "권한 확인 필요";
    case "unsupported":
      return "지원 제한";
    case "error":
      return "확인 필요";
    case "missing":
    default:
      return "확장 미설치";
  }
};

const getWideModeIssueLabel = (result?: MultiviewWideModeResult) => {
  switch (result) {
    case "selector_missing":
      return "CHZZK 화면 최적화 버튼을 찾지 못했습니다";
    case "timeout":
      return "CHZZK 프레임 연결을 기다리는 중입니다";
    case "error":
      return "CHZZK 화면 최적화에 실패했습니다";
    default:
      return null;
  }
};

interface ControlTooltipProps {
  label: string;
  children: ReactElement;
}

const ControlTooltip = ({ label, children }: ControlTooltipProps) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent
      align="start"
      className="max-w-72 leading-5"
      side="right"
      sideOffset={10}
    >
      {label}
    </TooltipContent>
  </Tooltip>
);

interface SourceChipProps {
  source: MultiviewSource;
  selected: boolean;
  onClick: (channelId: string) => void;
}

const SourceChip = ({ source, selected, onClick }: SourceChipProps) => {
  const name = getSourceName(source);
  const viewerCount = formatViewerCount(source.liveStatus?.concurrentUserCount);
  const liveTitle = source.liveStatus?.liveTitle?.trim();
  const statusText = source.isLive ? "LIVE" : "OFF";
  const sourceLabel = [
    name,
    source.isLive && liveTitle ? liveTitle : null,
    source.isLive ? viewerCount : null,
    "멀티뷰 선택",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={sourceLabel}
      onClick={() => onClick(source.channelId)}
      className={cn(
        "inline-flex min-h-16 w-full min-w-0 shrink-0 items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
        selected
          ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
          : "border-border bg-background/60 text-foreground hover:border-primary/40 hover:bg-accent",
      )}
    >
      <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {source.member ? (
          <img
            src={`/profile/${source.member.code}.webp`}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <MonitorPlay className="m-2 h-4 w-4 text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {name}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold leading-none",
              source.isLive
                ? "bg-destructive text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {statusText}
          </span>
        </span>
        {source.isLive && liveTitle && (
          <span className="mt-1 block truncate text-xs font-medium text-foreground">
            {liveTitle}
          </span>
        )}
        <span className="mt-1 block truncate text-[11px] font-medium text-muted-foreground">
          {source.isLive ? viewerCount ?? "시청자 수 확인 중" : "현재 방송 없음"}
        </span>
      </span>
    </button>
  );
};

interface SourceControlPanelProps {
  extension: SchedulePlusExtensionState;
  hasSelection: boolean;
  mulLiveUrl: string;
  selectedSet: Set<string>;
  sources: MultiviewSource[];
  sourcesLoading: boolean;
  onClose: () => void;
  onSourceClick: (channelId: string) => void;
}

interface ExtensionStatusPanelProps {
  extension: SchedulePlusExtensionState;
}

const ExtensionStatusPanel = ({ extension }: ExtensionStatusPanelProps) => {
  const extensionReady = extension.status === "ready";
  const extensionMissing = extension.status === "missing";
  const statusLabel = getExtensionStatusLabel(extension.status);

  return (
    <div
      data-testid="schedule-plus-extension-panel"
      className="shrink-0 space-y-2 border-b border-border bg-muted/20 px-3 py-2"
    >
      <div className="flex min-w-0 items-center gap-2">
        <img
          src="/otw-schedule-plus-icon-48.png"
          alt=""
          width={32}
          height={32}
          data-testid="schedule-plus-extension-icon"
          className="h-8 w-8 shrink-0 rounded-lg"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">
            OTW Schedule +
          </span>
          {extensionMissing && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              확장 설치 권장
            </span>
          )}
        </span>
        <span
          className={cn(
            "inline-flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-semibold",
            extensionReady
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {statusLabel}
        </span>
      </div>

      {extensionMissing && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-2.5 py-2 text-[11px] leading-4">
          <p className="font-medium text-foreground">
            확장을 설치하면 화면 자동 정리와 채팅 로그인 기능을 확장 프로그램에서
            관리할 수 있습니다.
          </p>
          <a
            href={SCHEDULE_PLUS_EXTENSION_INSTALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
          >
            {HAS_SCHEDULE_PLUS_EXTENSION_STORE_URL
              ? "Chrome Web Store에서 설치"
              : "설치 안내 보기"}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
};

const SourceControlPanel = ({
  extension,
  hasSelection,
  mulLiveUrl,
  selectedSet,
  sources,
  sourcesLoading,
  onClose,
  onSourceClick,
}: SourceControlPanelProps) => {
  return (
    <aside
      data-testid="multiview-source-panel"
      className="flex h-full w-[clamp(18rem,24vw,22rem)] max-w-[calc(100vw-3rem)] shrink-0 flex-col overflow-hidden border-r border-border bg-card text-card-foreground"
    >
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        <MonitorPlay className="h-4 w-4 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          방송 선택
        </span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onClose}
          aria-label="멀티뷰 패널 닫기"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {hasSelection ? (
        <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground">
          현재 화면이 불편하다면{" "}
          <a
            href={mulLiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="현재 화면이 불편하다면 Mul.Live에서 현재 선택 방송 열기"
            className="inline-flex items-center gap-1 font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            Mul.Live
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          에서 열어볼 수 있습니다.
        </div>
      ) : null}

      <ExtensionStatusPanel extension={extension} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {sources.length > 0 ? (
          sources.map((source) => (
            <SourceChip
              key={source.channelId}
              source={source}
              selected={selectedSet.has(source.channelId)}
              onClick={onSourceClick}
            />
          ))
        ) : (
          <div className="flex h-11 items-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 text-xs text-muted-foreground">
            <MonitorPlay className="h-4 w-4" />
            {sourcesLoading ? "채널 불러오는 중" : "CHZZK 채널 없음"}
          </div>
        )}
      </div>
    </aside>
  );
};

interface PlayerTileProps {
  source: SelectedMultiviewSource;
  wideModeResult?: MultiviewWideModeResult;
  onRemove: (channelId: string) => void;
}

interface ChzzkLiveFrameProps {
  channelId: string;
}

const ChzzkLiveFrame = memo(
  ({ channelId }: ChzzkLiveFrameProps) => (
    <iframe
      data-testid="multiview-live-frame"
      data-channel-id={channelId}
      title={`CHZZK live: ${channelId}`}
      src={buildChzzkLiveUrl(channelId)}
      className="absolute left-0 top-0 block h-[var(--mv-frame-height)] w-[var(--mv-frame-width)] origin-top-left scale-[var(--mv-frame-scale)] border-0"
      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      scrolling="no"
    />
  ),
  (previous, next) => previous.channelId === next.channelId,
);
ChzzkLiveFrame.displayName = "ChzzkLiveFrame";

const PlayerTile = ({
  source,
  wideModeResult,
  onRemove,
}: PlayerTileProps) => {
  const displayName = getDisplayName(source);
  const wideModeIssueLabel = getWideModeIssueLabel(wideModeResult);

  return (
    <article
      data-testid="multiview-player-tile"
      data-channel-id={source.channelId}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm"
    >
      <div className="flex h-[var(--mv-tile-header-height)] shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-2 text-card-foreground">
        <MonitorPlay className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {displayName}
        </span>
        {source.source?.isLive && (
          <span className="rounded-sm bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">
            LIVE
          </span>
        )}
        {wideModeIssueLabel && (
          <ControlTooltip label={wideModeIssueLabel}>
            <span
              tabIndex={0}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40"
              aria-label={wideModeIssueLabel}
            >
              <AlertTriangle className="h-4 w-4" />
            </span>
          </ControlTooltip>
        )}
        <ControlTooltip label="CHZZK에서 열기">
          <a
            href={buildChzzkLiveUrl(source.channelId)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${displayName} CHZZK에서 열기`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </ControlTooltip>
        <ControlTooltip label="제거">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 rounded-md text-muted-foreground hover:bg-destructive hover:text-white"
            onClick={() => onRemove(source.channelId)}
            aria-label={`${displayName} 제거`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </ControlTooltip>
      </div>

      <div
        data-testid="multiview-frame-scroll"
        className="relative min-h-0 flex-1 overflow-hidden overscroll-contain bg-black"
      >
        <ChzzkLiveFrame channelId={source.channelId} />
      </div>
    </article>
  );
};

interface ChatDockProps {
  chatSessionKey: string;
  source: SelectedMultiviewSource;
  selectedSources: SelectedMultiviewSource[];
  onClose: () => void;
  onSelect: (channelId: string) => void;
}

const ChatDock = ({
  chatSessionKey,
  source,
  selectedSources,
  onClose,
  onSelect,
}: ChatDockProps) => {
  const isCredentialless = chatSessionKey !== "enabled";
  const credentiallessProps = isCredentialless
    ? { credentialless: "" }
    : {};

  return (
    <aside
      data-testid="multiview-chat-dock"
      className="flex h-full w-[clamp(20rem,28vw,24rem)] shrink-0 flex-col overflow-hidden border-l border-border bg-card text-card-foreground"
    >
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-2">
        <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
        <select
          aria-label="채팅 방송 선택"
          value={source.channelId}
          onChange={(event) => onSelect(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
        >
          {selectedSources.map((selectedSource) => (
            <option
              key={selectedSource.channelId}
              value={selectedSource.channelId}
            >
              {getDisplayName(selectedSource)}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
          onClick={onClose}
          aria-label="채팅 닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden bg-black">
        <iframe
          key={`${source.channelId}:${isCredentialless ? "guest" : "login"}`}
          title={`${getDisplayName(source)} CHZZK chat`}
          src={buildChzzkChatUrl(source.channelId)}
          className="block h-full w-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          scrolling="yes"
          {...credentiallessProps}
        />
      </div>
    </aside>
  );
};

export const MultiviewPage = () => {
  const [urlState, setUrlState] = useState(getInitialUrlState);
  const [frameSize] = useState(getInitialFrameSize);
  const [chatOpen, setChatOpen] = useState(getInitialChatOpen);
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [pendingOfflineSource, setPendingOfflineSource] =
    useState<MultiviewSource | null>(null);
  const [canvasRef, canvasSize] = useElementSize<HTMLElement>();
  const shouldAutoShowSourcePanel = useMediaQuery("(min-width: 1024px)");
  const isCompactChatViewport = useMediaQuery("(max-width: 1279px)");
  const sourcePanelInitializedRef = useRef(false);
  const { members } = useScheduleData();
  const { sources, loading: sourcesLoading } = useMultiviewSources(members);
  const schedulePlusExtension = useSchedulePlusExtension(urlState.channelIds);

  const selectedSet = useMemo(
    () => new Set(urlState.channelIds),
    [urlState.channelIds],
  );
  const sourceMap = useMemo(
    () => new Map(sources.map((source) => [source.channelId, source])),
    [sources],
  );
  const selectedSources = useMemo<SelectedMultiviewSource[]>(
    () =>
      urlState.channelIds.map((channelId) => ({
        channelId,
        source: sourceMap.get(channelId),
      })),
    [sourceMap, urlState.channelIds],
  );
  const chatSource =
    selectedSources.find((source) => source.channelId === urlState.chatChannelId) ??
    selectedSources[0];
  const framePreset = getFrameSizePreset(frameSize);
  const gridPlan = useMemo(
    () =>
      calculateMultiviewGrid({
        containerHeight: canvasSize.height,
        containerWidth: canvasSize.width,
        layout: urlState.layout,
        preferredTileMinHeight: framePreset.tileMinHeight,
        preferredTileMinWidth: framePreset.tileMinWidth,
        sourceCount: selectedSources.length,
      }),
    [
      canvasSize.height,
      canvasSize.width,
      framePreset.tileMinHeight,
      framePreset.tileMinWidth,
      selectedSources.length,
      urlState.layout,
    ],
  );
  const frameViewport = useMemo(
    () =>
      calculateMultiviewFrameViewport({
        containerHeight: canvasSize.height,
        containerWidth: canvasSize.width,
        frameMinHeight: framePreset.frameMinHeight,
        frameMinWidth: framePreset.frameMinWidth,
        grid: gridPlan,
        layout: urlState.layout,
        tileHeaderHeight: TILE_HEADER_HEIGHT,
      }),
    [
      canvasSize.height,
      canvasSize.width,
      framePreset.frameMinHeight,
      framePreset.frameMinWidth,
      gridPlan,
      urlState.layout,
    ],
  );
  const gridStyle = useMemo<MultiviewGridStyle>(
    () => ({
      "--mv-frame-height": `${frameViewport.height}px`,
      "--mv-frame-scale": `${frameViewport.scale}`,
      "--mv-frame-width": `${frameViewport.width}px`,
      "--mv-tile-header-height": `${TILE_HEADER_HEIGHT}px`,
      "--mv-tile-min-height": `${framePreset.tileMinHeight}px`,
      "--mv-tile-min-width": `${framePreset.tileMinWidth}px`,
      gridTemplateColumns: `repeat(${gridPlan.columns}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${gridPlan.rows}, minmax(0, 1fr))`,
    }),
    [
      framePreset.tileMinHeight,
      framePreset.tileMinWidth,
      frameViewport.height,
      frameViewport.scale,
      frameViewport.width,
      gridPlan.columns,
      gridPlan.rows,
    ],
  );
  const mulLiveUrl = useMemo(
    () => buildMulLiveUrl(urlState.channelIds),
    [urlState.channelIds],
  );
  const canRenderChatDock = !isCompactChatViewport;

  const updateUrlState = useCallback(
    (
      next:
        | MultiviewUrlState
        | ((current: MultiviewUrlState) => MultiviewUrlState),
    ) => {
      setUrlState((current) => {
        const resolved = typeof next === "function" ? next(current) : next;
        const channelIds = dedupeChannelIds(resolved.channelIds);
        const chatChannelId =
          resolved.chatChannelId && channelIds.includes(resolved.chatChannelId)
            ? resolved.chatChannelId
            : channelIds[0] ?? null;
        const normalized = {
          ...resolved,
          channelIds,
          chatChannelId,
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

    const params = buildMultiviewSearchParams(urlState);
    const search = params.toString();
    const normalizedUrl = `${window.location.pathname}${
      search ? `?${search}` : ""
    }${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (currentUrl !== normalizedUrl) {
      window.history.replaceState(null, "", normalizedUrl);
    }
  }, [urlState]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MULTIVIEW_FRAME_SIZE_STORAGE_KEY, frameSize);
  }, [frameSize]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedSources.length === 0) return;
    window.localStorage.setItem(
      MULTIVIEW_CHAT_OPEN_STORAGE_KEY,
      chatOpen ? "1" : "0",
    );
  }, [chatOpen, selectedSources.length]);

  useEffect(() => {
    if (chatOpen && selectedSources.length === 0) {
      setChatOpen(false);
    }
  }, [chatOpen, selectedSources.length]);

  useEffect(() => {
    if (!shouldAutoShowSourcePanel) {
      sourcePanelInitializedRef.current = false;
      setSourcePanelOpen(false);
      return;
    }

    if (!sourcePanelInitializedRef.current) {
      sourcePanelInitializedRef.current = true;
      setSourcePanelOpen(true);
    }
  }, [shouldAutoShowSourcePanel]);

  const addChannel = useCallback(
    (channelId: string) => {
      if (selectedSet.has(channelId)) return;
      if (selectedSet.size === 0) {
        setChatOpen(true);
      }
      updateUrlState((current) => ({
        ...current,
        channelIds: [...current.channelIds, channelId],
        chatChannelId: current.chatChannelId ?? channelId,
      }));
    },
    [selectedSet, updateUrlState],
  );

  const removeChannel = useCallback(
    (channelId: string) => {
      updateUrlState((current) => {
        const channelIds = current.channelIds.filter((id) => id !== channelId);
        return {
          ...current,
          channelIds,
          chatChannelId:
            current.chatChannelId && channelIds.includes(current.chatChannelId)
              ? current.chatChannelId
              : channelIds[0] ?? null,
        };
      });
    },
    [updateUrlState],
  );

  const toggleSource = useCallback(
    (channelId: string) => {
      if (selectedSet.has(channelId)) {
        removeChannel(channelId);
        return;
      }

      const source = sourceMap.get(channelId);
      if (source && !source.isLive) {
        setPendingOfflineSource(source);
        return;
      }

      addChannel(channelId);
    },
    [addChannel, removeChannel, selectedSet, sourceMap],
  );

  const confirmOfflineSource = useCallback(() => {
    if (!pendingOfflineSource) return;
    addChannel(pendingOfflineSource.channelId);
    setPendingOfflineSource(null);
  }, [addChannel, pendingOfflineSource]);

  const selectChatChannel = useCallback(
    (channelId: string) => {
      updateUrlState((current) => ({ ...current, chatChannelId: channelId }));
    },
    [updateUrlState],
  );

  return (
    <main
      data-testid="multiview-root"
      className="flex min-h-0 w-full flex-1 flex-col overflow-hidden bg-background text-foreground"
    >
      <div className="relative flex min-h-0 flex-1">
        {!sourcePanelOpen && (
          <aside
            data-testid="multiview-source-rail"
            className="flex h-full w-11 shrink-0 items-start justify-center border-r border-border bg-card pt-2 text-card-foreground"
          >
            <ControlTooltip label="멀티뷰 패널 열기">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setSourcePanelOpen(true)}
                aria-label="멀티뷰 패널 열기"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
            </ControlTooltip>
          </aside>
        )}

        {sourcePanelOpen && (
          <SourceControlPanel
            extension={schedulePlusExtension}
            hasSelection={selectedSources.length > 0}
            mulLiveUrl={mulLiveUrl}
            selectedSet={selectedSet}
            sources={sources}
            sourcesLoading={sourcesLoading}
            onClose={() => setSourcePanelOpen(false)}
            onSourceClick={toggleSource}
          />
        )}

        <section
          ref={canvasRef}
          data-testid="multiview-canvas"
          className="min-w-0 flex-1 overflow-hidden bg-muted/30"
        >
          {selectedSources.length === 0 ? (
            <div
              data-testid="multiview-empty"
              className="flex min-h-full items-center justify-center p-6 text-center text-muted-foreground"
            >
              <div className="max-w-md rounded-md border border-border bg-card p-6 shadow-sm">
                <LayoutGrid className="mx-auto h-8 w-8 text-primary" />
                <h2 className="mt-3 text-lg font-semibold text-foreground">
                  선택된 방송이 없습니다
                </h2>
                <p className="mt-2 text-sm leading-6">
                  좌측 패널에서 원하는 멤버의 채널을 선택하세요.
                </p>
              </div>
            </div>
          ) : (
            <div
              data-testid="multiview-player-grid"
              className={cn(
                "grid h-full min-h-0 w-full min-w-0 gap-2 p-2",
                urlState.layout === "dense" && "gap-1 p-1",
              )}
              style={gridStyle}
            >
              {selectedSources.map((source) => (
                <PlayerTile
                  key={source.channelId}
                  source={source}
                  wideModeResult={
                    schedulePlusExtension.tileStatuses[source.channelId]
                  }
                  onRemove={removeChannel}
                />
              ))}
            </div>
          )}
        </section>

        {canRenderChatDock && chatOpen && chatSource ? (
          <ChatDock
            chatSessionKey={schedulePlusExtension.chatLoginBridgeStatus}
            source={chatSource}
            selectedSources={selectedSources}
            onClose={() => setChatOpen(false)}
            onSelect={selectChatChannel}
          />
        ) : canRenderChatDock && selectedSources.length > 0 ? (
          <aside
            data-testid="multiview-chat-rail"
            className="flex h-full w-11 shrink-0 items-start justify-center border-l border-border bg-card pt-2 text-card-foreground"
          >
            <ControlTooltip label="채팅 패널 열기">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                onClick={() => setChatOpen(true)}
                aria-label="채팅 패널 열기"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </ControlTooltip>
          </aside>
        ) : null}
      </div>

      <AlertDialog
        open={Boolean(pendingOfflineSource)}
        onOpenChange={(open) => {
          if (!open) setPendingOfflineSource(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>현재 방송 중이 아닙니다</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingOfflineSource
                ? `${getSourceName(pendingOfflineSource)}님은 현재 생방송 중이 아닙니다. 그래도 멀티뷰 창을 추가할까요?`
                : "현재 생방송 중이 아닌 채널입니다. 그래도 멀티뷰 창을 추가할까요?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmOfflineSource}>
              그래도 추가
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};
