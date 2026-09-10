import { describe, expect, it } from "vitest";
import { PLAY_PLAYLIST_MAX_ITEMS } from "@contracts/otw-play-playlists";
import { parsePlaylistWrite } from "./playlist-handler";

const input = (count: number) => ({ title: "목록", description: "", originDefaultId: null,
  performanceIds: Array.from({ length: count }, (_, index) => `p-${index}`) });

describe("playlist write item boundary", () => {
  it("accepts the full limit and rejects an oversized array before identifier validation", () => {
    expect(parsePlaylistWrite(input(PLAY_PLAYLIST_MAX_ITEMS)).performanceIds).toHaveLength(PLAY_PLAYLIST_MAX_ITEMS);
    const oversized = input(PLAY_PLAYLIST_MAX_ITEMS + 1);
    Object.defineProperty(oversized.performanceIds, "0", { get: () => { throw new Error("must not scan oversized input"); } });
    expect(() => parsePlaylistWrite(oversized)).toThrow("PLAY_PLAYLIST_ITEM_LIMIT");
  });
});
