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
  it("keeps duplicate performances as distinct queue items", () => {
    let state = createEmptyOtwPlayQueue();
    state = reduceOtwPlayQueue(state, { type: "enqueue", item: item("a", "p") });
    state = reduceOtwPlayQueue(state, { type: "enqueue", item: item("b", "p") });
    expect(state.items.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(state.currentIndex).toBe(0);
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

  it("keeps the current slot fixed during deterministic Fisher-Yates shuffle", () => {
    const initial = {
      ...createEmptyOtwPlayQueue(),
      items: [item("a"), item("b"), item("c"), item("d")],
      currentIndex: 1,
    };
    const state = reduceOtwPlayQueue(initial, {
      type: "shuffle",
      randomValues: [0, 0],
    });
    expect(state.items[1]?.id).toBe("b");
    expect(state.items.map(({ id }) => id)).toEqual(["c", "b", "d", "a"]);
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
});
