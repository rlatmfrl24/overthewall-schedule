export const OTW_PLAY_QUEUE_STORAGE_KEY = "otw-play.queue.v1";

export const OTW_PLAY_QUEUE_REPEAT_MODES = ["off", "all", "one"] as const;
export type OtwPlayQueueRepeatMode =
  (typeof OTW_PLAY_QUEUE_REPEAT_MODES)[number];

export interface OtwPlayQueueItem {
  id: string;
  performanceId: string;
  sourceId: string;
}

export interface OtwPlayQueueState {
  items: OtwPlayQueueItem[];
  currentIndex: number | null;
  repeat: OtwPlayQueueRepeatMode;
  shuffled: boolean;
}

export type OtwPlayQueueAction =
  | { type: "play"; item: OtwPlayQueueItem }
  | { type: "enqueue"; item: OtwPlayQueueItem }
  | { type: "play_next"; item: OtwPlayQueueItem }
  | { type: "remove"; itemId: string }
  | { type: "move"; itemId: string; direction: -1 | 1 }
  | { type: "replace_source"; itemId: string; sourceId: string }
  | { type: "select"; index: number }
  | { type: "set_repeat"; repeat: OtwPlayQueueRepeatMode }
  | { type: "shuffle"; randomValues: readonly number[] }
  | { type: "restore"; state: OtwPlayQueueState }
  | { type: "clear" };

export const createEmptyOtwPlayQueue = (): OtwPlayQueueState => ({
  items: [],
  currentIndex: null,
  repeat: "off",
  shuffled: false,
});

const clampCurrentIndex = (
  items: readonly OtwPlayQueueItem[],
  currentIndex: number | null,
) => {
  if (items.length === 0) return null;
  if (currentIndex === null) return 0;
  return Math.min(Math.max(currentIndex, 0), items.length - 1);
};

const moveItem = (
  items: readonly OtwPlayQueueItem[],
  from: number,
  to: number,
) => {
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return next;
  next.splice(to, 0, item);
  return next;
};

export const reduceOtwPlayQueue = (
  state: OtwPlayQueueState,
  action: OtwPlayQueueAction,
): OtwPlayQueueState => {
  if (action.type === "play") {
    const insertionIndex =
      state.currentIndex === null ? state.items.length : state.currentIndex + 1;
    const items = [...state.items];
    items.splice(insertionIndex, 0, action.item);
    return {
      ...state,
      items,
      currentIndex: insertionIndex,
    };
  }
  if (action.type === "enqueue") {
    const items = [...state.items, action.item];
    return {
      ...state,
      items,
      currentIndex: clampCurrentIndex(items, state.currentIndex),
    };
  }
  if (action.type === "play_next") {
    const insertionIndex =
      state.currentIndex === null ? 0 : state.currentIndex + 1;
    const items = [...state.items];
    items.splice(insertionIndex, 0, action.item);
    return {
      ...state,
      items,
      currentIndex: clampCurrentIndex(items, state.currentIndex),
    };
  }
  if (action.type === "remove") {
    const removedIndex = state.items.findIndex(({ id }) => id === action.itemId);
    if (removedIndex < 0) return state;
    const items = state.items.filter(({ id }) => id !== action.itemId);
    let currentIndex = state.currentIndex;
    if (currentIndex !== null) {
      if (removedIndex < currentIndex) currentIndex -= 1;
      else if (removedIndex === currentIndex && currentIndex >= items.length) {
        currentIndex = items.length - 1;
      }
    }
    return {
      ...state,
      items,
      currentIndex: clampCurrentIndex(items, currentIndex),
    };
  }
  if (action.type === "move") {
    const from = state.items.findIndex(({ id }) => id === action.itemId);
    const to = from + action.direction;
    if (from < 0 || to < 0 || to >= state.items.length) return state;
    let currentIndex = state.currentIndex;
    if (currentIndex === from) currentIndex = to;
    else if (currentIndex === to) currentIndex = from;
    return { ...state, items: moveItem(state.items, from, to), currentIndex };
  }
  if (action.type === "replace_source") {
    return {
      ...state,
      items: state.items.map((item) =>
        item.id === action.itemId
          ? { ...item, sourceId: action.sourceId }
          : item,
      ),
    };
  }
  if (action.type === "select") {
    if (action.index < 0 || action.index >= state.items.length) return state;
    return { ...state, currentIndex: action.index };
  }
  if (action.type === "set_repeat") {
    return { ...state, repeat: action.repeat };
  }
  if (action.type === "shuffle") {
    if (state.items.length < 2 || state.currentIndex === null) {
      return { ...state, shuffled: true };
    }
    const items = [...state.items];
    const movableIndexes = items
      .map((_, index) => index)
      .filter((index) => index !== state.currentIndex);
    for (let index = movableIndexes.length - 1; index > 0; index -= 1) {
      const random = action.randomValues[movableIndexes.length - 1 - index] ?? 0;
      const target = Math.min(index, Math.floor(Math.max(0, random) * (index + 1)));
      const leftIndex = movableIndexes[index];
      const rightIndex = movableIndexes[target];
      if (leftIndex === undefined || rightIndex === undefined) continue;
      [items[leftIndex], items[rightIndex]] = [items[rightIndex]!, items[leftIndex]!];
    }
    return { ...state, items, shuffled: true };
  }
  if (action.type === "restore") return action.state;
  return createEmptyOtwPlayQueue();
};

export const findNextPlayableQueueIndex = (
  state: OtwPlayQueueState,
  direction: -1 | 1,
  isPlayable: (item: OtwPlayQueueItem) => boolean,
  options: { ended?: boolean } = {},
) => {
  if (state.currentIndex === null || state.items.length === 0) return null;
  if (
    direction === 1 &&
    options.ended &&
    state.repeat === "one" &&
    isPlayable(state.items[state.currentIndex]!)
  ) {
    return state.currentIndex;
  }

  let index = state.currentIndex;
  for (let inspected = 0; inspected < state.items.length; inspected += 1) {
    index += direction;
    if (index < 0 || index >= state.items.length) {
      if (state.repeat !== "all") return null;
      index = direction === 1 ? 0 : state.items.length - 1;
    }
    const item = state.items[index];
    if (item && isPlayable(item)) return index;
  }
  return null;
};

type StoredQueue = {
  version: 1;
  items: OtwPlayQueueItem[];
  currentIndex: number | null;
  repeat: OtwPlayQueueRepeatMode;
  shuffled: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isQueueItem = (value: unknown): value is OtwPlayQueueItem =>
  isRecord(value) &&
  typeof value.id === "string" &&
  value.id.length > 0 &&
  typeof value.performanceId === "string" &&
  value.performanceId.length > 0 &&
  typeof value.sourceId === "string" &&
  value.sourceId.length > 0;

export const serializeOtwPlayQueue = (state: OtwPlayQueueState) =>
  JSON.stringify({ version: 1, ...state } satisfies StoredQueue);

export const restoreOtwPlayQueue = (raw: string | null): OtwPlayQueueState => {
  if (!raw) return createEmptyOtwPlayQueue();
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !Array.isArray(value.items) ||
      !value.items.every(isQueueItem) ||
      !OTW_PLAY_QUEUE_REPEAT_MODES.includes(
        value.repeat as OtwPlayQueueRepeatMode,
      ) ||
      typeof value.shuffled !== "boolean" ||
      (value.currentIndex !== null &&
        (!Number.isInteger(value.currentIndex) ||
          (value.currentIndex as number) < 0 ||
          (value.currentIndex as number) >= value.items.length))
    ) {
      return createEmptyOtwPlayQueue();
    }
    return {
      items: value.items,
      currentIndex: value.currentIndex as number | null,
      repeat: value.repeat as OtwPlayQueueRepeatMode,
      shuffled: value.shuffled,
    };
  } catch {
    return createEmptyOtwPlayQueue();
  }
};
