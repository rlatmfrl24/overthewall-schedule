import { describe, expect, it } from "vitest";
import { parsePlaylistQuery, playlistCursor } from "./playlist-query";
describe("performance cursors", () => {
  it("keeps performance identity and nullable date and binds the cursor to its filter/revision", () => {
    const query = parsePlaylistQuery(new URLSearchParams("member=1&relation=cover"), 4);
    const cursor = playlistCursor(query, 4, { id: "performance-two", releasedAt: null });
    expect(parsePlaylistQuery(new URLSearchParams({ member: "1", relation: "cover", cursor }), 4).after).toEqual({ id: "performance-two", releasedAt: null });
    expect(() => parsePlaylistQuery(new URLSearchParams({ member: "2", relation: "cover", cursor }), 4)).toThrow();
    expect(() => parsePlaylistQuery(new URLSearchParams({ member: "1", relation: "cover", cursor }), 5)).toThrow("PLAY_CURSOR_STALE");
  });
  it.each(["limit=61", "member=-1", "relation=chorus", "q=a&q=b", "sort=random", "cursor=bad"])("rejects %s", query => {
    expect(() => parsePlaylistQuery(new URLSearchParams(query), 1)).toThrow();
  });
});
