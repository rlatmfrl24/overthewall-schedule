import { describe, expect, it } from "vitest";
import {
  createEmptyOtwPlayQueue,
  findNextPlayableQueueIndex,
  reduceOtwPlayQueue,
  restoreOtwPlayQueue,
  serializeOtwPlayQueue,
  type OtwPlayQueueItem,
} from "./play-queue";

const item = (id: string, performanceId = id): OtwPlayQueueItem => ({
  id,
  performanceId,
  sourceId: `source-${id}`,
});

describe("OTW Play queue", () => {
  it("reorders by identity while preserving the playing source, mode and saved order", () => {
    const state = { items: [item("a"), item("b"), item("c")], currentIndex: 1, repeat: "one" as const, shuffled: true };
    const next = reduceOtwPlayQueue(state, { type: "reorder", itemIds: ["c", "a", "b"] });
    expect(next.items.map(row => row.id)).toEqual(["c", "a", "b"]);
    expect(next.items[next.currentIndex!]).toBe(state.items[1]);
    expect(next.repeat).toBe("one");
    expect(next.shuffled).toBe(true);
    expect(restoreOtwPlayQueue(serializeOtwPlayQueue(next))).toEqual(next);
    for (const itemIds of [["a", "a", "b"], ["a", "b"], ["a", "b", "unknown"]]) {
      expect(reduceOtwPlayQueue(state, { type: "reorder", itemIds })).toBe(state);
    }
    expect(reduceOtwPlayQueue({ ...state, currentIndex: null }, { type: "reorder", itemIds: ["c", "a", "b"] }).currentIndex).toBeNull();
  });
  it("appends a batch without starting playback or changing existing queue state", () => {
    const idle = reduceOtwPlayQueue(createEmptyOtwPlayQueue(), { type: "enqueue_batch", items: [item("a"), item("a-copy", "a")] });
    expect(idle.currentIndex).toBeNull();
    expect(idle.items.map(row => row.id)).toEqual(["a"]);
    const playing = { ...idle, currentIndex: 0, repeat: "one" as const, shuffled: true };
    const next = reduceOtwPlayQueue(playing, { type: "enqueue_batch", items: [item("duplicate", "a"), item("b")] });
    expect(next).toEqual({ ...playing, items: [item("a"), item("b")] });
  });
  it("keeps one queue item per performance", () => {
    let state = createEmptyOtwPlayQueue();
    state = reduceOtwPlayQueue(state, { type: "enqueue", item: item("a", "p") });
    state = reduceOtwPlayQueue(state, { type: "enqueue", item: item("b", "p") });
    expect(state.items.map(({ id }) => id)).toEqual(["a"]);
    expect(state.currentIndex).toBe(0);
  });

  it("selects an existing performance instead of inserting another play item", () => {
    const initial = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b")],
      currentIndex: 0,
    };
    const state = reduceOtwPlayQueue(initial, {
      type: "play",
      item: { ...item("incoming", "b"), sourceId: "alternate" },
    });
    expect(state.items.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(state.items[1]?.sourceId).toBe("alternate");
    expect(state.currentIndex).toBe(1);
  });

  it("inserts play-next after the current item and preserves the current item", () => {
    const initial = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("c")],
      currentIndex: 0,
    };
    const state = reduceOtwPlayQueue(initial, {
      type: "play_next",
      item: item("b"),
    });
    expect(state.items.map(({ id }) => id)).toEqual(["a", "b", "c"]);
    expect(state.currentIndex).toBe(0);
  });

  it("moves an existing performance next without duplicating it", () => {
    const initial = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b"), item("c")],
      currentIndex: 1,
    };
    const state = reduceOtwPlayQueue(initial, {
      type: "play_next",
      item: { ...item("incoming", "a"), sourceId: "alternate" },
    });
    expect(state.items.map(({ id }) => id)).toEqual(["b", "a", "c"]);
    expect(state.items[1]?.sourceId).toBe("alternate");
    expect(state.currentIndex).toBe(0);
  });

  it("moves the current index with keyboard reorder commands", () => {
    const initial = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b"), item("c")],
      currentIndex: 1,
    };
    const state = reduceOtwPlayQueue(initial, {
      type: "move",
      itemId: "b",
      direction: 1,
    });
    expect(state.items.map(({ id }) => id)).toEqual(["a", "c", "b"]);
    expect(state.currentIndex).toBe(2);
  });

  it("toggles random playback without changing visible order or current item", () => {
    const initial = { ...createEmptyOtwPlayQueue(), items: [item("a"), item("b"), item("c"), item("d")], currentIndex: 1 };
    const state = reduceOtwPlayQueue(initial, { type: "shuffle" });
    expect(state.items).toBe(initial.items);
    expect(state.currentIndex).toBe(1);
    expect(state.shuffled).toBe(true);
    expect(reduceOtwPlayQueue(state, { type: "shuffle" })).toEqual(initial);
    expect(findNextPlayableQueueIndex(state, 1, () => true, { random: 0 })).toBe(0);
    expect(findNextPlayableQueueIndex(state, 1, () => true, { random: .99 })).toBe(3);
    const playedIds = new Set(["a", "b", "d"]);
    expect(findNextPlayableQueueIndex(state, 1, () => true, { random: .99, playedIds })).toBe(2);
    playedIds.add("c");
    expect(findNextPlayableQueueIndex(state, 1, () => true, { playedIds })).toBeNull();
    expect(findNextPlayableQueueIndex({ ...state, repeat: "all" }, 1, () => true, { random: 0, playedIds })).toBe(0);
    expect(findNextPlayableQueueIndex({ ...state, repeat: "one" }, 1, () => true, { ended: true })).toBe(1);
    expect(findNextPlayableQueueIndex(state, 1, row => row.id === "c", { random: 0 })).toBe(2);
  });

  it("bounds unavailable skips to one queue traversal", () => {
    const state = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b"), item("c")],
      currentIndex: 0,
      repeat: "all" as const,
    };
    let checks = 0;
    const next = findNextPlayableQueueIndex(state, 1, () => {
      checks += 1;
      return false;
    });
    expect(next).toBeNull();
    expect(checks).toBe(3);
  });

  it("supports repeat-one and repeat-all boundaries", () => {
    const state = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b")],
      currentIndex: 1,
      repeat: "one" as const,
    };
    expect(findNextPlayableQueueIndex(state, 1, () => true, { ended: true })).toBe(1);
    expect(
      findNextPlayableQueueIndex({ ...state, repeat: "all" }, 1, () => true),
    ).toBe(0);
  });

  it("round-trips only the versioned identifier state", () => {
    const state = {
      items: [item("a")],
      currentIndex: 0,
      repeat: "all" as const,
      shuffled: true,
    };
    expect(restoreOtwPlayQueue(serializeOtwPlayQueue(state))).toEqual(state);
    expect(restoreOtwPlayQueue("{bad-json")).toEqual(createEmptyOtwPlayQueue());
    expect(
      restoreOtwPlayQueue(
        JSON.stringify({ ...JSON.parse(serializeOtwPlayQueue(state)), version: 2 }),
      ),
    ).toEqual(createEmptyOtwPlayQueue());
  });

  it("deduplicates legacy session items and preserves the current performance", () => {
    const restored = restoreOtwPlayQueue(
      JSON.stringify({
        version: 1,
        items: [item("a", "same"), item("b", "other"), item("c", "same")],
        currentIndex: 2,
        repeat: "off",
        shuffled: false,
      }),
    );
    expect(restored.items.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(restored.currentIndex).toBe(0);
  });
});
