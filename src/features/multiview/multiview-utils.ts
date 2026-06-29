import type {
  MultiviewFrameSize,
  MultiviewFrameSizePreset,
  MultiviewGridPlan,
  MultiviewLayoutMode,
  MultiviewUrlState,
} from "./types";

const CHZZK_CHANNEL_ID_PATTERN = /^[a-f0-9]{32}$/i;
const VALID_LAYOUTS = new Set<MultiviewLayoutMode>([
  "auto",
  "dense",
]);

const FRAME_SIZE_PRESETS: Record<MultiviewFrameSize, MultiviewFrameSizePreset> = {
  compact: {
    tileMinWidth: 420,
    tileMinHeight: 320,
    frameMinWidth: 760,
    frameMinHeight: 520,
  },
  comfortable: {
    tileMinWidth: 440,
    tileMinHeight: 360,
    frameMinWidth: 860,
    frameMinHeight: 560,
  },
  source: {
    tileMinWidth: 640,
    tileMinHeight: 460,
    frameMinWidth: 1024,
    frameMinHeight: 680,
  },
};

const DEFAULT_CANVAS_WIDTH = 1280;
const DEFAULT_CANVAS_HEIGHT = 720;
const MIN_GRID_SIZE = 1;

interface MultiviewGridInput {
  containerHeight: number;
  containerWidth: number;
  layout: MultiviewLayoutMode;
  preferredTileMinHeight: number;
  preferredTileMinWidth: number;
  sourceCount: number;
}

interface MultiviewFrameScaleInput {
  containerHeight: number;
  containerWidth: number;
  frameMinHeight: number;
  frameMinWidth: number;
  grid: MultiviewGridPlan;
  layout: MultiviewLayoutMode;
  tileHeaderHeight: number;
}

interface MultiviewFrameViewport {
  height: number;
  scale: number;
  width: number;
}

export const MULTIVIEW_FRAME_SIZE_STORAGE_KEY = "otw:multiview:frame-size:v1";
export const MULTIVIEW_CHAT_OPEN_STORAGE_KEY = "otw:multiview:chat-open:v1";

export function isValidChzzkChannelId(value?: string | null): value is string {
  return Boolean(value && CHZZK_CHANNEL_ID_PATTERN.test(value));
}

export function extractMultiviewChzzkChannelId(input?: string | null) {
  const trimmed = input?.trim();
  if (!trimmed) return null;

  if (isValidChzzkChannelId(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const url = new URL(trimmed);
    if (url.hostname !== "chzzk.naver.com") return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const candidate =
      segments[0] === "live" || segments[0] === "channel"
        ? segments[1]
        : segments[0];

    return isValidChzzkChannelId(candidate) ? candidate.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function dedupeChannelIds(channelIds: string[]) {
  const seen = new Set<string>();
  const nextIds: string[] = [];

  channelIds.forEach((channelId) => {
    const normalized = extractMultiviewChzzkChannelId(channelId);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    nextIds.push(normalized);
  });

  return nextIds;
}

export function parseMultiviewUrlState(params: URLSearchParams): MultiviewUrlState {
  const channelIds = dedupeChannelIds(params.getAll("c"));
  const chatChannelId = extractMultiviewChzzkChannelId(params.get("chat"));
  const layoutParam = params.get("layout") as MultiviewLayoutMode | null;
  const layout =
    layoutParam && VALID_LAYOUTS.has(layoutParam) ? layoutParam : "auto";

  return {
    channelIds,
    chatChannelId:
      chatChannelId && channelIds.includes(chatChannelId)
        ? chatChannelId
        : channelIds[0] ?? null,
    layout,
  };
}

export function buildMultiviewSearchParams(state: MultiviewUrlState) {
  const params = new URLSearchParams();
  const channelIds = dedupeChannelIds(state.channelIds);

  channelIds.forEach((channelId) => params.append("c", channelId));
  if (state.chatChannelId && channelIds.includes(state.chatChannelId)) {
    params.set("chat", state.chatChannelId);
  }
  if (state.layout !== "auto") {
    params.set("layout", state.layout);
  }

  return params;
}

export function buildChzzkLiveUrl(channelId: string) {
  return `https://chzzk.naver.com/live/${channelId}`;
}

export function buildChzzkMultiviewLiveUrl(channelId: string) {
  return `${buildChzzkLiveUrl(channelId)}?multichzzk`;
}

export function buildChzzkChatUrl(channelId: string) {
  return `https://chzzk.naver.com/live/${channelId}/chat`;
}

export function buildMulLiveUrl(channelIds: string[]) {
  const normalized = dedupeChannelIds(channelIds);
  return normalized.length > 0
    ? `https://mul.live/${normalized.join("/")}`
    : "https://mul.live/";
}

export function getFrameSizePreset(size: MultiviewFrameSize) {
  return FRAME_SIZE_PRESETS[size] ?? FRAME_SIZE_PRESETS.comfortable;
}

export function parseStoredFrameSize(value?: string | null): MultiviewFrameSize {
  return value === "compact" || value === "source" || value === "comfortable"
    ? value
    : "comfortable";
}

export function calculateMultiviewGrid({
  containerHeight,
  containerWidth,
  layout,
  preferredTileMinHeight,
  preferredTileMinWidth,
  sourceCount,
}: MultiviewGridInput): MultiviewGridPlan {
  const count = Math.max(0, Math.floor(sourceCount));
  if (count <= 0) return { columns: 1, rows: 1 };

  const width = Math.max(MIN_GRID_SIZE, containerWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(MIN_GRID_SIZE, containerHeight || DEFAULT_CANVAS_HEIGHT);
  const gap = layout === "dense" ? 4 : 8;
  const padding = layout === "dense" ? 4 : 8;
  const targetAspect = layout === "dense" ? 1.25 : 1.4;
  let bestPlan: MultiviewGridPlan = {
    columns: Math.ceil(Math.sqrt(count)),
    rows: Math.ceil(count / Math.ceil(Math.sqrt(count))),
  };
  let bestScore = Number.POSITIVE_INFINITY;

  for (let columns = 1; columns <= count; columns += 1) {
    const rows = Math.ceil(count / columns);
    const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
    const tileHeight = (height - padding * 2 - gap * (rows - 1)) / rows;

    if (tileWidth <= 0 || tileHeight <= 0) continue;

    const aspect = tileWidth / tileHeight;
    const aspectScore = Math.abs(Math.log(aspect / targetAspect));
    const widthScore =
      tileWidth < preferredTileMinWidth
        ? ((preferredTileMinWidth - tileWidth) / preferredTileMinWidth) * 0.55
        : 0;
    const heightScore =
      tileHeight < preferredTileMinHeight
        ? ((preferredTileMinHeight - tileHeight) / preferredTileMinHeight) * 1.25
        : 0;
    const emptySlotScore = (columns * rows - count) * 0.2;
    const densityBias = layout === "dense" ? columns * -0.015 : 0;
    const score =
      aspectScore + widthScore + heightScore + emptySlotScore + densityBias;

    if (
      score < bestScore ||
      (score === bestScore && columns > bestPlan.columns)
    ) {
      bestScore = score;
      bestPlan = { columns, rows };
    }
  }

  return bestPlan;
}

export function calculateMultiviewFrameScale({
  containerHeight,
  containerWidth,
  frameMinHeight,
  frameMinWidth,
  grid,
  layout,
  tileHeaderHeight,
}: MultiviewFrameScaleInput) {
  const width = Math.max(MIN_GRID_SIZE, containerWidth || DEFAULT_CANVAS_WIDTH);
  const height = Math.max(MIN_GRID_SIZE, containerHeight || DEFAULT_CANVAS_HEIGHT);
  const gap = layout === "dense" ? 4 : 8;
  const padding = layout === "dense" ? 4 : 8;
  const columns = Math.max(1, grid.columns);
  const rows = Math.max(1, grid.rows);
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const tileHeight = (height - padding * 2 - gap * (rows - 1)) / rows;
  const frameWidth = Math.max(MIN_GRID_SIZE, frameMinWidth);
  const frameHeight = Math.max(MIN_GRID_SIZE, frameMinHeight);
  const contentWidth = Math.max(MIN_GRID_SIZE, tileWidth - 2);
  const contentHeight = Math.max(MIN_GRID_SIZE, tileHeight - tileHeaderHeight - 2);
  const widthScale = contentWidth / frameWidth;
  const heightScale = contentHeight / frameHeight;
  const scale =
    layout === "dense"
      ? Math.min(Math.max(widthScale, heightScale), 1)
      : Math.min(widthScale, heightScale, 1);

  return Number(Math.max(0.2, scale).toFixed(4));
}

export function calculateMultiviewFrameViewport(
  input: MultiviewFrameScaleInput,
): MultiviewFrameViewport {
  const width = Math.max(
    MIN_GRID_SIZE,
    input.containerWidth || DEFAULT_CANVAS_WIDTH,
  );
  const height = Math.max(
    MIN_GRID_SIZE,
    input.containerHeight || DEFAULT_CANVAS_HEIGHT,
  );
  const gap = input.layout === "dense" ? 4 : 8;
  const padding = input.layout === "dense" ? 4 : 8;
  const columns = Math.max(1, input.grid.columns);
  const rows = Math.max(1, input.grid.rows);
  const tileWidth = (width - padding * 2 - gap * (columns - 1)) / columns;
  const tileHeight = (height - padding * 2 - gap * (rows - 1)) / rows;
  const contentWidth = Math.max(MIN_GRID_SIZE, tileWidth - 2);
  const contentHeight = Math.max(
    MIN_GRID_SIZE,
    tileHeight - input.tileHeaderHeight - 2,
  );
  const scale = calculateMultiviewFrameScale(input);

  return {
    height: Math.ceil(Math.max(input.frameMinHeight, contentHeight / scale)),
    scale,
    width: Math.ceil(Math.max(input.frameMinWidth, contentWidth / scale)),
  };
}
